from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.routers import admin_promo, branches, news, products, promos
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base, get_db
from app.routers import pages

# Kita gunakan Alembic untuk manajemen tabel, jadi tidak perlu Base.metadata.create_all(bind=engine)
app = FastAPI(title="2M Sembako API")

# Daftarkan router
app.include_router(admin_promo.router)
app.include_router(branches.router, prefix="/api/v1/public")
app.include_router(promos.router, prefix="/api/v1/public")
app.include_router(products.router, prefix="/api/v1/public")
app.include_router(news.router, prefix="/api/v1/public")
app.include_router(pages.router)

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
