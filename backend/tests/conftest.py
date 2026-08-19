import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model, same reason as models/__init__.py
from app.database import Base, get_db
from app.main import app as fastapi_app
from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.recipes import RecipeRead


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


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as test_client:
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
