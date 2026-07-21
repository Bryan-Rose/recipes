from pydantic import BaseModel, ConfigDict


class AuthorBase(BaseModel):
    name: str


class AuthorCreate(AuthorBase):
    pass


class AuthorUpdate(BaseModel):
    name: str


class AuthorRead(AuthorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
