from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserRead
from app.services.users import verify_password
from tests.conftest import PLACEHOLDER_USER_ID


def test_create_user(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret"})

    assert response.status_code == 201
    user = UserRead.model_validate(response.json())
    assert user.username == "julia"
    assert user.full_name == "Julia Child"
    assert user.is_active is True
    assert user.is_superuser is False


def test_create_user_does_not_return_password(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child", "password": "s3cret"})

    assert "password" not in response.json()
    assert "hashed_password" not in response.json()


def test_create_user_stores_hashed_password(client: TestClient, db_session: Session, user: UserRead):
    stored = db_session.get(User, user.id)

    assert stored is not None
    assert stored.hashed_password != "s3cret"
    assert verify_password("s3cret", stored.hashed_password)
    assert not verify_password("wrong", stored.hashed_password)


def test_create_user_requires_password(client: TestClient):
    response = client.post("/users/", json={"username": "julia", "full_name": "Julia Child"})

    assert response.status_code == 422


def test_list_users_has_only_placeholder(client: TestClient):
    response = client.get("/users/")

    assert response.status_code == 200
    assert [u["id"] for u in response.json()] == [PLACEHOLDER_USER_ID]


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
    old_hash = db_session.get(User, user.id).hashed_password

    response = client.patch(f"/users/{user.id}", json={"full_name": "Julia McWilliams Child"})

    assert response.status_code == 200
    assert UserRead.model_validate(response.json()).full_name == "Julia McWilliams Child"
    assert db_session.get(User, user.id).hashed_password == old_hash


def test_update_user_password(client: TestClient, db_session: Session, user: UserRead):
    response = client.patch(f"/users/{user.id}", json={"password": "n3w-s3cret"})

    assert response.status_code == 200
    stored = db_session.get(User, user.id)
    assert verify_password("n3w-s3cret", stored.hashed_password)
    assert not verify_password("s3cret", stored.hashed_password)


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


def test_delete_user_with_recipes_is_refused(client: TestClient):
    client.post("/recipes/", json={"name": "Beef Bourguignon"})

    response = client.delete(f"/users/{PLACEHOLDER_USER_ID}")

    assert response.status_code == 409
    assert client.get(f"/users/{PLACEHOLDER_USER_ID}").status_code == 200
