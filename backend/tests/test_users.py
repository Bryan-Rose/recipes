import io
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.user import UserRead
from app.services.users import verify_password
from scripts import create_user


def test_create_user(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret-pw"})

    assert response.status_code == 201
    user = UserRead.model_validate(response.json())
    assert user.username == "julia"
    assert user.full_name == "Julia Child"
    assert user.is_active is True
    assert user.is_superuser is False


def test_create_user_does_not_return_password(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret-pw"})

    assert "password" not in response.json()
    assert "hashed_password" not in response.json()


def test_create_user_stores_hashed_password(client: TestClient, db_session: Session, user: UserRead):
    stored = db_session.get_one(User, user.id)

    assert stored is not None
    assert stored.hashed_password != "s3cret-pw"
    assert verify_password("s3cret-pw", stored.hashed_password)
    assert not verify_password("wrong", stored.hashed_password)


def test_create_user_requires_password(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child"})

    assert response.status_code == 422


@pytest.mark.parametrize("password", ["", "7-chars"])
def test_create_user_rejects_short_password(client: TestClient, password: str):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": password})

    assert response.status_code == 422


def test_update_user_rejects_short_password(client: TestClient, user: UserRead):
    assert client.patch(f"/users/{user.id}", json={"password": "short"}).status_code == 422


def test_create_user_script_rejects_short_password(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sys, "argv", ["create_user", "julia", "--password-stdin"])
    monkeypatch.setattr(sys, "stdin", io.StringIO("short\n"))

    with pytest.raises(SystemExit, match="at least 8"):
        create_user.main()


def test_list_users_has_only_current_user(client: TestClient, current_user: User):
    response = client.get("/users/")

    assert response.status_code == 200
    assert [u["id"] for u in response.json()] == [current_user.id]


def test_created_user_appears_in_list(client: TestClient, user: UserRead):
    response = client.get("/users/")

    assert response.status_code == 200
    assert user in [UserRead.model_validate(u) for u in response.json()]


def test_get_user(client: TestClient, user: UserRead):
    response = client.get(f"/users/{user.id}")

    assert response.status_code == 200
    assert UserRead.model_validate(response.json()) == user


def test_get_user_not_found(client: TestClient):
    response = client.get("/users/12345")

    assert response.status_code == 404


def test_update_user_full_name(client: TestClient, db_session: Session, user: UserRead):
    old_hash = db_session.get_one(User, user.id).hashed_password

    response = client.patch(f"/users/{user.id}", json={"full_name": "Julia McWilliams Child"})

    assert response.status_code == 200
    assert UserRead.model_validate(response.json()).full_name == "Julia McWilliams Child"
    assert db_session.get_one(User, user.id).hashed_password == old_hash


def test_update_user_password(client: TestClient, db_session: Session, user: UserRead):
    response = client.patch(f"/users/{user.id}", json={"password": "n3w-s3cret"})

    assert response.status_code == 200
    stored = db_session.get_one(User, user.id)
    assert verify_password("n3w-s3cret", stored.hashed_password)
    assert not verify_password("s3cret-pw", stored.hashed_password)


def test_update_user_not_found(client: TestClient):
    response = client.patch("/users/12345", json={"full_name": "Nobody"})

    assert response.status_code == 404


def test_delete_user(client: TestClient, user: UserRead):
    delete_response = client.delete(f"/users/{user.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/users/{user.id}")
    assert get_response.status_code == 404


def test_delete_user_not_found(client: TestClient):
    response = client.delete("/users/12345")

    assert response.status_code == 404


def test_delete_user_with_recipes_is_refused(client: TestClient, db_session: Session, user: UserRead):
    recipe_id = client.post("/recipes/", json={"name": "Beef Bourguignon"}).json()["id"]
    # Recipes are attributed to whoever is signed in, so reassign this one to `user`.
    db_session.get_one(Recipe, recipe_id).created_user_id = user.id
    db_session.commit()

    response = client.delete(f"/users/{user.id}")

    assert response.status_code == 409
    assert response.json()["detail"] == "User has recipes"
    assert client.get(f"/users/{user.id}").status_code == 200


def test_create_admin_user(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret-pw", "is_superuser": True})

    assert response.status_code == 201
    assert response.json()["is_superuser"] is True


def test_update_user_active_and_admin(client: TestClient, user: UserRead):
    response = client.patch(f"/users/{user.id}", json={"is_active": False, "is_superuser": True})

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert response.json()["is_superuser"] is True


@pytest.mark.parametrize("change", [{"is_active": False}, {"is_superuser": False}])
def test_admin_cannot_lock_themselves_out(client: TestClient, current_user: User, change: dict):
    response = client.patch(f"/users/{current_user.id}", json=change)

    assert response.status_code == 409
    assert current_user.is_active and current_user.is_superuser


def test_admin_can_still_rename_themselves(client: TestClient, current_user: User):
    response = client.patch(f"/users/{current_user.id}", json={"full_name": "Boss", "is_active": True})

    assert response.status_code == 200
    assert response.json()["full_name"] == "Boss"


def test_admin_cannot_delete_themselves(client: TestClient, current_user: User):
    response = client.delete(f"/users/{current_user.id}")

    assert response.status_code == 409
    assert client.get(f"/users/{current_user.id}").status_code == 200


@pytest.mark.parametrize("field", ["full_name", "is_active", "is_superuser"])
def test_update_user_rejects_null(client: TestClient, user: UserRead, field: str):
    response = client.patch(f"/users/{user.id}", json={field: None})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == field
