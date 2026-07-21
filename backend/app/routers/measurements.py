from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.measurement import MeasurementCreate, MeasurementRead, MeasurementUpdate
from app.services import measurements as measurements_service

router = APIRouter(prefix="/measurements", tags=["measurements"])


@router.get("/", response_model=list[MeasurementRead])
def list_measurements(db: Session = Depends(get_db)):
    return measurements_service.get_measurements(db)


@router.get("/{measurement_id}", response_model=MeasurementRead)
def get_measurement(measurement_id: int, db: Session = Depends(get_db)):
    response = measurements_service.get_measurement(db, measurement_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=MeasurementRead, status_code=status.HTTP_201_CREATED)
def create_measurement(measurement_in: MeasurementCreate, db: Session = Depends(get_db)):
    return measurements_service.create_measurement(db, measurement_in)


@router.patch("/{measurement_id}", response_model=MeasurementRead)
def update_measurement(measurement_id: int, measurement_in: MeasurementUpdate, db: Session = Depends(get_db)):
    existing = measurements_service.get_measurement(db, measurement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return measurements_service.update_measurement(db, existing, measurement_in)


@router.delete("/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_measurement(measurement_id: int, db: Session = Depends(get_db)):
    existing = measurements_service.get_measurement(db, measurement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    measurements_service.delete_measurement(db, existing)
