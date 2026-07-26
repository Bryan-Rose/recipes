from fastapi import FastAPI

from app.config import get_settings
from app.routers import authors, cookbooks, ingredients, measurements, preparations, recipes

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")


app.include_router(authors.router)
app.include_router(cookbooks.router)

app.include_router(ingredients.router)
app.include_router(measurements.router)
app.include_router(preparations.router)

app.include_router(recipes.recipe_router)
app.include_router(recipes.step_router)
app.include_router(recipes.requirement_router)
app.include_router(recipes.recipe_ingredient_router)

