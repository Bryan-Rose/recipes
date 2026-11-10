"""case-insensitive unique names

Revision ID: fa0638d0971c
Revises: f88b533c9cdd
Create Date: 2026-11-10 10:44:31.177762

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fa0638d0971c"
down_revision: str | Sequence[str] | None = "f88b533c9cdd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Autogenerate doesn't compare collations, so this was written by hand.
TABLES = ("authors", "ingredients", "measurements", "preparations", "recipes", "tags")


def upgrade() -> None:
    connection = op.get_bind()
    clashes = [
        f"{table}: {names}"
        for table in TABLES
        for (names,) in connection.execute(
            sa.text(f"SELECT group_concat(name, ', ') FROM {table} GROUP BY name COLLATE NOCASE HAVING count(*) > 1")
        )
    ]
    if clashes:
        raise RuntimeError(
            "These names differ only in case and would break the new unique rule. "
            "Merge or rename them on the previous version, then upgrade again:\n  " + "\n  ".join(clashes)
        )
    for table in TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column("name", type_=sa.String(collation="NOCASE"), existing_nullable=False)


def downgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column("name", type_=sa.String(), existing_nullable=False)
