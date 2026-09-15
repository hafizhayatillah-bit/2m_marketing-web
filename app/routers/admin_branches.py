from typing import Optional

from fastapi import APIRouter, Depends, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.auth import verify_admin
from app.database import get_db
from app.models import Branch

router = APIRouter(prefix="/admin/branches", tags=["Admin Branches"], dependencies=[Depends(verify_admin)])
templates = Jinja2Templates(directory="app/templates")


def _get_branch_or_404(branch_id: int, db: Session) -> Branch:
    branch = db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status_code=404, detail="Cabang tidak ditemukan")
    return branch


def _parse_category_tags(raw: str) -> list[str]:
    return [tag.strip() for tag in raw.split(",") if tag.strip()]


@router.get("/", response_class=HTMLResponse)
def list_branches(request: Request, db: Session = Depends(get_db)):
    branches = db.query(Branch).order_by(Branch.id.desc()).all()
    return templates.TemplateResponse(
        request=request,
        name="admin/branch/list.html",
        context={"branches": branches}
    )


@router.get("/create", response_class=HTMLResponse)
def create_branch_form(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="admin/branch/form.html",
        context={"branch": None}
    )


@router.post("/create")
def create_branch(
    name: str = Form(...),
    address: str = Form(...),
    city: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    whatsapp_number: str = Form(...),
    operating_hours: str = Form(...),
    category_tags: str = Form(""),
    google_maps_url: Optional[str] = Form(None),
    google_drive_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    new_branch = Branch(
        name=name,
        address=address,
        city=city,
        latitude=latitude,
        longitude=longitude,
        whatsapp_number=whatsapp_number,
        operating_hours=operating_hours,
        category_tags=_parse_category_tags(category_tags),
        google_maps_url=google_maps_url,
        google_drive_url=google_drive_url,
    )
    db.add(new_branch)
    db.commit()
    return RedirectResponse(url="/admin/branches/", status_code=303)


@router.get("/{branch_id}/edit", response_class=HTMLResponse)
def edit_branch_form(branch_id: int, request: Request, db: Session = Depends(get_db)):
    branch = _get_branch_or_404(branch_id, db)
    return templates.TemplateResponse(
        request=request,
        name="admin/branch/form.html",
        context={"branch": branch}
    )


@router.post("/{branch_id}/edit")
def edit_branch(
    branch_id: int,
    name: str = Form(...),
    address: str = Form(...),
    city: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    whatsapp_number: str = Form(...),
    operating_hours: str = Form(...),
    category_tags: str = Form(""),
    google_maps_url: Optional[str] = Form(None),
    google_drive_url: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    branch = _get_branch_or_404(branch_id, db)
    branch.name = name
    branch.address = address
    branch.city = city
    branch.latitude = latitude
    branch.longitude = longitude
    branch.whatsapp_number = whatsapp_number
    branch.operating_hours = operating_hours
    branch.category_tags = _parse_category_tags(category_tags)
    branch.google_maps_url = google_maps_url
    branch.google_drive_url = google_drive_url
    db.commit()
    return RedirectResponse(url="/admin/branches/", status_code=303)


@router.post("/{branch_id}/delete")
def delete_branch(branch_id: int, db: Session = Depends(get_db)):
    branch = _get_branch_or_404(branch_id, db)
    db.delete(branch)
    db.commit()
    return RedirectResponse(url="/admin/branches/", status_code=303)


@router.post("/{branch_id}/toggle-active")
def toggle_branch_active(branch_id: int, db: Session = Depends(get_db)):
    branch = _get_branch_or_404(branch_id, db)
    branch.is_active = not branch.is_active
    db.commit()
    return RedirectResponse(url="/admin/branches/", status_code=303)
