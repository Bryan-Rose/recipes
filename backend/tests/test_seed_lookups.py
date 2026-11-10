from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.measurement import Measurement
from app.models.recipe import Recipe
from scripts.init_db import seed
from scripts.seed_lookups import INGREDIENTS, MEASUREMENTS, PREPARATIONS, seed_lookups


def test_lists_have_no_duplicates():
    for names in (MEASUREMENTS, PREPARATIONS, INGREDIENTS):
        assert len({name.lower() for name in names}) == len(names)


def test_adds_everything_once(db_session: Session):
    expected = {"measurements": len(MEASUREMENTS), "preparations": len(PREPARATIONS), "ingredients": len(INGREDIENTS)}

    assert seed_lookups(db_session) == expected
    assert seed_lookups(db_session) == dict.fromkeys(expected, 0)
    assert db_session.scalar(select(func.count()).select_from(Ingredient)) == len(INGREDIENTS)


def test_keeps_existing_names_in_any_case(db_session: Session):
    db_session.add_all([Measurement(name="Cup"), Ingredient(name="my own spice")])
    db_session.commit()

    assert seed_lookups(db_session)["measurements"] == len(MEASUREMENTS) - 1
    assert db_session.scalars(select(Measurement.name).where(Measurement.name == "cup")).all() == ["Cup"]
    assert db_session.scalar(select(Ingredient.id).where(Ingredient.name == "my own spice")) is not None


def test_sample_data_uses_seeded_lookups(db_session: Session):
    seed(db_session)

    assert db_session.scalar(select(func.count()).select_from(Recipe)) == 3
    assert db_session.scalar(select(func.count()).select_from(Ingredient)) == len(INGREDIENTS)
