from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.schemas.author import AuthorRead


class CookbookBase(BaseModel):
    name: str


class CookbookCreate(CookbookBase):
    author_id: int


class CookbookUpdate(BaseModel):
    name: str | None = None
    author_id: int | None = None


class CookbookRead(CookbookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    author: AuthorRead
