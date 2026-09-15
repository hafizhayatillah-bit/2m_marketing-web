from fastapi import APIRouter, Depends, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional

from app.auth import verify_admin
from app.database import get_db
from app.models import Promo

router = APIRouter(prefix="/admin/promos", tags=["Admin Promos"], dependencies=[Depends(verify_admin)])
templates = Jinja2Templates(directory="app/templates")


def _get_promo_or_404(promo_id: int, db: Session) -> Promo:
    promo = db.get(Promo, promo_id)
    if promo is None:
        raise HTTPException(status_code=404, detail="Promo tidak ditemukan")
    return promo


@router.get("/", response_class=HTMLResponse)
def list_promos(request: Request, db: Session = Depends(get_db)):
    promos = db.query(Promo).order_by(Promo.id.desc()).all()
    # Perbaikan: Gunakan keyword arguments eksplisit
    return templates.TemplateResponse(
        request=request, 
        name="admin/promo/list.html", 
        context={"promos": promos}
    )
    
@router.get("/create", response_class=HTMLResponse)
def create_promo_form(request: Request):
    # Perbaikan: Gunakan keyword arguments eksplisit
    return templates.TemplateResponse(
        request=request, 
        name="admin/promo/form.html",
        context={"promo": None}
    )

@router.post("/create")
def create_promo(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    normal_price: float = Form(...),
    promo_price: float = Form(...),
    start_date: Optional[date] = Form(None),
    end_date: Optional[date] = Form(None),
    db: Session = Depends(get_db)
):
    new_promo = Promo(
        title=title, 
        description=description, 
        normal_price=normal_price, 
        promo_price=promo_price,
        start_date=start_date,
        end_date=end_date
    )
    db.add(new_promo)
    db.commit()
    return RedirectResponse(url="/admin/promos/", status_code=303)


@router.get("/{promo_id}/edit", response_class=HTMLResponse)
def edit_promo_form(promo_id: int, request: Request, db: Session = Depends(get_db)):
    promo = _get_promo_or_404(promo_id, db)
    return templates.TemplateResponse(
        request=request,
        name="admin/promo/form.html",
        context={"promo": promo}
    )


@router.post("/{promo_id}/edit")
def edit_promo(
    promo_id: int,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    normal_price: float = Form(...),
    promo_price: float = Form(...),
    start_date: Optional[date] = Form(None),
    end_date: Optional[date] = Form(None),
    db: Session = Depends(get_db),
):
    promo = _get_promo_or_404(promo_id, db)
    promo.title = title
    promo.description = description
    promo.normal_price = normal_price
    promo.promo_price = promo_price
    promo.start_date = start_date
    promo.end_date = end_date
    db.commit()
    return RedirectResponse(url="/admin/promos/", status_code=303)


@router.post("/{promo_id}/delete")
def delete_promo(promo_id: int, db: Session = Depends(get_db)):
    promo = _get_promo_or_404(promo_id, db)
    db.delete(promo)
    db.commit()
    return RedirectResponse(url="/admin/promos/", status_code=303)


@router.post("/{promo_id}/toggle-active")
def toggle_promo_active(promo_id: int, db: Session = Depends(get_db)):
    promo = _get_promo_or_404(promo_id, db)
    promo.is_active = not promo.is_active
    db.commit()
    return RedirectResponse(url="/admin/promos/", status_code=303)
