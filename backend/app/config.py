import ipaddress
import re
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="RECIPES_",
    )
    app_name: str = "Recipes"
    debug: bool = False
    database_url: str = "sqlite:///./app.db"
    # Uploaded images. Docker keeps them next to the database in /data.
    images_dir: Path = Path("images")
    # What each import sent to Claude (pasted text, photos, page HTML). Docker: /data/imports.
    imports_dir: Path = Path("imports")

    # Signs the short-lived cookie that carries OIDC state through the IdP
    # round trip. A random default only breaks logins that span a restart.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    session_days: int = 30
    # Set true when served over HTTPS.
    cookie_secure: bool = False
    password_login_enabled: bool = True
    # False: no logins, every request acts as the "household" user. Needs allowed_subnets.
    auth_enabled: bool = True
    # Space-separated IPv4 addresses or CIDRs. nginx (frontend container) enforces it;
    # the backend only checks it's set and valid before running without logins.
    allowed_subnets: str = ""

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

    # Recipe import (Claude API). Hidden in the UI unless a key is set.
    anthropic_api_key: SecretStr | None = None
    # Only for tests: e2e points this at a mock Messages API.
    anthropic_base_url: str | None = None
    import_model: str = "claude-sonnet-5-5"
    # Only for tests: lets URL import fetch private addresses, where e2e serves its page.
    import_fetch_private: bool = False

    @model_validator(mode="after")
    def _login_free_needs_subnets(self) -> Settings:
        if not self.auth_enabled:
            check_allowed_subnets(self.allowed_subnets)
        return self

    @property
    def import_enabled(self) -> bool:
        # A blank RECIPES_ANTHROPIC_API_KEY= counts as unset.
        return bool(self.anthropic_api_key and self.anthropic_api_key.get_secret_value().strip())

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id and self.oidc_redirect_uri)


# Same pattern as frontend/docker-entrypoint.d/40-allowed-subnets.sh. It shuts out what nginx
# would read differently (netmask notation, "all"); IPv4Network then checks the ranges.
_IPV4_ENTRY = re.compile(r"\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?")


def check_allowed_subnets(value: str) -> None:
    entries = value.split()
    if not entries:
        raise ValueError("RECIPES_AUTH_ENABLED=false needs RECIPES_ALLOWED_SUBNETS (IPv4 addresses or CIDRs)")
    for entry in entries:
        try:
            if not _IPV4_ENTRY.fullmatch(entry):
                raise ValueError
            ipaddress.IPv4Network(entry, strict=False)
        except ValueError:
            raise ValueError(f"RECIPES_ALLOWED_SUBNETS: {entry!r} is not an IPv4 address or CIDR") from None


@lru_cache
def get_settings() -> Settings:
    return Settings()
