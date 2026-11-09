"""cook times in minutes

Active and inactive cook time become whole minutes so the recipe list can sort
by them (#15). "1 hr 15 min" -> 75, "20" -> 20. Text that doesn't read cleanly
as a duration ("2-3 hours", "overnight") keeps its best guess, or NULL, and the
original wording is appended to the recipe's notes so nothing is lost.

Revision ID: f88b533c9cdd
Revises: b4941c86400e
Create Date: 2026-11-09 15:35:21.134615

"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f88b533c9cdd"
down_revision: str | Sequence[str] | None = "b4941c86400e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MAX_INT = 2**53 - 1  # Minutes' bound in app/schemas/fields.py
_TERM = re.compile(r"(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)(?![a-z])", re.IGNORECASE)
_PER_UNIT = {"d": 1440, "h": 60, "m": 1}
_FILLER = re.compile(r"[\s,.]*(and)?[\s,.]*", re.IGNORECASE)


def parse_minutes(text: str) -> tuple[int | None, bool]:
    """Minutes in the text, and whether the text said nothing else."""
    if text.strip().isdigit():
        minutes = int(text)
        return (minutes, True) if minutes <= MAX_INT else (None, False)
    terms = list(_TERM.finditer(text))
    if not terms:
        return None, False
    minutes = round(sum(float(t[1]) * _PER_UNIT[t[2][0].lower()] for t in terms))
    clean = all(_FILLER.fullmatch(part) for part in _TERM.split(text)[::3])
    return (minutes, clean) if minutes <= MAX_INT else (None, False)


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, active_cook_time, inactive_cook_time, notes FROM recipes"
            " WHERE active_cook_time IS NOT NULL OR inactive_cook_time IS NOT NULL"
        )
    ).all()
    for id_, active, inactive, notes in rows:
        values: dict[str, object] = {"id": id_}
        kept: list[str] = []
        for column, label, text in (("active", "Active time", active), ("inactive", "Inactive time", inactive)):
            minutes, clean = parse_minutes(text) if text and text.strip() else (None, True)
            values[column] = minutes
            if not clean:
                kept.append(f"{label}: {text}")
        values["notes"] = "\n".join(filter(None, [notes, *kept])) or None
        connection.execute(
            sa.text("UPDATE recipes SET active_cook_time = :active, inactive_cook_time = :inactive, notes = :notes WHERE id = :id"),
            values,
        )

    # The batch rebuild copies with CAST(... AS INTEGER), so the minutes written above survive.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.alter_column("active_cook_time", existing_type=sa.VARCHAR(), type_=sa.Integer(), existing_nullable=True)
        batch_op.alter_column("inactive_cook_time", existing_type=sa.VARCHAR(), type_=sa.Integer(), existing_nullable=True)


def downgrade() -> None:
    # Lossy: the original wording comes back only through the notes.
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.alter_column("inactive_cook_time", existing_type=sa.Integer(), type_=sa.VARCHAR(), existing_nullable=True)
        batch_op.alter_column("active_cook_time", existing_type=sa.Integer(), type_=sa.VARCHAR(), existing_nullable=True)
    for column in ("active_cook_time", "inactive_cook_time"):
        op.execute(f"UPDATE recipes SET {column} = {column} || ' minutes' WHERE {column} IS NOT NULL")
