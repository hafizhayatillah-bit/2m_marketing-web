from typing import Optional

from fastapi import APIRouter, Depends, Request, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.auth import verify_admin
from app.cloudinary_utils import upload_image
from app.database import get_db
from app.models import Product

router = APIRouter(prefix="/admin/products", tags=["Admin Products"], dependencies=[Depends(verify_admin)])
templates = Jinja2Templates(directory="app/templates")


def _get_product_or_404(product_id: int, db: Session) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Produk tidak ditemukan")
    return product


def _existing_categories(db: Session) -> list[str]:
    rows = db.execute(select(distinct(Product.category)).order_by(Product.category)).scalars().all()
    return list(rows)


@router.get("/", response_class=HTMLResponse)
def list_products(request: Request, db: Session = Depends(get_db)):
    products = db.query(Product).order_by(Product.id.desc()).all()
    return templates.TemplateResponse(
        request=request,
        name="admin/product/list.html",
        context={"products": products}
    )


@router.get("/create", response_class=HTMLResponse)
def create_product_form(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse(
        request=request,
        name="admin/product/form.html",
        context={"product": None, "categories": _existing_categories(db)}
    )


@router.post("/create")
def create_product(
    name: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    if image_file and image_file.filename:
        image_url = upload_image(image_file, folder="products")
    new_product = Product(name=name, category=category, description=description, image_url=image_url)
    db.add(new_product)
    db.commit()
    return RedirectResponse(url="/admin/products/", status_code=303)


@router.get("/{product_id}/edit", response_class=HTMLResponse)
def edit_product_form(product_id: int, request: Request, db: Session = Depends(get_db)):
    product = _get_product_or_404(product_id, db)
    return templates.TemplateResponse(
        request=request,
        name="admin/product/form.html",
        context={"product": product, "categories": _existing_categories(db)}
    )


@router.post("/{product_id}/edit")
def edit_product(
    product_id: int,
    name: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    product = _get_product_or_404(product_id, db)
    if image_file and image_file.filename:
        image_url = upload_image(image_file, folder="products")
    product.name = name
    product.category = category
    product.description = description
    product.image_url = image_url
    db.commit()
    return RedirectResponse(url="/admin/products/", status_code=303)


@router.post("/{product_id}/delete")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(product_id, db)
    db.delete(product)
    db.commit()
    return RedirectResponse(url="/admin/products/", status_code=303)


@router.post("/{product_id}/toggle-active")
def toggle_product_active(product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(product_id, db)
    product.is_active = not product.is_active
    db.commit()
    return RedirectResponse(url="/admin/products/", status_code=303)
