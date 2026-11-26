"""baseline

The whole schema as of 1.0, squashed from the migrations before it (#194). A database made before this has no
revision here; init_db refuses it and says to recreate it with --reset.

Revision ID: feab121ed77d
Revises:
Create Date: 2026-11-25 18:44:08.950512

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "feab121ed77d"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "authors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_authors")),
    )
    with op.batch_alter_table("authors", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_authors_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_authors_name"), ["name"], unique=True)

    op.create_table(
        "ingredients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingredients")),
    )
    with op.batch_alter_table("ingredients", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ingredients_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_ingredients_name"), ["name"], unique=True)

    op.create_table(
        "measurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_measurements")),
    )
    with op.batch_alter_table("measurements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_measurements_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_measurements_name"), ["name"], unique=True)

    op.create_table(
        "preparations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_preparations")),
    )
    with op.batch_alter_table("preparations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_preparations_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_preparations_name"), ["name"], unique=True)

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
    )
    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_tags_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_tags_name"), ["name"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=True),
        sa.Column("oidc_subject", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("oidc_subject", name=op.f("uq_users_oidc_subject")),
    )
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_users_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_username"), ["username"], unique=True)

    op.create_table(
        "cookbooks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("image", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["author_id"], ["authors.id"], name=op.f("fk_cookbooks_author_id_authors")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cookbooks")),
        sa.UniqueConstraint("name", "author_id", name="uq_cookbooks_name_author_id"),
    )
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_cookbooks_id"), ["id"], unique=False)

    op.create_table(
        "shopping_list_checks",
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("measurement_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.String(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["ingredient_id"], ["ingredients.id"], name=op.f("fk_shopping_list_checks_ingredient_id_ingredients"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["measurement_id"], ["measurements.id"], name=op.f("fk_shopping_list_checks_measurement_id_measurements"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("ingredient_id", "measurement_id", name=op.f("pk_shopping_list_checks")),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_sessions_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_sessions")),
    )
    with op.batch_alter_table("user_sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_sessions_token_hash"), ["token_hash"], unique=True)

    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(collation="NOCASE"), nullable=False),
        sa.Column("cookbook_id", sa.Integer(), nullable=True),
        sa.Column("cookbook_page", sa.Integer(), nullable=True),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("active_cook_time", sa.Integer(), nullable=True),
        sa.Column("inactive_cook_time", sa.Integer(), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("image", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("created_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["authors.id"], name=op.f("fk_recipes_author_id_authors")),
        sa.ForeignKeyConstraint(["cookbook_id"], ["cookbooks.id"], name=op.f("fk_recipes_cookbook_id_cookbooks")),
        sa.ForeignKeyConstraint(["created_user_id"], ["users.id"], name=op.f("fk_recipes_created_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recipes")),
    )
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recipes_id"), ["id"], unique=False)
        batch_op.create_index("uq_recipes_name_cookbook_id", ["name", "cookbook_id"], unique=True)
        batch_op.create_index("uq_recipes_name_no_cookbook", ["name"], unique=True, sqlite_where=sa.text("cookbook_id IS NULL"))

    op.create_table(
        "planned_meals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_planned_meals_recipe_id_recipes"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_planned_meals")),
    )
    with op.batch_alter_table("planned_meals", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_planned_meals_day"), ["day"], unique=False)

    op.create_table(
        "recipe_imports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("recipe_id", sa.Integer(), nullable=True),
        sa.Column("saved", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("original", sa.String(), nullable=True),
        sa.Column("original_parts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("page_url", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_recipe_imports_recipe_id_recipes"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_recipe_imports_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recipe_imports")),
        sa.UniqueConstraint("recipe_id", name=op.f("uq_recipe_imports_recipe_id")),
    )
    with op.batch_alter_table("recipe_imports", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recipe_imports_created_at"), ["created_at"], unique=False)

    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("amount_numerator", sa.Integer(), nullable=False),
        sa.Column("amount_denominator", sa.Integer(), server_default="1", nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("group", sa.String(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("preparation_id", sa.Integer(), nullable=True),
        sa.Column("measurement_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["ingredient_id"], ["ingredients.id"], name=op.f("fk_recipe_ingredients_ingredient_id_ingredients")),
        sa.ForeignKeyConstraint(["measurement_id"], ["measurements.id"], name=op.f("fk_recipe_ingredients_measurement_id_measurements")),
        sa.ForeignKeyConstraint(["preparation_id"], ["preparations.id"], name=op.f("fk_recipe_ingredients_preparation_id_preparations")),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_recipe_ingredients_recipe_id_recipes")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recipe_ingredients")),
    )
    with op.batch_alter_table("recipe_ingredients", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recipe_ingredients_id"), ["id"], unique=False)

    op.create_table(
        "recipe_tags",
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_recipe_tags_recipe_id_recipes")),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], name=op.f("fk_recipe_tags_tag_id_tags")),
        sa.PrimaryKeyConstraint("recipe_id", "tag_id", name=op.f("pk_recipe_tags")),
    )
    op.create_table(
        "requirements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_requirements_recipe_id_recipes")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_requirements")),
    )
    with op.batch_alter_table("requirements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_requirements_id"), ["id"], unique=False)

    op.create_table(
        "shopping_list_recipes",
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("batches", sa.Integer(), server_default="1", nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_shopping_list_recipes_recipe_id_recipes"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("recipe_id", name=op.f("pk_shopping_list_recipes")),
    )
    op.create_table(
        "steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], name=op.f("fk_steps_recipe_id_recipes")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_steps")),
    )
    with op.batch_alter_table("steps", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_steps_id"), ["id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("steps", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_steps_id"))

    op.drop_table("steps")
    op.drop_table("shopping_list_recipes")
    with op.batch_alter_table("requirements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_requirements_id"))

    op.drop_table("requirements")
    op.drop_table("recipe_tags")
    with op.batch_alter_table("recipe_ingredients", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recipe_ingredients_id"))

    op.drop_table("recipe_ingredients")
    with op.batch_alter_table("recipe_imports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recipe_imports_created_at"))

    op.drop_table("recipe_imports")
    with op.batch_alter_table("planned_meals", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_planned_meals_day"))

    op.drop_table("planned_meals")
    with op.batch_alter_table("recipes", schema=None) as batch_op:
        batch_op.drop_index("uq_recipes_name_no_cookbook", sqlite_where=sa.text("cookbook_id IS NULL"))
        batch_op.drop_index("uq_recipes_name_cookbook_id")
        batch_op.drop_index(batch_op.f("ix_recipes_id"))

    op.drop_table("recipes")
    with op.batch_alter_table("user_sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_sessions_token_hash"))

    op.drop_table("user_sessions")
    op.drop_table("shopping_list_checks")
    with op.batch_alter_table("cookbooks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_cookbooks_id"))

    op.drop_table("cookbooks")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_username"))
        batch_op.drop_index(batch_op.f("ix_users_id"))

    op.drop_table("users")
    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_tags_name"))
        batch_op.drop_index(batch_op.f("ix_tags_id"))

    op.drop_table("tags")
    with op.batch_alter_table("preparations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_preparations_name"))
        batch_op.drop_index(batch_op.f("ix_preparations_id"))

    op.drop_table("preparations")
    with op.batch_alter_table("measurements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_measurements_name"))
        batch_op.drop_index(batch_op.f("ix_measurements_id"))

    op.drop_table("measurements")
    with op.batch_alter_table("ingredients", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_ingredients_name"))
        batch_op.drop_index(batch_op.f("ix_ingredients_id"))

    op.drop_table("ingredients")
    with op.batch_alter_table("authors", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_authors_name"))
        batch_op.drop_index(batch_op.f("ix_authors_id"))

    op.drop_table("authors")
