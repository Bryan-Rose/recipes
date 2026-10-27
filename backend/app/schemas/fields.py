"""Field types for values that cross the API boundary into or out of SQLite."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Path
from pydantic import AfterValidator, Field, SecretStr

# Integers beyond SQLite's signed 64-bit range make the driver raise
# OverflowError (a 500). The bound is tighter still: 2**53 - 1 is the largest
# integer JavaScript (the frontend) and JSON-as-float can represent exactly.
_MAX_INT = 2**53 - 1

DbId = Annotated[int, Field(ge=1, le=_MAX_INT)]
"""A row id in a request body."""

PositiveInt = Annotated[int, Field(ge=1, le=_MAX_INT)]
"""A stored count such as an amount or page number."""

IdPath = Annotated[int, Path(ge=1, le=_MAX_INT)]
"""A row id in the URL path."""

MIN_PASSWORD_LENGTH = 8

NewPassword = Annotated[SecretStr, Field(min_length=MIN_PASSWORD_LENGTH)]
"""A password being set. Login takes any string, so older short passwords still work."""


def _assume_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


UtcDatetime = Annotated[datetime, AfterValidator(_assume_utc)]
"""SQLite drops tzinfo; stored timestamps are UTC (CURRENT_TIMESTAMP), so say so.
Without an offset, browsers parse the value as local time."""
