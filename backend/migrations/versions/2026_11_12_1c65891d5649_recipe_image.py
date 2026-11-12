"""recipe image

Revision ID: 1c65891d5649
Revises: 46ca2fd01026
Create Date: 2026-11-12 15:10:09.025408

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1c65891d5649"
down_revision: str | Sequence[str] | None = "46ca2fd01026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("image", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.drop_column("image")
