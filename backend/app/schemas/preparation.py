from pydantic import BaseModel, ConfigDict

class PreparationBase(BaseModel):
    name: str


class PreparationCreate(PreparationBase):
    pass


class PreparationUpdate(BaseModel):
    name: str


class PreparationRead(PreparationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
