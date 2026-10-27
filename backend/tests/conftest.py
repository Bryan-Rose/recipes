import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model, same reason as models/__init__.py
from app.auth import SESSION_COOKIE
from app.database import Base, get_db
from app.main import app as fastapi_app
from app.models.user import User
from app.routers import auth as auth_router
from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.recipes import RecipeRead
from app.schemas.tag import TagRead
from app.schemas.user import UserRead
from app.services import auth as auth_service


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def current_user(db_session) -> User:
    # Admin so user-management routes are reachable. No password: hashing is slow,
    # and tests that need one create their own user.
    user = User(username="admin", full_name="Admin", is_superuser=True)
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture()
def client(db_session, current_user):
    """Signed in as current_user through a real session cookie; clear client.cookies for anonymous requests."""

    def override_get_db():
        # The real get_db closes a fresh session per request; this one is
        # shared across requests, so a failed request must roll it back.
        try:
            yield db_session
        except Exception:
            db_session.rollback()
            raise

    fastapi_app.dependency_overrides[get_db] = override_get_db
    auth_router._failed_logins.clear()
    with TestClient(fastapi_app) as test_client:
        test_client.cookies.set(SESSION_COOKIE, auth_service.create_session(db_session, current_user, days=1))
        yield test_client
    fastapi_app.dependency_overrides.clear()


# --- Data fixtures -----------------------------------------------------------
# These go through the public API rather than the ORM on purpose: if a POST
# endpoint breaks, the tests that depend on its output should fail loudly at the
# fixture, not silently pass against hand-built rows the API can't actually make.


@pytest.fixture()
def cookbook(client: TestClient, author: AuthorRead) -> CookbookRead:
    response = client.post(
        "/cookbooks/",
        json={"name": "Mastering the Art of French Cooking", "author_id": author.id},
    )
    return CookbookRead.model_validate(response.json())


@pytest.fixture()
def ingredient(client) -> IngredientRead:
    response = client.post("/ingredients/", json={"name": "butter"})
    return IngredientRead.model_validate(response.json())


@pytest.fixture()
def measurement(client) -> MeasurementRead:
    response = client.post("/measurements/", json={"name": "cup"})
    return MeasurementRead.model_validate(response.json())


@pytest.fixture()
def preparation(client) -> PreparationRead:
    response = client.post("/preparations/", json={"name": "melted"})
    return PreparationRead.model_validate(response.json())


@pytest.fixture()
def recipe(client) -> RecipeRead:
    response = client.post("/recipes/", json={"name": "Beef Bourguignon"})
    return RecipeRead.model_validate(response.json())


@pytest.fixture()
def author(client) -> AuthorRead:
    response = client.post("/authors/", json={"name": "Ina Garten"})
    return AuthorRead.model_validate(response.json())


@pytest.fixture()
def tag(client) -> TagRead:
    response = client.post("/tags/", json={"name": "vegetarian"})
    return TagRead.model_validate(response.json())


@pytest.fixture()
def user(client) -> UserRead:
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret-pw"})
    return UserRead.model_validate(response.json())
