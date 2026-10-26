from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.routers import authors, cookbooks, ingredients, measurements, preparations, recipes, tags, users

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")


# Duplicate names, deleting a row that is still referenced, and references to
# rows that don't exist all surface as IntegrityError.
@app.exception_handler(IntegrityError)
def integrity_error_handler(_request: Request, exc: IntegrityError):
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc.orig)})


app.include_router(authors.router)
app.include_router(cookbooks.router)

app.include_router(ingredients.router)
app.include_router(measurements.router)
app.include_router(preparations.router)
app.include_router(tags.router)
app.include_router(users.router)

app.include_router(recipes.recipe_router)
app.include_router(recipes.step_router)
app.include_router(recipes.requirement_router)
app.include_router(recipes.recipe_ingredient_router)

