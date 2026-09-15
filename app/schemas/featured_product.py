from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class FeaturedProductPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    name: str
    image_url: Optional[str] = None
    position: int


class FeaturedProductListOut(BaseModel):
    items: List[FeaturedProductPublicOut]
    total: int
