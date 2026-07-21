from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.measurement import Measurement
from app.schemas.measurement import MeasurementCreate, MeasurementUpdate


def get_measurement(db: Session, measurement_id: int) -> Measurement | None:
    return db.get(Measurement, measurement_id)


def get_measurements(db: Session) -> Sequence[Measurement]:
    return db.execute(select(Measurement)).scalars().all()


def create_measurement(db: Session, measurement_in: MeasurementCreate) -> Measurement:
    db_model = Measurement(**measurement_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_measurement(db: Session, measurement: Measurement, measurement_in: MeasurementUpdate) -> Measurement:
    for field, value in  measurement_in.model_dump(exclude_unset=True).items():
        setattr(measurement, field, value)
    db.commit()
    db.refresh(measurement)
    return measurement


def delete_measurement(db: Session, measurement: Measurement) -> None:
    db.delete(measurement)
    db.commit()
