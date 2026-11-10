"""case-insensitive unique names

Revision ID: fa0638d0971c
Revises: f88b533c9cdd
Create Date: 2026-11-10 10:44:31.177762

"""

from collections.abc import Sequence
from itertools import groupby
from operator import itemgetter

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
    clashes = []
    for table in TABLES:
        # SQLite's lower() folds ASCII only, like NOCASE; sorted so the listing is stable.
        rows = connection.execute(sa.text(f"SELECT lower(name), name FROM {table} ORDER BY lower(name), name"))
        for _, group in groupby(rows, key=itemgetter(0)):
            names = [name for _, name in group]
            if len(names) > 1:
                clashes.append(f"{table}: {', '.join(names)}")
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
