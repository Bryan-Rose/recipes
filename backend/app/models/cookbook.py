from typing import TYPE_CHECKING
from datetime import datetime
from sqlalchemy import Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.recipe import Recipe


class Cookbook(Base):
    __tablename__ = "cookbooks"
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    recipes: Mapped[list["Recipe"]] = relationship(back_populates="cookbook")
