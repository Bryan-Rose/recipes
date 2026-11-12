import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.schemas.cookbook import CookbookRead
from app.schemas.recipes import RecipeRead

FULL = b"\xff\xd8\xff full picture"
THUMB = b"\xff\xd8\xff thumbnail"


def upload(full: bytes = FULL, thumb: bytes = THUMB) -> dict[str, str]:
    return {"full": base64.b64encode(full).decode(), "thumb": base64.b64encode(thumb).decode()}


def files(images_dir: Path) -> set[str]:
    return {path.name for path in images_dir.iterdir()} if images_dir.exists() else set()


def test_upload_saves_both_files_and_serves_them(client: TestClient, recipe: RecipeRead, images_dir: Path):
    response = client.put(f"/recipes/{recipe.id}/image", json=upload())
    assert response.status_code == 200
    name = response.json()["image"]
    assert files(images_dir) == {f"{name}.jpg", f"{name}-thumb.jpg"}
    assert client.get(f"/recipes/{recipe.id}").json()["image"] == name
    assert client.get("/recipes/").json()[0]["image"] == name

    full = client.get(f"/images/{name}.jpg")
    assert full.status_code == 200
    assert full.content == FULL
    assert full.headers["content-type"] == "image/jpeg"
    assert "immutable" in full.headers["cache-control"]
    assert client.get(f"/images/{name}-thumb.jpg").content == THUMB


def test_create_recipe_with_image(client: TestClient, images_dir: Path):
    response = client.post("/recipes/", json={"name": "Toast", "image": upload()})
    assert response.status_code == 201
    name = response.json()["image"]
    assert files(images_dir) == {f"{name}.jpg", f"{name}-thumb.jpg"}


def test_failed_create_leaves_no_files(client: TestClient, recipe: RecipeRead, images_dir: Path):
    # Same name, no cookbook: the commit fails with a 409 after the files were written.
    response = client.post("/recipes/", json={"name": recipe.name, "image": upload()})
    assert response.status_code == 409
    assert files(images_dir) == set()


def test_failed_replace_keeps_old_files(
    client: TestClient, recipe: RecipeRead, images_dir: Path, db_session: Session, monkeypatch: pytest.MonkeyPatch
):
    old = client.put(f"/recipes/{recipe.id}/image", json=upload()).json()["image"]

    def fail():
        raise RuntimeError("disk full")

    monkeypatch.setattr(db_session, "commit", fail)
    with pytest.raises(RuntimeError):
        client.put(f"/recipes/{recipe.id}/image", json=upload())
    assert files(images_dir) == {f"{old}.jpg", f"{old}-thumb.jpg"}


@pytest.mark.parametrize(
    "body",
    [
        upload(full=b"GIF89a not a jpeg"),
        upload(thumb=b"\x89PNG not a jpeg"),
        {"full": "not base64!", "thumb": upload()["thumb"]},
        {"full": "A" * 5_000_004, "thumb": upload()["thumb"]},  # over the size cap
        {"full": upload()["full"]},
    ],
)
def test_rejects_anything_but_two_jpegs(client: TestClient, recipe: RecipeRead, images_dir: Path, body: dict):
    assert client.put(f"/recipes/{recipe.id}/image", json=body).status_code == 422
    assert client.post("/recipes/", json={"name": "Other", "image": body}).status_code == 422
    assert files(images_dir) == set()


def test_replace_and_remove_delete_old_files(client: TestClient, recipe: RecipeRead, images_dir: Path):
    first = client.put(f"/recipes/{recipe.id}/image", json=upload()).json()["image"]
    second = client.put(f"/recipes/{recipe.id}/image", json=upload()).json()["image"]
    assert second != first
    assert files(images_dir) == {f"{second}.jpg", f"{second}-thumb.jpg"}
    assert client.get(f"/images/{first}.jpg").status_code == 404

    assert client.delete(f"/recipes/{recipe.id}/image").status_code == 204
    assert files(images_dir) == set()
    assert client.get(f"/recipes/{recipe.id}").json()["image"] is None


def test_deleting_recipe_deletes_its_files(client: TestClient, recipe: RecipeRead, images_dir: Path):
    client.put(f"/recipes/{recipe.id}/image", json=upload())
    assert client.delete(f"/recipes/{recipe.id}").status_code == 204
    assert files(images_dir) == set()


def test_image_routes_404_for_missing_recipe(client: TestClient):
    assert client.put("/recipes/999/image", json=upload()).status_code == 404
    assert client.delete("/recipes/999/image").status_code == 404


def test_missing_image_is_404(client: TestClient):
    assert client.get(f"/images/{'0' * 32}.jpg").status_code == 404


@pytest.mark.parametrize("name", ["app.db", "x.jpg", "0" * 32 + ".png", "0" * 32, "0" * 32 + "-thumb.jpg.bak"])
def test_serves_only_generated_names(client: TestClient, name: str):
    assert client.get(f"/images/{name}").status_code == 422


def test_images_need_login(client: TestClient, recipe: RecipeRead):
    name = client.put(f"/recipes/{recipe.id}/image", json=upload()).json()["image"]
    client.cookies.clear()
    assert client.get(f"/images/{name}.jpg").status_code == 401
    assert client.put(f"/recipes/{recipe.id}/image", json=upload()).status_code == 401
    assert client.delete(f"/recipes/{recipe.id}/image").status_code == 401


## Cookbook covers, through the same service as recipe images


def test_cookbook_cover_replace_remove_and_delete(client: TestClient, cookbook: CookbookRead, images_dir: Path):
    first = client.put(f"/cookbooks/{cookbook.id}/image", json=upload()).json()["image"]
    assert files(images_dir) == {f"{first}.jpg", f"{first}-thumb.jpg"}
    assert client.get("/cookbooks/").json()[0]["image"] == first
    assert client.get(f"/images/{first}-thumb.jpg").content == THUMB

    second = client.put(f"/cookbooks/{cookbook.id}/image", json=upload()).json()["image"]
    assert files(images_dir) == {f"{second}.jpg", f"{second}-thumb.jpg"}

    assert client.delete(f"/cookbooks/{cookbook.id}/image").status_code == 204
    assert files(images_dir) == set()
    assert client.get(f"/cookbooks/{cookbook.id}").json()["image"] is None

    client.put(f"/cookbooks/{cookbook.id}/image", json=upload())
    assert client.delete(f"/cookbooks/{cookbook.id}").status_code == 204
    assert files(images_dir) == set()


def test_cookbook_cover_rejects_non_jpeg(client: TestClient, cookbook: CookbookRead, images_dir: Path):
    assert client.put(f"/cookbooks/{cookbook.id}/image", json=upload(full=b"GIF89a")).status_code == 422
    assert files(images_dir) == set()


def test_cookbook_cover_404_and_login(client: TestClient, cookbook: CookbookRead):
    assert client.put("/cookbooks/999/image", json=upload()).status_code == 404
    assert client.delete("/cookbooks/999/image").status_code == 404
    client.cookies.clear()
    assert client.put(f"/cookbooks/{cookbook.id}/image", json=upload()).status_code == 401
    assert client.delete(f"/cookbooks/{cookbook.id}/image").status_code == 401
