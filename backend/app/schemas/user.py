from datetime import datetime
from pydantic import BaseModel, ConfigDict, SecretStr


class UserBase(BaseModel):
    username: str
    full_name: str


class UserCreate(UserBase):
    password: SecretStr


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: SecretStr | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_superuser: bool
    created_at: datetime
    updated_at: datetime
