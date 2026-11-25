"""ingredient and requirement position

Ingredient lines and requirements get an explicit order (#193), like steps. Existing
rows keep the order they were shown in, which was insert (id) order, numbered from 0
within each recipe.

Revision ID: 97d16776d9ac
Revises: 0562f0467369
Create Date: 2026-11-25 11:18:01.144291

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "97d16776d9ac"
down_revision: str | Sequence[str] | None = "0562f0467369"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = ("recipe_ingredients", "requirements")


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.add_column(sa.Column("position", sa.Integer(), nullable=True))
        op.execute(
            f"UPDATE {table} SET position ="
            f" (SELECT COUNT(*) FROM {table} AS earlier WHERE earlier.recipe_id = {table}.recipe_id AND earlier.id < {table}.id)"
        )
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.alter_column("position", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_column("position")
