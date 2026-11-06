"""step position

Steps get an explicit order (#12). Existing steps keep the order they were
shown in, which was insert (id) order, numbered from 0 within each recipe.

Revision ID: aa32c8fd9938
Revises: 425b7165b8d1
Create Date: 2026-11-06 09:07:16.901740

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa32c8fd9938"
down_revision: str | Sequence[str] | None = "425b7165b8d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("steps", schema=None) as batch_op:
        batch_op.add_column(sa.Column("position", sa.Integer(), nullable=True))

    op.execute(
        "UPDATE steps SET position ="
        " (SELECT COUNT(*) FROM steps AS earlier WHERE earlier.recipe_id = steps.recipe_id AND earlier.id < steps.id)"
    )

    with op.batch_alter_table("steps", schema=None) as batch_op:
        batch_op.alter_column("position", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("steps", schema=None) as batch_op:
        batch_op.drop_column("position")
