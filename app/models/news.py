from sqlalchemy import Boolean, Column, Date, Integer, String, Text

from app.models.base import Base


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    tag = Column(String, nullable=True)
    excerpt = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    event_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
