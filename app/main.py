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

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Browsers request this path by default even though we only ship an SVG icon.
    return FileResponse(PROJECT_ROOT / "assets" / "favicon.svg", media_type="image/svg+xml")

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

@app.get("/health/admin-env", include_in_schema=False)
def health_admin_env():
    """Sementara: cek ADMIN_USERNAME/PASSWORD ke-set & bebas whitespace, tanpa membocorkan nilainya. Hapus setelah dipakai."""
    import os
    import hashlib
    user = os.getenv("ADMIN_USERNAME", "")
    pwd = os.getenv("ADMIN_PASSWORD", "")
    # Hash dikenal dari nilai lokal .env, cuma buat cocokin tanpa expose nilai asli.
    known_user_hash = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
    known_pwd_hash = "c3634a6fd5bc1bf1bcd878b8bdd716560896af739d375953a59efd61e849e403"
    return {
        "username_set": bool(user),
        "password_set": bool(pwd),
        "username_len": len(user),
        "password_len": len(pwd),
        "username_has_whitespace": user != user.strip(),
        "password_has_whitespace": pwd != pwd.strip(),
        "username_matches_local_env": hashlib.sha256(user.encode()).hexdigest() == known_user_hash,
        "password_matches_local_env": hashlib.sha256(pwd.encode()).hexdigest() == known_pwd_hash,
    }

# app.mount("/static", StaticFiles(directory="app/static"), name="static")
