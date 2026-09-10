from fastapi import FastAPI
from app.routers import admin_promo
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base

# Kita gunakan Alembic untuk manajemen tabel, jadi tidak perlu Base.metadata.create_all(bind=engine)
app = FastAPI(title="2M Sembako API")

# Daftarkan router
app.include_router(admin_promo.router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "2M Sembako API is live!"}

# app.mount("/static", StaticFiles(directory="app/static"), name="static")
