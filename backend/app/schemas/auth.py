from typing import Annotated

from pydantic import BaseModel, Field, SecretStr

from app.schemas.fields import MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, NewPassword


class LoginRequest(BaseModel):
    username: Annotated[str, Field(max_length=MAX_USERNAME_LENGTH)]
    password: Annotated[SecretStr, Field(max_length=MAX_PASSWORD_LENGTH)]


class PasswordChange(BaseModel):
    # Required when the user already has a password; OIDC-only users may set one without it.
    current_password: SecretStr | None = None
    new_password: NewPassword


class AuthConfig(BaseModel):
    password_login: bool
    oidc: bool
    oidc_display_name: str
    recipe_import: bool
