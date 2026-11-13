from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, PlainTextResponse, Response

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

@router.get("/news/{news_id}")
async def render_news_detail(news_id: int):
    # Satu file statis untuk semua artikel; isinya dimuat via JS dari /api/v1/public/news/{id}.
    return FileResponse(STATIC_PAGES_DIR / "news-detail.html")

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
async def sitemap_xml():
    urls = "".join(f"  <url><loc>{SITE_URL}{path}</loc></url>\n" for path in PUBLIC_PAGES)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}"
        "</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")
