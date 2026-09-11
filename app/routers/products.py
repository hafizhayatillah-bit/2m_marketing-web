from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product
from app.schemas.product import ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=List[ProductOut])
def list_products(category: Optional[str] = None, db: Session = Depends(get_db)):
    stmt = select(Product).where(Product.is_active == True)
    if category is not None:
        # exact match: category diisi lewat dropdown terbatas di admin, bukan free text
        stmt = stmt.where(Product.category == category)
    products = db.execute(stmt).scalars().all()

    if products:
        print("Contoh response /api/v1/public/products:", ProductOut.model_validate(products[0]).model_dump())

    return products
