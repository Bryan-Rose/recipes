import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.main import app as fastapi_app
from app.models import RecipeImportRecord
from app.models.user import User
from app.services import users as users_service
from app.services.users import hash_password
from tests.test_imports import FakeApi, fake_api  # noqa: F401 — fixture

## The startup check


@pytest.mark.parametrize("subnets", ["", "   ", "192.168.1.0/33", "192.168.1", "300.1.1.1", "fd00::/8", "all", "10.0.0.0/255.0.0.0"])
def test_login_free_mode_refuses_a_missing_or_bad_subnet_list(subnets: str):
    with pytest.raises(ValidationError, match="RECIPES_ALLOWED_SUBNETS"):
        Settings(auth_enabled=False, allowed_subnets=subnets)


def test_the_error_names_the_bad_entry():
    with pytest.raises(ValidationError, match="'fd00::/8'"):
        Settings(auth_enabled=False, allowed_subnets="192.168.1.0/24 fd00::/8")


def test_a_valid_list_starts():
    assert Settings(auth_enabled=False, allowed_subnets="192.168.1.0/24 10.0.0.5").auth_enabled is False


def test_login_mode_ignores_the_list():
    assert Settings(allowed_subnets="not a subnet").auth_enabled is True


## The household user


@pytest.fixture()
def login_free(client: TestClient):
    settings = fastapi_app.dependency_overrides[get_settings]().model_copy(update={"auth_enabled": False})
    fastapi_app.dependency_overrides[get_settings] = lambda: settings
    client.cookies.clear()
    return settings


def _household(db: Session) -> list[User]:
    return list(db.execute(select(User).where(User.username == "household")).scalars())


def test_requests_act_as_the_household_admin(client: TestClient, db_session: Session, login_free):
    me = client.get("/auth/me")

    assert me.status_code == 200
    assert me.json()["username"] == "household"
    assert me.json()["is_superuser"] is True
    assert client.get("/auth/me").json()["id"] == me.json()["id"]
    assert len(_household(db_session)) == 1
    assert _household(db_session)[0].hashed_password is None


def test_a_session_cookie_is_ignored(client: TestClient, current_user: User):
    # client is signed in as current_user; turning logins off must not keep that identity.
    settings = fastapi_app.dependency_overrides[get_settings]().model_copy(update={"auth_enabled": False})
    fastapi_app.dependency_overrides[get_settings] = lambda: settings

    assert client.get("/auth/me").json()["username"] == "household"


def test_a_concurrent_first_insert_falls_back_to_the_existing_row(db_session: Session, monkeypatch: pytest.MonkeyPatch):
    # Another request created the user after this one looked: the first lookup misses, the insert hits the unique name.
    other = User(username="household", full_name="Household", is_superuser=True)
    db_session.add(other)
    db_session.commit()
    real_execute = db_session.execute
    calls = []

    def first_lookup_misses(*args, **kwargs):
        calls.append(args)
        result = real_execute(*args, **kwargs)
        return result if len(calls) > 1 else type("Miss", (), {"scalar_one_or_none": lambda self: None})()

    monkeypatch.setattr(db_session, "execute", first_lookup_misses)

    assert users_service.get_or_create_household(db_session).id == other.id
    assert len(calls) == 2
    monkeypatch.undo()
    assert len(_household(db_session)) == 1


def test_writes_are_attributed_to_the_household_user(
    client: TestClient,
    db_session: Session,
    current_user: User,
    fake_api: FakeApi,  # noqa: F811
):
    earlier = client.post("/recipes/", json={"name": "Before"}).json()
    settings = fastapi_app.dependency_overrides[get_settings]().model_copy(update={"auth_enabled": False})
    fastapi_app.dependency_overrides[get_settings] = lambda: settings
    client.cookies.clear()
    household = client.get("/auth/me").json()["id"]

    recipe = client.post("/recipes/", json={"name": "After"}).json()
    import_id = client.post("/imports/text", json={"text": "Pancakes"}).json()["import_id"]

    assert recipe["created_user_id"] == household
    record = db_session.get(RecipeImportRecord, import_id)
    assert record is not None and record.user_id == household
    assert client.get(f"/recipes/{earlier['id']}").json()["created_user_id"] == current_user.id


def test_password_change_is_refused(client: TestClient, db_session: Session, login_free):
    response = client.post("/auth/password", json={"new_password": "a new password"})

    assert response.status_code == 403
    assert _household(db_session)[0].hashed_password is None


def test_the_household_user_cannot_sign_in_once_logins_are_back(client: TestClient, db_session: Session):
    db_session.add(User(username="household", full_name="Household", is_superuser=True))
    db_session.add(User(username="cook", full_name="Cook", hashed_password=hash_password("right")))
    db_session.commit()
    client.cookies.clear()
    wrong_password = client.post("/auth/login", json={"username": "cook", "password": "wrong"})

    response = client.post("/auth/login", json={"username": "household", "password": ""})

    assert response.status_code == wrong_password.status_code == 401
    assert response.json() == wrong_password.json()


def test_auth_config_reports_the_mode(client: TestClient):
    assert client.get("/auth/config").json()["auth_enabled"] is True
    settings = fastapi_app.dependency_overrides[get_settings]().model_copy(update={"auth_enabled": False})
    fastapi_app.dependency_overrides[get_settings] = lambda: settings
    client.cookies.clear()

    assert client.get("/auth/config").json()["auth_enabled"] is False
