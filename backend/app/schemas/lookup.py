"""Shared shape of the name-only lookups: authors, ingredients, measurements,
preparations and tags. Each keeps its own subclasses so the OpenAPI component
names (TagRead, AuthorCreate, ...) stay as the frontend knows them."""

from pydantic import BaseModel, ConfigDict


class LookupWrite(BaseModel):
    name: str


class LookupRead(LookupWrite):
    model_config = ConfigDict(from_attributes=True)

    id: int
