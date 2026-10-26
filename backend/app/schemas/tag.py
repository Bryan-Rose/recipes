from pydantic import BaseModel, ConfigDict


class TagBase(BaseModel):
    name: str


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str


class TagRead(TagBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
