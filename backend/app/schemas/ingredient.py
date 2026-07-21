from pydantic import BaseModel, ConfigDict

class IngredientBase(BaseModel):
    name: str


class IngredientCreate(IngredientBase):
    pass


class IngredientUpdate(BaseModel):
    name: str


class IngredientRead(IngredientBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
