from pydantic import BaseModel, ConfigDict, SecretStr

from app.schemas.fields import UtcDatetime


class UserBase(BaseModel):
    username: str
    full_name: str


class UserCreate(UserBase):
    password: SecretStr
    is_superuser: bool = False


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: SecretStr | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_superuser: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
