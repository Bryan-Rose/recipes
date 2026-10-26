import hashlib
import secrets
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None or hashed.count("$") != 2:
        return False
    _, salt, digest = hashed.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return secrets.compare_digest(candidate.hex(), digest)


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_users(db: Session) -> Sequence[User]:
    return db.execute(select(User)).scalars().all()


def create_user(db: Session, user_in: UserCreate) -> User:
    db_model = User(
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=hash_password(user_in.password.get_secret_value()),
    )
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_user(db: Session, user: User, user_in: UserUpdate) -> User:
    for field, value in user_in.model_dump(exclude_unset=True, exclude={"password"}).items():
        setattr(user, field, value)
    if user_in.password is not None:
        user.hashed_password = hash_password(user_in.password.get_secret_value())
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()
