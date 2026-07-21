from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CookbookBase(BaseModel):
    name: str
    author: str


class CookbookCreate(CookbookBase):
    pass


class CookbookUpdate(BaseModel):
    name: str | None = None
    author: str | None = None


class CookbookRead(CookbookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
