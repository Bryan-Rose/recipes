"""Create a user, typically the first admin.

Run from the backend/ directory:

    uv run python -m scripts.create_user alice --admin             # prompts for a password
    uv run python -m scripts.create_user alice --admin --sso-only  # no password; links on first SSO login
    printf '%s' "$PW" | uv run python -m scripts.create_user alice --password-stdin  # automation

An --sso-only user is linked on their first SSO login when the IdP's
preferred_username matches, which is how to make an SSO user an admin.
"""

import argparse
import getpass
import sys

from sqlalchemy import select

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.database import SessionLocal
from app.models.user import User
from app.services.users import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("username")
    parser.add_argument("--full-name", help="defaults to the username")
    parser.add_argument("--admin", action="store_true")
    parser.add_argument("--sso-only", action="store_true", help="no password; sign in through OIDC only")
    parser.add_argument("--password-stdin", action="store_true", help="read the password from stdin (for scripts and tests)")
    args = parser.parse_args()

    hashed_password = None
    if args.password_stdin:
        password = sys.stdin.read().rstrip("\n")
        if not password:
            raise SystemExit("no password on stdin")
        hashed_password = hash_password(password)
    elif not args.sso_only:
        if not sys.stdin.isatty():
            raise SystemExit("needs an interactive terminal to prompt for the password (or use --password-stdin)")
        password = getpass.getpass("Password: ")
        if not password or password != getpass.getpass("Repeat password: "):
            raise SystemExit("passwords were empty or did not match")
        hashed_password = hash_password(password)

    with SessionLocal() as db:
        if db.execute(select(User).where(User.username == args.username)).scalar_one_or_none() is not None:
            raise SystemExit(f"user {args.username!r} already exists")
        db.add(
            User(
                username=args.username,
                full_name=args.full_name or args.username,
                hashed_password=hashed_password,
                is_superuser=args.admin,
            )
        )
        db.commit()
    print(f"created {'admin' if args.admin else 'user'} {args.username!r}")


if __name__ == "__main__":
    main()
