from sqlalchemy import Column, Integer, String, Float, Text, Boolean, DateTime, Date
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Branch(Base):
    __tablename__ = "branches"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    city = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    google_maps_url = Column(String)
    google_drive_url = Column(String)
    whatsapp_number = Column(String)
    operating_hours = Column(String)
    category_tags = Column(String) # Simpan sebagai comma-separated string untuk MVP
    is_active = Column(Boolean, default=True)

class Promo(Base):
    __tablename__ = "promos"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    normal_price = Column(Float, nullable=False)
    promo_price = Column(Float, nullable=False)
    image_url = Column(String)
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, default=True)

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    image_url = Column(String)
    category = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

class News(Base):
    __tablename__ = "news"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    image_url = Column(String)
    event_date = Column(Date)
    is_active = Column(Boolean, default=True)