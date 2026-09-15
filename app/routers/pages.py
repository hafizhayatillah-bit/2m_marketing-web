from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(tags=["Public UI"])

# Halaman publik sekarang berupa static HTML (root project), bukan Jinja2 template.
STATIC_PAGES_DIR = Path(__file__).resolve().parent.parent.parent

@router.get("/")
async def render_home():
    return FileResponse(STATIC_PAGES_DIR / "index.html")

@router.get("/product")
async def render_product():
    return FileResponse(STATIC_PAGES_DIR / "product.html")

@router.get("/about")
async def render_about():
    return FileResponse(STATIC_PAGES_DIR / "about.html")

@router.get("/news")
async def render_news():
    return FileResponse(STATIC_PAGES_DIR / "news.html")

@router.get("/contact")
async def render_contact():
    return FileResponse(STATIC_PAGES_DIR / "contact.html")