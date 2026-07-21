from fastapi import FastAPI
from app.config import get_settings

from app.routers import ingredient


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0"
)


app.include_router(ingredient.router)