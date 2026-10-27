from pydantic import BaseModel, ConfigDict

from app.schemas.author import AuthorRead
from app.schemas.fields import DbId, Omittable, UtcDatetime


class CookbookBase(BaseModel):
    name: str


class CookbookCreate(CookbookBase):
    author_id: DbId


class CookbookUpdate(BaseModel):
    name: Omittable[str] = None
    author_id: Omittable[DbId] = None


class CookbookRead(CookbookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: UtcDatetime
    author: AuthorRead
