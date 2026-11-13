"""cookbook names unique per author

Revision ID: f8a75ac06317
Revises: 08e03b8561b7
Create Date: 2026-11-13 11:05:13.506710

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a75ac06317"
down_revision: str | Sequence[str] | None = "08e03b8561b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Fail with a readable list rather than an IntegrityError mid-rebuild. lower() folds ASCII only, like NOCASE.
    clashes = op.get_bind().execute(
        sa.text(
            "SELECT a.name, group_concat(c.name, ', ') FROM cookbooks c JOIN authors a ON a.id = c.author_id "
            "GROUP BY c.author_id, lower(c.name) HAVING count(*) > 1 ORDER BY a.name"
        )
    )
    listing = [f"{author}: {names}" for author, names in clashes]
    if listing:
        raise RuntimeError(
            "These cookbooks share an author and a name (ignoring case), which the new unique rule forbids. "
            "Rename or merge them on the previous version, then upgrade again:\n  " + "\n  ".join(listing)
        )
    # Autogenerate doesn't compare collations; the collation change was added by hand.
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.alter_column("name", type_=sa.String(collation="NOCASE"), existing_nullable=False)
        batch_op.create_unique_constraint("uq_cookbooks_name_author_id", ["name", "author_id"])


def downgrade() -> None:
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.drop_constraint("uq_cookbooks_name_author_id", type_="unique")
        batch_op.alter_column("name", type_=sa.String(), existing_nullable=False)
