from fastapi import Depends, FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.middleware.sessions import SessionMiddleware

from app.auth import get_current_user
from app.config import get_settings
from app.routers import auth, authors, cookbooks, ingredients, measurements, preparations, recipes, tags, users

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")
# Holds OIDC state/nonce/PKCE verifier between the redirect to the IdP and the
# callback. Login sessions use their own cookie (see app/auth.py).
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="recipes_oidc",
    max_age=10 * 60,
    same_site="lax",
    https_only=settings.cookie_secure,
)


# Duplicate names, deleting a row that is still referenced, and references to
# rows that don't exist all surface as IntegrityError.
@app.exception_handler(IntegrityError)
def integrity_error_handler(_request: Request, exc: IntegrityError):
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc.orig)})


signed_in = [Depends(get_current_user)]

app.include_router(auth.router)
app.include_router(authors.router, dependencies=signed_in)
app.include_router(cookbooks.router, dependencies=signed_in)

app.include_router(ingredients.router, dependencies=signed_in)
app.include_router(measurements.router, dependencies=signed_in)
app.include_router(preparations.router, dependencies=signed_in)
app.include_router(tags.router, dependencies=signed_in)
app.include_router(users.router, dependencies=signed_in)

app.include_router(recipes.recipe_router, dependencies=signed_in)
app.include_router(recipes.step_router, dependencies=signed_in)
app.include_router(recipes.requirement_router, dependencies=signed_in)
app.include_router(recipes.recipe_ingredient_router, dependencies=signed_in)

