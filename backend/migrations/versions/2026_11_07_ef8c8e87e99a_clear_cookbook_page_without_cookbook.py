"""clear cookbook page without cookbook

Rows saved before #75 can have a cookbook page but no cookbook, which the
editor can't clear (#79). A page means nothing without its cookbook.

Revision ID: ef8c8e87e99a
Revises: aa32c8fd9938
Create Date: 2026-11-07 08:01:50.386090

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ef8c8e87e99a"
down_revision: str | Sequence[str] | None = "aa32c8fd9938"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE recipes SET cookbook_page = NULL WHERE cookbook_id IS NULL")


def downgrade() -> None:
    # The cleared pages are gone; nothing to restore.
    pass
