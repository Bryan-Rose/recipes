from fastapi import FastAPI
from app.config import get_settings

from app.routers import ingredients, measurements


settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")


app.include_router(ingredients.router)
app.include_router(measurements.router)
