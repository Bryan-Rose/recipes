from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models.user import User
from app.schemas.fields import IdPath
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import users as users_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    return users_service.get_users(db)


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: IdPath, db: Session = Depends(get_db)):
    response = users_service.get_user(db, user_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    return users_service.create_user(db, user_in)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: IdPath, user_in: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    existing = users_service.get_user(db, user_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # Stops an admin locking themselves out; another admin or the CLI can still do it.
    if existing.id == admin.id and (user_in.is_active is False or user_in.is_superuser is False):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You can't deactivate or demote yourself")
    return users_service.update_user(db, existing, user_in)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: IdPath, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    existing = users_service.get_user(db, user_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if existing.id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You can't delete yourself")
    if existing.recipes:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User has recipes")
    users_service.delete_user(db, existing)
