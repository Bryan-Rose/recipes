from fastapi import FastAPI
from app.config import get_settings

from app.routers import ingredients, measurements, preparations
from app.routers import authors, cookbooks


settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")


app.include_router(authors.router)
app.include_router(cookbooks.router)

app.include_router(ingredients.router)
app.include_router(measurements.router)
app.include_router(preparations.router)
