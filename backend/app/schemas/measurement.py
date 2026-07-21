from pydantic import BaseModel, ConfigDict

class MeasurementBase(BaseModel):
    name: str


class MeasurementCreate(MeasurementBase):
    pass


class MeasurementUpdate(BaseModel):
    name: str


class MeasurementRead(MeasurementBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
