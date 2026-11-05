"""integer servings

Servings becomes a number so the detail page can scale ingredients (#14).
Existing text keeps its first number ("Makes about 12" -> 12, "4-6" -> 4);
text without one becomes NULL.

Revision ID: 9c0d5e609c63
Revises: f78e129999c4
Create Date: 2026-11-05 16:30:04.868914

"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c0d5e609c63"
down_revision: str | Sequence[str] | None = "f78e129999c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MAX_INT = 2**53 - 1  # PositiveInt's bound in app/schemas/fields.py


def _first_number(text: str) -> str | None:
    match = re.search(r"\d+", text)
    return match[0] if match and 1 <= int(match[0]) <= MAX_INT else None


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, servings FROM recipes WHERE servings IS NOT NULL")).all()
    for id_, servings in rows:
        connection.execute(
            sa.text("UPDATE recipes SET servings = :servings WHERE id = :id"), {"servings": _first_number(servings), "id": id_}
        )

    # The batch rebuild copies with CAST(servings AS INTEGER), so the cleaned digits survive.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.alter_column("servings", existing_type=sa.VARCHAR(), type_=sa.Integer(), existing_nullable=True)


def downgrade() -> None:
    # Lossy: the original wording ("Makes about 12") is gone; the number comes back as text.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.alter_column("servings", existing_type=sa.Integer(), type_=sa.VARCHAR(), existing_nullable=True)
