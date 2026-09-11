from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Public UI"])

# Arahkan Jinja2 ke folder root templates
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def render_home(request: Request):
    return templates.TemplateResponse(request, "index.html")

@router.get("/products", response_class=HTMLResponse)
async def render_products(request: Request):
    return templates.TemplateResponse(request, "products.html")

@router.get("/news", response_class=HTMLResponse)
async def render_news(request: Request):
    return templates.TemplateResponse(request, "news.html")

@router.get("/contact", response_class=HTMLResponse)
async def render_contact(request: Request):
    return templates.TemplateResponse(request, "contact.html")