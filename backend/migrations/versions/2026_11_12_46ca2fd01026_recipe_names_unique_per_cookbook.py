"""recipe names unique per cookbook

Revision ID: 46ca2fd01026
Revises: fa0638d0971c
Create Date: 2026-11-12 14:09:55.478706

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "46ca2fd01026"
down_revision: str | Sequence[str] | None = "fa0638d0971c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recipes_name"))
        batch_op.create_index("uq_recipes_name_cookbook_id", ["name", "cookbook_id"], unique=True)
        batch_op.create_index("uq_recipes_name_no_cookbook", ["name"], unique=True, sqlite_where=sa.text("cookbook_id IS NULL"))


def downgrade() -> None:
    # Fails with an IntegrityError if two cookbooks now share a recipe name; rename one first.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.drop_index("uq_recipes_name_no_cookbook", sqlite_where=sa.text("cookbook_id IS NULL"))
        batch_op.drop_index("uq_recipes_name_cookbook_id")
        batch_op.create_index(batch_op.f("ix_recipes_name"), ["name"], unique=True)
