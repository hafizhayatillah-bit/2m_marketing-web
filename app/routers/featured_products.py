from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cache import get_or_set, invalidate
from app.database import get_db
from app.models import FeaturedProduct, Product
from app.schemas.featured_product import FeaturedProductListOut, FeaturedProductPublicOut

router = APIRouter(prefix="/featured-products", tags=["featured-products"])

CACHE_PREFIX = "featured-products"
CACHE_TTL_SECONDS = 5 * 60  # homepage is hit often; dataset is tiny but cache is what's expensive to skip


def invalidate_featured_products_cache() -> None:
    invalidate(CACHE_PREFIX)


@router.get("", response_model=FeaturedProductListOut)
def list_featured_products(limit: int = 4, offset: int = 0, db: Session = Depends(get_db)):
    cache_key = f"{CACHE_PREFIX}:{limit}:{offset}"

    def load() -> FeaturedProductListOut:
        stmt = (
            select(
                FeaturedProduct.id,
                FeaturedProduct.product_id,
                Product.name,
                func.coalesce(FeaturedProduct.image_url, Product.image_url).label("image_url"),
                FeaturedProduct.position,
            )
            .join(Product, Product.id == FeaturedProduct.product_id)
            .where(FeaturedProduct.is_active == True)
            .order_by(FeaturedProduct.position)
            .limit(limit)
            .offset(offset)
        )
        rows = db.execute(stmt).all()
        items = [FeaturedProductPublicOut.model_validate(row) for row in rows]

        total = db.execute(
            select(func.count()).select_from(FeaturedProduct).where(FeaturedProduct.is_active == True)
        ).scalar_one()

        return FeaturedProductListOut(items=items, total=total)

    return get_or_set(cache_key, CACHE_TTL_SECONDS, load)
