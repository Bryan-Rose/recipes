"""cookbook image

Revision ID: 08e03b8561b7
Revises: 1c65891d5649
Create Date: 2026-11-12 16:00:11.481482

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "08e03b8561b7"
down_revision: str | Sequence[str] | None = "1c65891d5649"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("image", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.drop_column("image")
