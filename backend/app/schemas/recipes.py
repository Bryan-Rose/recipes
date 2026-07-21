from datetime import datetime
from pydantic import BaseModel, ConfigDict


class RecipeBase(BaseModel):
    name: str
    cookbook_id: int | None = None
    cookbook_page: int | None = None
    estimated_time: str


class RecipeCreate(RecipeBase):
    pass


class RecipeUpdate(BaseModel):
    name: str | None = None
    cookbook_id: int | None = None
    cookbook_page: int | None = None
    estimated_time: str | None = None


class RecipeRead(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_user_id: int
    created_at: datetime
    updated_at: datetime
