"""fractional amounts and optional preparation

Amounts become improper fractions (#10); existing whole amounts are n/1.
Preparation becomes nullable, and the "whole" placeholder preparation it
forced on every row is replaced by NULL and deleted (#11).

Revision ID: f78e129999c4
Revises: f09df3d53f43
Create Date: 2026-11-05 15:38:49.300944

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f78e129999c4"
down_revision: str | Sequence[str] | None = "f09df3d53f43"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


WHOLE = "SELECT id FROM preparations WHERE lower(name) = 'whole'"


def upgrade() -> None:
    with op.batch_alter_table("recipe_ingredients", schema=None) as batch_op:
        batch_op.alter_column("amount", new_column_name="amount_numerator", existing_type=sa.Integer(), existing_nullable=False)
        batch_op.add_column(sa.Column("amount_denominator", sa.Integer(), server_default="1", nullable=False))
        batch_op.alter_column("preparation_id", existing_type=sa.Integer(), nullable=True)

    op.execute(f"UPDATE recipe_ingredients SET preparation_id = NULL WHERE preparation_id IN ({WHOLE})")
    op.execute(f"DELETE FROM preparations WHERE id IN ({WHOLE})")


def downgrade() -> None:
    # Lossy: fractions round to the nearest whole amount, at least 1.
    op.execute(
        "UPDATE recipe_ingredients SET amount_numerator = max(1, CAST(round(1.0 * amount_numerator / amount_denominator) AS INTEGER))"
    )
    op.execute(f"INSERT INTO preparations (name) SELECT 'whole' WHERE NOT EXISTS ({WHOLE})")
    op.execute(f"UPDATE recipe_ingredients SET preparation_id = (SELECT min(id) FROM ({WHOLE})) WHERE preparation_id IS NULL")

    with op.batch_alter_table("recipe_ingredients", schema=None) as batch_op:
        batch_op.alter_column("preparation_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column("amount_denominator")
        batch_op.alter_column("amount_numerator", new_column_name="amount", existing_type=sa.Integer(), existing_nullable=False)
