from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional

from app.database import get_db
from app.models import Promo

router = APIRouter(prefix="/admin/promos", tags=["Admin Promos"])
templates = Jinja2Templates(directory="app/templates")

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
        name="admin/promo/form.html"
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