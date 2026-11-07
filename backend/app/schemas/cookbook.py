from pydantic import BaseModel, ConfigDict

from app.schemas.author import AuthorRead
from app.schemas.fields import DbId, Name, Omittable, UtcDatetime


class CookbookBase(BaseModel):
    name: Name


class CookbookCreate(CookbookBase):
    author_id: DbId


class CookbookUpdate(BaseModel):
    name: Omittable[Name] = None
    author_id: Omittable[DbId] = None


class CookbookRead(CookbookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: UtcDatetime
    author: AuthorRead
