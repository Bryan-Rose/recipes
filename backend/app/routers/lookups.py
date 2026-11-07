"""One CRUD router per name-only lookup. Routes keep their old names and path
parameter names, so URLs, operation ids and the OpenAPI schema are unchanged."""

# FastAPI reads the per-model schema classes from annotations built at runtime.
# pyright: reportInvalidTypeForm=false

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Author, Ingredient, Measurement, Preparation, Tag
from app.schemas.author import AuthorCreate, AuthorRead, AuthorUpdate
from app.schemas.fields import IdPath
from app.schemas.ingredient import IngredientCreate, IngredientRead, IngredientUpdate
from app.schemas.measurement import MeasurementCreate, MeasurementRead, MeasurementUpdate
from app.schemas.preparation import PreparationCreate, PreparationRead, PreparationUpdate
from app.schemas.tag import TagCreate, TagRead, TagUpdate
from app.services import lookups as service


def _router(model: type, noun: str, read: type[BaseModel], create: type[BaseModel], update: type[BaseModel]) -> APIRouter:
    plural = f"{noun}s"
    router = APIRouter(prefix=f"/{plural}", tags=[plural])
    ItemId = Annotated[IdPath, Path(alias=f"{noun}_id")]
    item_path = f"/{{{noun}_id}}"

    def get_or_404(db: Session, item_id: int) -> object:
        item = service.get_item(db, model, item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return item

    @router.get("/", response_model=list[read], name=f"list_{plural}")
    def list_items(db: Session = Depends(get_db)):
        return service.get_items(db, model)

    @router.get(item_path, response_model=read, name=f"get_{noun}")
    def get_item(item_id: ItemId, db: Session = Depends(get_db)):
        return get_or_404(db, item_id)

    @router.post("/", response_model=read, status_code=status.HTTP_201_CREATED, name=f"create_{noun}")
    def create_item(item_in: create, db: Session = Depends(get_db)):
        return service.create_item(db, model, item_in)

    @router.patch(item_path, response_model=read, name=f"update_{noun}")
    def update_item(item_id: ItemId, item_in: update, db: Session = Depends(get_db)):
        return service.update_item(db, get_or_404(db, item_id), item_in)

    @router.delete(item_path, status_code=status.HTTP_204_NO_CONTENT, name=f"delete_{noun}")
    def delete_item(item_id: ItemId, db: Session = Depends(get_db)):
        service.delete_item(db, get_or_404(db, item_id))

    return router


routers = [
    _router(Author, "author", AuthorRead, AuthorCreate, AuthorUpdate),
    _router(Ingredient, "ingredient", IngredientRead, IngredientCreate, IngredientUpdate),
    _router(Measurement, "measurement", MeasurementRead, MeasurementCreate, MeasurementUpdate),
    _router(Preparation, "preparation", PreparationRead, PreparationCreate, PreparationUpdate),
    _router(Tag, "tag", TagRead, TagCreate, TagUpdate),
]
