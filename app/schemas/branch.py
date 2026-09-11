from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    city: str
    latitude: float
    longitude: float
    google_maps_url: Optional[str] = None
    google_drive_url: Optional[str] = None
    whatsapp_number: str
    operating_hours: str
    category_tags: List[str]
