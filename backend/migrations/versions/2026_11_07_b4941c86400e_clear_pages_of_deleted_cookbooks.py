"""clear pages of deleted cookbooks

Deleting a cookbook unlinked its recipes but kept their pages (#87), which
the editor can't clear. Repeats ef8c8e87e99a for rows written since.

Revision ID: b4941c86400e
Revises: ef8c8e87e99a
Create Date: 2026-11-07

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4941c86400e"
down_revision: str | Sequence[str] | None = "ef8c8e87e99a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE recipes SET cookbook_page = NULL WHERE cookbook_id IS NULL")


def downgrade() -> None:
    # The cleared pages are gone; nothing to restore.
    pass
