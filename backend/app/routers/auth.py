import time

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, get_current_user
from app.config import Settings, get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import AuthConfig, LoginRequest, PasswordChange
from app.schemas.user import UserRead
from app.services import auth as auth_service
from app.services.users import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_oauth = OAuth()

# Failed password logins per username, as time.monotonic() stamps.
# shortcut: in-process, so it resets on restart and isn't shared between workers; fine for one uvicorn process.
_MAX_FAILURES = 10
_FAILURE_WINDOW = 15 * 60
_failed_logins: dict[str, list[float]] = {}


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


@router.get("/config", response_model=AuthConfig)
def auth_config(settings: Settings = Depends(get_settings)):
    return AuthConfig(
        password_login=settings.password_login_enabled,
        oidc=settings.oidc_enabled,
        oidc_display_name=settings.oidc_display_name,
    )


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.password_login_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password login is disabled")
    now = time.monotonic()
    recent = [t for t in _failed_logins.get(body.username, []) if now - t < _FAILURE_WINDOW]
    if len(recent) >= _MAX_FAILURES:
        # Checked before the password, so a correct guess here gains nothing and costs no scrypt.
        retry_after = int(_FAILURE_WINDOW - (now - recent[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    user = auth_service.authenticate(db, body.username, body.password.get_secret_value())
    if user is None:
        # Drop expired entries now and then, so made-up usernames don't pile up.
        if len(_failed_logins) > 10_000:
            for name in [n for n, stamps in _failed_logins.items() if now - stamps[-1] >= _FAILURE_WINDOW]:
                del _failed_logins[name]
        _failed_logins[body.username] = [*recent, now]
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    _failed_logins.pop(body.username, None)
    _set_session_cookie(response, auth_service.create_session(db, user, settings.session_days), settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    if token := request.cookies.get(SESSION_COOKIE):
        auth_service.delete_session(db, token)
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChange, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.hashed_password is not None:
        current = body.current_password.get_secret_value() if body.current_password else ""
        if not verify_password(current, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect")
    auth_service.change_password(db, user, body.new_password.get_secret_value(), request.cookies[SESSION_COOKIE])


## OIDC


def get_oidc_client(settings: Settings = Depends(get_settings)):
    # oidc_enabled implies an issuer; the explicit check narrows the type.
    if not settings.oidc_enabled or settings.oidc_issuer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO is not configured")
    client = _oauth.create_client("oidc")
    if client is None:
        client = _oauth.register(
            "oidc",
            server_metadata_url=f"{settings.oidc_issuer.rstrip('/')}/.well-known/openid-configuration",
            client_id=settings.oidc_client_id,
            client_secret=settings.oidc_client_secret,
            client_kwargs={
                "scope": settings.oidc_scopes,
                "code_challenge_method": "S256",
                "token_endpoint_auth_method": "client_secret_basic" if settings.oidc_client_secret else "none",
            },
        )
    return client


@router.get("/oidc/login")
async def oidc_login(request: Request, client=Depends(get_oidc_client), settings: Settings = Depends(get_settings)):
    return await client.authorize_redirect(request, settings.oidc_redirect_uri)


@router.get("/oidc/callback")
async def oidc_callback(
    request: Request, client=Depends(get_oidc_client), db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
):
    # Relative redirects resolve against the callback URL, i.e. the frontend's origin.
    try:
        # Validates state, PKCE, and the ID token (signature, issuer, audience, expiry, nonce).
        token = await client.authorize_access_token(request)
        claims = dict(token["userinfo"])
        # Some IdPs (e.g. Authelia) only put profile claims on the userinfo endpoint.
        # The spec forbids using userinfo whose sub differs from the ID token's.
        extra = await client.userinfo(token=token)
        if extra.get("sub") == claims["sub"]:
            claims = {**extra, **claims}
        user = auth_service.resolve_oidc_user(db, claims, settings.oidc_create_users)
    except OAuthError:
        return RedirectResponse("/login?error=sso_failed", status_code=status.HTTP_303_SEE_OTHER)
    except auth_service.OidcLoginRefused:
        return RedirectResponse("/login?error=sso_not_allowed", status_code=status.HTTP_303_SEE_OTHER)

    response = RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    _set_session_cookie(response, auth_service.create_session(db, user, settings.session_days), settings)
    return response
