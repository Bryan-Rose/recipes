from pydantic import BaseModel, ConfigDict, StrictBool

from app.schemas.fields import NewPassword, UtcDatetime


class UserBase(BaseModel):
    username: str
    full_name: str


class UserCreate(UserBase):
    password: NewPassword
    is_superuser: StrictBool = False


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: NewPassword | None = None
    is_active: StrictBool | None = None
    is_superuser: StrictBool | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_superuser: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
