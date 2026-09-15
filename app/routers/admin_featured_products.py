from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import verify_admin
from app.database import get_db
from app.models import FeaturedProduct, Product
from app.routers.featured_products import invalidate_featured_products_cache

router = APIRouter(
    prefix="/admin/featured-products",
    tags=["Admin Featured Products"],
    dependencies=[Depends(verify_admin)],
)
templates = Jinja2Templates(directory="app/templates")


def _get_featured_product_or_404(featured_product_id: int, db: Session) -> FeaturedProduct:
    featured_product = db.get(FeaturedProduct, featured_product_id)
    if featured_product is None:
        raise HTTPException(status_code=404, detail="Produk unggulan tidak ditemukan")
    return featured_product


def _active_products(db: Session) -> list[Product]:
    return db.execute(select(Product).where(Product.is_active == True).order_by(Product.name)).scalars().all()


@router.get("/", response_class=HTMLResponse)
def list_featured_products(request: Request, db: Session = Depends(get_db)):
    featured_products = db.query(FeaturedProduct).order_by(FeaturedProduct.position).all()
    return templates.TemplateResponse(
        request=request,
        name="admin/featured_product/list.html",
        context={"featured_products": featured_products},
    )


@router.get("/create", response_class=HTMLResponse)
def create_featured_product_form(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse(
        request=request,
        name="admin/featured_product/form.html",
        context={"featured_product": None, "products": _active_products(db)},
    )


@router.post("/create")
def create_featured_product(
    product_id: int = Form(...),
    image_url: Optional[str] = Form(None),
    position: int = Form(...),
    db: Session = Depends(get_db),
):
    new_featured_product = FeaturedProduct(product_id=product_id, image_url=image_url or None, position=position)
    db.add(new_featured_product)
    db.commit()
    invalidate_featured_products_cache()
    return RedirectResponse(url="/admin/featured-products/", status_code=303)


@router.get("/{featured_product_id}/edit", response_class=HTMLResponse)
def edit_featured_product_form(featured_product_id: int, request: Request, db: Session = Depends(get_db)):
    featured_product = _get_featured_product_or_404(featured_product_id, db)
    return templates.TemplateResponse(
        request=request,
        name="admin/featured_product/form.html",
        context={"featured_product": featured_product, "products": _active_products(db)},
    )


@router.post("/{featured_product_id}/edit")
def edit_featured_product(
    featured_product_id: int,
    product_id: int = Form(...),
    image_url: Optional[str] = Form(None),
    position: int = Form(...),
    db: Session = Depends(get_db),
):
    featured_product = _get_featured_product_or_404(featured_product_id, db)
    featured_product.product_id = product_id
    featured_product.image_url = image_url or None
    featured_product.position = position
    db.commit()
    invalidate_featured_products_cache()
    return RedirectResponse(url="/admin/featured-products/", status_code=303)


@router.post("/{featured_product_id}/delete")
def delete_featured_product(featured_product_id: int, db: Session = Depends(get_db)):
    featured_product = _get_featured_product_or_404(featured_product_id, db)
    db.delete(featured_product)
    db.commit()
    invalidate_featured_products_cache()
    return RedirectResponse(url="/admin/featured-products/", status_code=303)


@router.post("/{featured_product_id}/toggle-active")
def toggle_featured_product_active(featured_product_id: int, db: Session = Depends(get_db)):
    featured_product = _get_featured_product_or_404(featured_product_id, db)
    featured_product.is_active = not featured_product.is_active
    db.commit()
    invalidate_featured_products_cache()
    return RedirectResponse(url="/admin/featured-products/", status_code=303)
