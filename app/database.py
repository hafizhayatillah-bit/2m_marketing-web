import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# ENV_FILE memungkinkan pakai file env lain (mis. .env.local untuk Postgres lokal) tanpa menyentuh .env.
load_dotenv(os.getenv("ENV_FILE", ".env"), override=True)

# Gunakan env var DATABASE_URL (Supabase Session Pooler di production)
# Ganti 'postgres://' ke 'postgresql://' jika diperlukan oleh SQLAlchemy
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# pool_size/max_overflow kecil karena Supabase free tier membatasi jumlah koneksi total
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=5,
    max_overflow=2,
    pool_pre_ping=True,
    # Supabase butuh SSL; Postgres lokal (docker) biasanya tidak. Set DB_SSLMODE=disable untuk lokal.
    connect_args={"sslmode": os.getenv("DB_SSLMODE", "require")},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        