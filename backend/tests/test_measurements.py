from fastapi.testclient import TestClient

from app.schemas.measurement import MeasurementRead


def test_create_measurement(client: TestClient):
    response = client.post("/measurements/", json={"name": "cup"})

    assert response.status_code == 201
    measurement = MeasurementRead.model_validate(response.json())
    assert measurement.name == "cup"


def test_list_measurements_empty(client: TestClient):
    response = client.get("/measurements/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_measurement(client: TestClient, measurement: MeasurementRead):
    response = client.get(f"/measurements/{measurement.id}")

    assert response.status_code == 200
    fetched = MeasurementRead.model_validate(response.json())

    assert fetched == measurement


def test_get_measurement_not_found(client: TestClient):
    response = client.get("/measurements/999")

    assert response.status_code == 404


def test_update_measurement(client: TestClient, measurement: MeasurementRead):
    patch_response = client.patch(f"/measurements/{measurement.id}", json={"name": "tablespoon"})
    assert patch_response.status_code == 200

    response = client.get(f"/measurements/{measurement.id}")
    assert response.status_code == 200
    updated = MeasurementRead.model_validate(response.json())
    assert updated.name == "tablespoon"


def test_delete_measurement(client: TestClient, measurement: MeasurementRead):
    delete_response = client.delete(f"/measurements/{measurement.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/measurements/{measurement.id}")
    assert get_response.status_code == 404


def test_update_measurement_not_found(client: TestClient):
    response = client.patch("/measurements/999", json={"name": "cup"})
    assert response.status_code == 404


def test_delete_measurement_not_found(client: TestClient):
    response = client.delete("/measurements/999")
    assert response.status_code == 404


def test_create_measurement_requires_name(client: TestClient):
    create_response = client.post("/measurements/")
    assert create_response.status_code == 422


def test_created_measurement_appears_in_list(client: TestClient, measurement: MeasurementRead):
    response = client.get("/measurements/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = MeasurementRead.model_validate(response.json()[0])
    assert listed.name == "cup"
