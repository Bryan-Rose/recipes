from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from app.schemas.fields import MAX_USERNAME_LENGTH, Name, NewPassword, Omittable, UtcDatetime


class UserBase(BaseModel):
    username: Annotated[Name, Field(max_length=MAX_USERNAME_LENGTH)]  # login caps it too (#143)
    full_name: Name


class UserCreate(UserBase):
    password: NewPassword
    is_superuser: StrictBool = False


class UserUpdate(BaseModel):
    full_name: Omittable[Name] = None
    password: Omittable[NewPassword] = None
    is_active: Omittable[StrictBool] = None
    is_superuser: Omittable[StrictBool] = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    is_active: bool
    is_superuser: bool
    created_at: UtcDatetime
    updated_at: UtcDatetime
