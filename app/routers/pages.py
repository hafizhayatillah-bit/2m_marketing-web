import html
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import News

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Public UI"])

# Halaman publik sekarang berupa static HTML (root project), bukan Jinja2 template.
STATIC_PAGES_DIR = Path(__file__).resolve().parent.parent.parent

# Domain utama (www & http sudah di-redirect ke sini). Dipakai di sitemap & robots.txt.
SITE_URL = "https://2msembako.id"

# Path halaman publik yang boleh diindeks Google. Tambah di sini kalau ada halaman baru.
PUBLIC_PAGES = ["/", "/product", "/about", "/news", "/contact"]

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

# Tag <head> bawaan news-detail.html yang diganti per artikel. Harus persis sama dengan file-nya.
_DETAIL_TITLE = "<title>Info &amp; Event — 2M Sembako</title>"
_DETAIL_DESCRIPTION = '<meta name="description" content="Promo, event, dan kabar terbaru dari seluruh cabang 2M Sembako.">'
_DETAIL_CANONICAL = '<link rel="canonical" href="https://2msembako.id/news">'


def _plain_summary(item: News, limit: int = 155) -> str:
    """Excerpt artikel, atau potongan isi (tanpa tag HTML) kalau excerpt kosong."""
    text = item.excerpt or re.sub(r"<[^>]+>", " ", item.content or "")
    text = " ".join(html.unescape(text).split())
    if len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return text


@router.get("/news/{news_id}", response_class=HTMLResponse)
def render_news_detail(news_id: int, db: Session = Depends(get_db)):
    # Satu file statis untuk semua artikel; isinya dimuat via JS dari /api/v1/public/news/{id}.
    # Title, description, dan canonical diisi di server supaya Google langsung membaca
    # URL artikel ini sebagai halaman sendiri, bukan duplikat /news.
    page = (STATIC_PAGES_DIR / "news-detail.html").read_text(encoding="utf-8")
    item = db.get(News, news_id)
    if item is None or not item.is_active:
        # Status 404 asli (bukan halaman "tidak ditemukan" berstatus 200) + noindex.
        page = page.replace(_DETAIL_CANONICAL, '<meta name="robots" content="noindex">')
        return HTMLResponse(page, status_code=404)

    url = f"{SITE_URL}/news/{item.id}"
    title = html.escape(f"{item.title} — 2M Sembako")
    summary = html.escape(_plain_summary(item))
    head_tags = [
        f'<link rel="canonical" href="{url}">',
        '  <meta property="og:type" content="article">',
        f'  <meta property="og:url" content="{url}">',
        f'  <meta property="og:title" content="{title}">',
        f'  <meta property="og:description" content="{summary}">',
    ]
    if item.image_url:
        head_tags.append(f'  <meta property="og:image" content="{html.escape(item.image_url)}">')
    page = page.replace(_DETAIL_TITLE, f"<title>{title}</title>")
    page = page.replace(_DETAIL_DESCRIPTION, f'<meta name="description" content="{summary}">')
    page = page.replace(_DETAIL_CANONICAL, "\n".join(head_tags))
    return HTMLResponse(page)

@router.get("/contact")
async def render_contact():
    return FileResponse(STATIC_PAGES_DIR / "contact.html")

@router.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    # /api/ sengaja TIDAK diblokir: produk & berita dimuat via JS dari API,
    # jadi Googlebot butuh akses ke sana untuk melihat isi halaman.
    lines = [
        "User-agent: *",
        "Disallow: /admin/",
        "Disallow: /docs",
        "Disallow: /redoc",
        "",
        f"Sitemap: {SITE_URL}/sitemap.xml",
        "",
    ]
    return PlainTextResponse("\n".join(lines))

@router.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml(db: Session = Depends(get_db)):
    paths = list(PUBLIC_PAGES)
    try:
        ids = db.execute(select(News.id).where(News.is_active == True).order_by(News.id)).scalars()
        paths += [f"/news/{news_id}" for news_id in ids]
    except Exception:
        # Kalau database bermasalah, tetap sajikan halaman statis daripada sitemap error.
        logger.exception("sitemap: gagal mengambil daftar artikel")
    urls = "".join(f"  <url><loc>{SITE_URL}{path}</loc></url>\n" for path in paths)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}"
        "</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")
