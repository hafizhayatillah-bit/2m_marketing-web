from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, Request, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.auth import verify_admin
from app.cloudinary_utils import upload_image
from app.database import get_db
from app.models import News

router = APIRouter(prefix="/admin/news", tags=["Admin News"], dependencies=[Depends(verify_admin)])
templates = Jinja2Templates(directory="app/templates")


def _get_news_or_404(news_id: int, db: Session) -> News:
    news = db.get(News, news_id)
    if news is None:
        raise HTTPException(status_code=404, detail="Berita tidak ditemukan")
    return news


@router.get("/", response_class=HTMLResponse)
def list_news(request: Request, db: Session = Depends(get_db)):
    news_items = db.query(News).order_by(News.event_date.desc()).all()
    return templates.TemplateResponse(
        request=request,
        name="admin/news/list.html",
        context={"news_items": news_items}
    )


@router.get("/create", response_class=HTMLResponse)
def create_news_form(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="admin/news/form.html",
        context={"news": None}
    )


@router.post("/create")
def create_news(
    title: str = Form(...),
    tag: Optional[str] = Form(None),
    excerpt: Optional[str] = Form(None),
    content: str = Form(...),
    event_date: date = Form(...),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    if image_file and image_file.filename:
        image_url = upload_image(image_file, folder="news")
    new_news = News(title=title, tag=tag, excerpt=excerpt, content=content, event_date=event_date, image_url=image_url)
    db.add(new_news)
    db.commit()
    return RedirectResponse(url="/admin/news/", status_code=303)


@router.get("/{news_id}/edit", response_class=HTMLResponse)
def edit_news_form(news_id: int, request: Request, db: Session = Depends(get_db)):
    news = _get_news_or_404(news_id, db)
    return templates.TemplateResponse(
        request=request,
        name="admin/news/form.html",
        context={"news": news}
    )


@router.post("/{news_id}/edit")
def edit_news(
    news_id: int,
    title: str = Form(...),
    tag: Optional[str] = Form(None),
    excerpt: Optional[str] = Form(None),
    content: str = Form(...),
    event_date: date = Form(...),
    image_url: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    news = _get_news_or_404(news_id, db)
    if image_file and image_file.filename:
        image_url = upload_image(image_file, folder="news")
    news.title = title
    news.tag = tag
    news.excerpt = excerpt
    news.content = content
    news.event_date = event_date
    news.image_url = image_url
    db.commit()
    return RedirectResponse(url="/admin/news/", status_code=303)


@router.post("/{news_id}/delete")
def delete_news(news_id: int, db: Session = Depends(get_db)):
    news = _get_news_or_404(news_id, db)
    db.delete(news)
    db.commit()
    return RedirectResponse(url="/admin/news/", status_code=303)


@router.post("/{news_id}/toggle-active")
def toggle_news_active(news_id: int, db: Session = Depends(get_db)):
    news = _get_news_or_404(news_id, db)
    news.is_active = not news.is_active
    db.commit()
    return RedirectResponse(url="/admin/news/", status_code=303)
