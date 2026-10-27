from datetime import timedelta

import pytest
from authlib.integrations.starlette_client import OAuthError
from fastapi.responses import RedirectResponse
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE
from app.config import Settings, get_settings
from app.main import app as fastapi_app
from app.models.session import UserSession
from app.models.user import User
from app.routers import auth as auth_router
from app.routers.auth import get_oidc_client
from app.services import auth as auth_service
from app.services.users import hash_password


@pytest.fixture()
def cook(db_session: Session) -> User:
    user = User(username="cook", full_name="Home Cook", hashed_password=hash_password("correct horse"))
    db_session.add(user)
    db_session.commit()
    return user


def _login(client: TestClient, username: str = "cook", password: str = "correct horse"):
    client.cookies.clear()
    return client.post("/auth/login", json={"username": username, "password": password})


def _use_settings(**overrides) -> None:
    settings = Settings(**overrides)
    fastapi_app.dependency_overrides[get_settings] = lambda: settings


## Access control


@pytest.mark.parametrize("path", ["/recipes/", "/users/", "/ingredients/", "/tags/", "/auth/me"])
def test_anonymous_requests_are_rejected(client: TestClient, path: str):
    client.cookies.clear()

    assert client.get(path).status_code == 401


def test_auth_config_is_public(client: TestClient):
    client.cookies.clear()

    response = client.get("/auth/config")

    assert response.status_code == 200
    assert response.json()["password_login"] is True


def test_non_admin_cannot_manage_users(client: TestClient, cook: User):
    _login(client)

    assert client.get("/users/").status_code == 403
    assert client.get(f"/users/{cook.id}").status_code == 403
    assert client.post("/users/", json={"username": "x", "full_name": "X", "password": "pw"}).status_code == 403
    assert client.patch(f"/users/{cook.id}", json={"is_superuser": True}).status_code == 403
    assert client.delete(f"/users/{cook.id}").status_code == 403


## Password login


def test_login_sets_http_only_session_cookie(client: TestClient, cook: User):
    response = _login(client)

    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{SESSION_COOKIE}=")
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()
    assert client.get("/auth/me").json()["username"] == "cook"


def test_session_token_is_stored_hashed(client: TestClient, db_session: Session, cook: User):
    _login(client)
    token = client.cookies[SESSION_COOKIE]

    stored = db_session.execute(select(UserSession.token_hash).where(UserSession.user_id == cook.id)).scalars().all()

    assert stored and token not in stored


@pytest.mark.parametrize(("username", "password"), [("cook", "wrong"), ("nobody", "correct horse")])
def test_login_failures_look_the_same(client: TestClient, cook: User, username: str, password: str):
    response = _login(client, username, password)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"
    assert SESSION_COOKIE not in client.cookies


def test_inactive_user_cannot_log_in(client: TestClient, db_session: Session, cook: User):
    cook.is_active = False
    db_session.commit()

    assert _login(client).status_code == 401


def test_sso_only_user_cannot_password_login(client: TestClient, db_session: Session):
    db_session.add(User(username="sso", full_name="SSO", oidc_subject="abc"))
    db_session.commit()

    assert _login(client, "sso", "").status_code == 401


def test_password_login_can_be_disabled(client: TestClient, cook: User):
    _use_settings(password_login_enabled=False)

    assert _login(client).status_code == 403


def _fail_logins(client: TestClient, times: int, username: str = "cook") -> None:
    for _ in range(times):
        assert _login(client, username, "wrong").status_code == 401


def test_repeated_failures_lock_the_username(client: TestClient, db_session: Session, cook: User):
    db_session.add(User(username="other", full_name="Other", hashed_password=hash_password("correct horse")))
    db_session.commit()
    _fail_logins(client, 10)

    response = _login(client)  # the right password doesn't help

    assert response.status_code == 429
    assert 0 < int(response.headers["retry-after"]) <= 15 * 60
    assert SESSION_COOKIE not in client.cookies
    assert _login(client, "other").status_code == 204  # counted per username


def test_lockout_ends_after_the_window(client: TestClient, cook: User):
    _fail_logins(client, 10)
    assert _login(client).status_code == 429

    # Age the recorded failures past the 15-minute window.
    auth_router._failed_logins["cook"] = [t - 15 * 60 for t in auth_router._failed_logins["cook"]]

    assert _login(client).status_code == 204


def test_successful_login_resets_failures(client: TestClient, cook: User):
    _fail_logins(client, 9)
    assert _login(client).status_code == 204

    _fail_logins(client, 9)

    assert _login(client).status_code == 204


## Sessions


def test_logout_revokes_the_session(client: TestClient, cook: User):
    _login(client)
    token = client.cookies[SESSION_COOKIE]

    assert client.post("/auth/logout").status_code == 204

    client.cookies.set(SESSION_COOKIE, token)
    assert client.get("/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db_session: Session, cook: User):
    _login(client)
    for session in db_session.execute(select(UserSession)).scalars():
        session.expires_at -= timedelta(days=365)
    db_session.commit()

    assert client.get("/auth/me").status_code == 401


def test_deactivating_a_user_ends_their_sessions(client: TestClient, db_session: Session, cook: User):
    _login(client)
    cook.is_active = False
    db_session.commit()

    assert client.get("/auth/me").status_code == 401


def test_admin_can_deactivate_and_promote(client: TestClient, cook: User):
    response = client.patch(f"/users/{cook.id}", json={"is_active": False, "is_superuser": True})

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert response.json()["is_superuser"] is True


## Password change


def test_change_password_requires_current_password(client: TestClient, cook: User):
    _login(client)

    response = client.post("/auth/password", json={"current_password": "wrong", "new_password": "new"})

    assert response.status_code == 403


def test_change_password_signs_out_other_sessions(client: TestClient, cook: User):
    _login(client)
    other_token = client.cookies[SESSION_COOKIE]
    _login(client)

    response = client.post("/auth/password", json={"current_password": "correct horse", "new_password": "battery staple"})

    assert response.status_code == 204
    assert client.get("/auth/me").status_code == 200
    client.cookies.set(SESSION_COOKIE, other_token)
    assert client.get("/auth/me").status_code == 401
    assert _login(client, password="battery staple").status_code == 204


def test_admin_password_reset_signs_the_user_out(client: TestClient, cook: User):
    admin_token = client.cookies[SESSION_COOKIE]
    _login(client)
    cook_token = client.cookies[SESSION_COOKIE]
    client.cookies.set(SESSION_COOKIE, admin_token)

    response = client.patch(f"/users/{cook.id}", json={"password": "battery staple"})

    assert response.status_code == 200
    assert client.get("/auth/me").status_code == 200
    client.cookies.set(SESSION_COOKIE, cook_token)
    assert client.get("/auth/me").status_code == 401
    assert _login(client, password="battery staple").status_code == 204


def test_admin_resetting_own_password_stays_signed_in(client: TestClient, current_user: User):
    response = client.patch(f"/users/{current_user.id}", json={"password": "first password"})

    assert response.status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_admin_update_without_password_keeps_sessions(client: TestClient, cook: User):
    admin_token = client.cookies[SESSION_COOKIE]
    _login(client)
    cook_token = client.cookies[SESSION_COOKIE]
    client.cookies.set(SESSION_COOKIE, admin_token)

    assert client.patch(f"/users/{cook.id}", json={"full_name": "Chef"}).status_code == 200

    client.cookies.set(SESSION_COOKIE, cook_token)
    assert client.get("/auth/me").status_code == 200


def test_sso_only_user_can_set_a_password(client: TestClient, current_user: User):
    response = client.post("/auth/password", json={"new_password": "first password"})

    assert response.status_code == 204
    assert _login(client, "admin", "first password").status_code == 204


## OIDC account resolution


def test_oidc_creates_user(db_session: Session):
    user = auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "julia", "name": "Julia Child"}, True)

    assert (user.username, user.full_name, user.oidc_subject, user.hashed_password) == ("julia", "Julia Child", "s1", None)


def test_oidc_matches_by_subject_even_if_username_changed(db_session: Session):
    first = auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "julia"}, True)

    again = auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "jchild"}, True)

    assert again.id == first.id


def test_oidc_links_existing_unlinked_user(db_session: Session, cook: User):
    user = auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "cook"}, False)

    assert user.id == cook.id
    assert cook.oidc_subject == "s1"


def test_oidc_refuses_username_linked_to_another_subject(db_session: Session, cook: User):
    cook.oidc_subject = "someone-else"
    db_session.commit()

    with pytest.raises(auth_service.OidcLoginRefused):
        auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "cook"}, True)


def test_oidc_refuses_unknown_user_when_creation_disabled(db_session: Session):
    with pytest.raises(auth_service.OidcLoginRefused):
        auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "stranger"}, False)

    assert db_session.execute(select(User).where(User.username == "stranger")).scalar_one_or_none() is None


def test_oidc_refuses_inactive_user(db_session: Session, cook: User):
    cook.is_active = False
    db_session.commit()

    with pytest.raises(auth_service.OidcLoginRefused):
        auth_service.resolve_oidc_user(db_session, {"sub": "s1", "preferred_username": "cook"}, True)


## OIDC routes


class FakeOidcClient:
    def __init__(self, userinfo: dict, extra: dict | None = None, error: bool = False):
        self._userinfo, self._extra, self._error = userinfo, extra or {}, error

    async def authorize_redirect(self, request, redirect_uri):
        return RedirectResponse(f"https://idp.example/authorize?redirect_uri={redirect_uri}")

    async def authorize_access_token(self, request):
        if self._error:
            raise OAuthError(error="access_denied")
        return {"userinfo": self._userinfo}

    async def userinfo(self, token):
        return self._extra


def _use_oidc(client: FakeOidcClient) -> None:
    fastapi_app.dependency_overrides[get_oidc_client] = lambda: client
    _use_settings(oidc_issuer="https://idp.example", oidc_client_id="recipes", oidc_redirect_uri="http://app/api/auth/oidc/callback")


def test_oidc_routes_404_when_not_configured(client: TestClient):
    client.cookies.clear()

    assert client.get("/auth/oidc/login", follow_redirects=False).status_code == 404
    assert client.get("/auth/config").json()["oidc"] is False


def test_oidc_login_redirects_to_idp(client: TestClient):
    _use_oidc(FakeOidcClient({}))
    client.cookies.clear()

    response = client.get("/auth/oidc/login", follow_redirects=False)

    assert response.status_code in (302, 307)
    assert response.headers["location"].startswith("https://idp.example/authorize")
    assert client.get("/auth/config").json()["oidc"] is True


def test_oidc_callback_signs_in_and_merges_userinfo(client: TestClient, db_session: Session):
    # Authelia-style: profile claims only on the userinfo endpoint.
    _use_oidc(FakeOidcClient({"sub": "s1"}, extra={"sub": "s1", "preferred_username": "julia", "name": "Julia Child"}))
    client.cookies.clear()

    response = client.get("/auth/oidc/callback", follow_redirects=False)

    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert client.get("/auth/me").json()["username"] == "julia"


def test_oidc_callback_ignores_userinfo_for_a_different_subject(client: TestClient):
    _use_oidc(FakeOidcClient({"sub": "s1", "preferred_username": "julia"}, extra={"sub": "evil", "preferred_username": "admin"}))
    client.cookies.clear()

    client.get("/auth/oidc/callback", follow_redirects=False)

    assert client.get("/auth/me").json()["username"] == "julia"


def test_oidc_callback_idp_error_redirects_to_login(client: TestClient):
    _use_oidc(FakeOidcClient({}, error=True))
    client.cookies.clear()

    response = client.get("/auth/oidc/callback", follow_redirects=False)

    assert response.headers["location"] == "/login?error=sso_failed"
    assert SESSION_COOKIE not in client.cookies


def test_oidc_callback_refused_user_redirects_to_login(client: TestClient):
    _use_oidc(FakeOidcClient({"sub": "s1", "preferred_username": "stranger"}))
    _use_settings(oidc_issuer="https://idp.example", oidc_client_id="recipes", oidc_redirect_uri="http://x", oidc_create_users=False)
    client.cookies.clear()

    response = client.get("/auth/oidc/callback", follow_redirects=False)

    assert response.headers["location"] == "/login?error=sso_not_allowed"
