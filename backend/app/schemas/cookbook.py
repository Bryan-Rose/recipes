from pydantic import BaseModel, ConfigDict

from app.schemas.author import AuthorRead
from app.schemas.fields import DbId, UtcDatetime


class CookbookBase(BaseModel):
    name: str


class CookbookCreate(CookbookBase):
    author_id: DbId


class CookbookUpdate(BaseModel):
    name: str | None = None
    author_id: DbId | None = None


class CookbookRead(CookbookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: UtcDatetime
    author: AuthorRead
