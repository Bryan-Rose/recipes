import secrets
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="RECIPES_",
    )
    app_name: str = "Recipes"
    debug: bool = False
    database_url: str = "sqlite:///./app.db"

    # Signs the short-lived cookie that carries OIDC state through the IdP
    # round trip. A random default only breaks logins that span a restart.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    session_days: int = 30
    # Set true when served over HTTPS.
    cookie_secure: bool = False
    password_login_enabled: bool = True

    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    # Leave unset for a public client (PKCE only), e.g. Pocket ID.
    oidc_client_secret: str | None = None
    # Must match what is registered with the IdP, e.g. http://localhost:5173/api/auth/oidc/callback
    oidc_redirect_uri: str | None = None
    oidc_scopes: str = "openid profile email"
    oidc_display_name: str = "SSO"
    # Create a local user on first SSO login. When false, only users who
    # already exist (matched by username) can sign in with SSO.
    oidc_create_users: bool = True

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id and self.oidc_redirect_uri)


@lru_cache
def get_settings() -> Settings:
    return Settings()
