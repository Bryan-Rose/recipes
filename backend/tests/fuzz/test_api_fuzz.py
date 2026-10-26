"""Black-box API fuzzing: Schemathesis generates requests from the OpenAPI
schema for every operation and checks the responses.

Runs in the full tier only (`make fuzz`), since it takes a while. It uses the
same in-memory database and signed-in admin session as the rest of the suite.
"""

import pytest
import schemathesis
from fastapi.testclient import TestClient
from hypothesis import settings
from schemathesis.checks import allow_header_conformance, status_code_conformance
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE
from app.main import app as fastapi_app
from app.models.user import User

pytestmark = pytest.mark.fuzz


@pytest.fixture()
def api_schema(client: TestClient):
    # Depends on `client` for its database override and signed-in session.
    return schemathesis.openapi.from_asgi("/openapi.json", fastapi_app)


# Filters must go on the lazy schema here: from_fixture ignores ones applied inside the fixture.
schema = (
    schemathesis.pytest.from_fixture("api_schema")
    # Logging out or deleting the signed-in user would turn every later request into a 401.
    .exclude(path="/auth/logout")
    .exclude(method="DELETE", path="/users/{user_id}")
    # Redirects to an IdP; covered by the e2e suite.
    .exclude(path_regex="^/auth/oidc/")
)


@schema.parametrize()
@settings(max_examples=100)
def test_api(case, client: TestClient, db_session: Session, current_user: User):
    # The fuzzer can deactivate or demote the signed-in admin (PATCH /users/1),
    # after which every request is a 401 and the run silently tests nothing but
    # auth rejection. Undo that before each case, and fail loudly if signed-in
    # requests stop working for any other reason.
    current_user.is_active = True
    current_user.is_superuser = True
    db_session.commit()
    assert client.get("/auth/me").status_code == 200, "fuzzing must run signed in"

    case.call_and_validate(
        cookies={SESSION_COOKIE: client.cookies[SESSION_COOKIE]},
        excluded_checks=[
            # FastAPI only documents 2xx and 422, so the legitimate 401/403/404/409
            # responses would all count as "undocumented".
            status_code_conformance,
            # Starlette's 405 lists only the first matching route's methods in
            # Allow (GET on /authors/, not GET, POST). Harmless; nothing reads Allow.
            allow_header_conformance,
        ],
    )
