from pydantic import BaseModel, SecretStr


class LoginRequest(BaseModel):
    username: str
    password: SecretStr


class PasswordChange(BaseModel):
    # Required when the user already has a password; OIDC-only users may set one without it.
    current_password: SecretStr | None = None
    new_password: SecretStr


class AuthConfig(BaseModel):
    password_login: bool
    oidc: bool
    oidc_display_name: str
