import logging
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.routers import (
    admin_promo,
    admin_products,
    admin_news,
    admin_branches,
    admin_featured_products,
    branches,
    news,
    products,
    promos,
    featured_products,
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import engine, Base, get_db
from app.routers import pages, kiosk
from app.routers import admin_pos

# Kita gunakan Alembic untuk manajemen tabel, jadi tidak perlu Base.metadata.create_all(bind=engine)
app = FastAPI(title="2M Sembako API")

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Daftarkan router
app.include_router(admin_promo.router)
app.include_router(admin_products.router)
app.include_router(admin_news.router)
app.include_router(admin_branches.router)
app.include_router(admin_featured_products.router)
app.include_router(branches.router, prefix="/api/v1/public")
app.include_router(promos.router, prefix="/api/v1/public")
app.include_router(products.router, prefix="/api/v1/public")
app.include_router(news.router, prefix="/api/v1/public")
app.include_router(featured_products.router, prefix="/api/v1/public")
app.include_router(kiosk.router)
app.include_router(admin_pos.router)
app.include_router(pages.router)

# Frontend publik (HTML + Tailwind build + partials) disajikan sebagai static files.
app.mount("/assets", StaticFiles(directory=PROJECT_ROOT / "assets"), name="assets")
app.mount("/partials", StaticFiles(directory=PROJECT_ROOT / "partials"), name="partials")

# Kiosk self-service (build Vite dari kiosk-web/, base "/kiosk/"). Same-origin dengan API, jadi tanpa CORS.
KIOSK_DIST = PROJECT_ROOT / "kiosk-web" / "dist"


def _kiosk_file(path: str):
    target = (KIOSK_DIST / path).resolve()
    # Cegah path traversal keluar dari folder dist.
    if path and target.is_file() and KIOSK_DIST.resolve() in target.parents:
        # File ber-hash di /assets aman di-cache lama; sisanya (qris, logo) sebentar saja.
        if path.startswith("assets/"):
            cache = "public, max-age=31536000, immutable"
        elif path == "sw.js":
            cache = "no-cache"  # service worker harus selalu dicek versi barunya
        else:
            cache = "public, max-age=300"
        media_type = "application/manifest+json" if target.suffix == ".webmanifest" else None
        return FileResponse(target, media_type=media_type, headers={"Cache-Control": cache})
    if path.startswith("assets/"):
        # Aset ber-hash lama yang sudah tidak ada setelah deploy: 404. Kalau dijawab index.html (200), service worker
        # kiosk menyimpannya di cache sebagai file JS/CSS dan tablet bisa layar putih sampai cache dihapus.
        raise HTTPException(status_code=404, detail="Not found")
    index = KIOSK_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Kiosk belum di-build (kiosk-web/dist tidak ada).")
    # index.html jangan di-cache supaya deploy baru langsung terpakai di tablet.
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


@app.get("/kiosk", include_in_schema=False)
def kiosk_index():
    return _kiosk_file("")


@app.get("/kiosk/{path:path}", include_in_schema=False)
def kiosk_spa(path: str):
    return _kiosk_file(path)


# Admin toko kiosk (build Vite dari admin-pos-web/, base "/admin-pos/"), sama seperti /kiosk.
# API-nya di /api/v1/admin (app/routers/admin_pos.py), login cookie sesi.
ADMIN_POS_DIST = PROJECT_ROOT / "admin-pos-web" / "dist"


def _admin_pos_file(path: str):
    target = (ADMIN_POS_DIST / path).resolve()
    if path and target.is_file() and ADMIN_POS_DIST.resolve() in target.parents:
        if path.startswith("assets/"):
            cache = "public, max-age=31536000, immutable"
        elif path in ("sw.js", "manifest.webmanifest"):
            cache = "no-cache"  # service worker & manifest PWA harus selalu dicek versi barunya
        else:
            cache = "public, max-age=300"
        media_type = "application/manifest+json" if target.suffix == ".webmanifest" else None
        return FileResponse(target, media_type=media_type, headers={"Cache-Control": cache})
    if path.startswith("assets/"):
        # Aset lama yang sudah tidak ada setelah deploy: 404, jangan kirim index.html sebagai JS/CSS.
        raise HTTPException(status_code=404, detail="Not found")
    index = ADMIN_POS_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Admin POS belum di-build (admin-pos-web/dist tidak ada).")
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


@app.get("/admin-pos", include_in_schema=False)
def admin_pos_index():
    return _admin_pos_file("")


@app.get("/admin-pos/{path:path}", include_in_schema=False)
def admin_pos_spa(path: str):
    return _admin_pos_file(path)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Browsers dan Google meminta path ini secara default; pakai logo 2M Sembako (persegi).
    return FileResponse(PROJECT_ROOT / "assets" / "images" / "icons" / "favicon.ico", media_type="image/x-icon")

@app.get("/health")
def health():
    """Cek proses app hidup, tanpa menyentuh database."""
    return {"status": "ok"}

@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Cek app + koneksi database benar-benar berhasil."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        # Pesan asli (host pooler, user DB, dsb.) hanya ke log server, bukan ke publik.
        logging.getLogger("health").exception("health/db gagal")
        raise HTTPException(status_code=503, detail="database unreachable")
    return {"status": "ok", "db": "connected"}

# app.mount("/static", StaticFiles(directory="app/static"), name="static")
