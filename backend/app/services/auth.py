import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.session import UserSession
from app.models.user import User
from app.services.users import hash_password, verify_password

# Checked against when the username doesn't exist, so a miss costs the same as a wrong password.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if user is None or user.hashed_password is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.hashed_password) or not user.is_active:
        return None
    return user


def create_session(db: Session, user: User, days: int) -> str:
    """Returns the raw token for the cookie; only its hash is stored."""
    now = _utcnow()
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    db.add(UserSession(token_hash=_hash_token(token), user_id=user.id, created_at=now, expires_at=now + timedelta(days=days)))
    db.commit()
    return token


def get_session_user(db: Session, token: str) -> User | None:
    session = db.execute(select(UserSession).where(UserSession.token_hash == _hash_token(token))).scalar_one_or_none()
    if session is None or session.expires_at <= _utcnow() or not session.user.is_active:
        return None
    return session.user


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(token)))
    db.commit()


def change_password(db: Session, user: User, new_password: str, keep_token: str) -> None:
    """Sets the password and signs out every other session."""
    user.hashed_password = hash_password(new_password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.token_hash != _hash_token(keep_token)))
    db.commit()


class OidcLoginRefused(Exception):
    pass


def resolve_oidc_user(db: Session, claims: dict, create_users: bool) -> User:
    """Finds the user for an IdP identity: by subject, then by unlinked username, else creates one.

    Linking by username trusts the IdP to control usernames, which holds for a
    self-hosted IdP that you administer.
    """
    subject = claims["sub"]
    user = db.execute(select(User).where(User.oidc_subject == subject)).scalar_one_or_none()
    if user is None:
        username = claims.get("preferred_username") or claims.get("email") or subject
        user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if user is not None:
            if user.oidc_subject is not None:
                raise OidcLoginRefused(f"username {username!r} is linked to a different SSO account")
            user.oidc_subject = subject
        elif create_users:
            user = User(username=username, full_name=claims.get("name") or username, oidc_subject=subject)
            db.add(user)
        else:
            raise OidcLoginRefused(f"no local user {username!r}")
        db.commit()
        db.refresh(user)
    if not user.is_active:
        raise OidcLoginRefused("user is disabled")
    return user
