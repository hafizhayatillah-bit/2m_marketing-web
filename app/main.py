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
from app.database import engine, Base, get_db
from app.routers import pages

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
app.include_router(pages.router)

# Frontend publik (HTML + Tailwind build + partials) disajikan sebagai static files.
app.mount("/assets", StaticFiles(directory=PROJECT_ROOT / "assets"), name="assets")
app.mount("/partials", StaticFiles(directory=PROJECT_ROOT / "partials"), name="partials")

@app.get("/health")
def health():
    """Cek proses app hidup, tanpa menyentuh database."""
    return {"status": "ok"}

@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Cek app + koneksi database benar-benar berhasil."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}")
    return {"status": "ok", "db": "connected"}

# app.mount("/static", StaticFiles(directory="app/static"), name="static")
