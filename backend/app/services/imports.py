"""Turns a recipe from outside (pasted text for now) into a RecipeDraft with the Claude API."""

from anthropic import Anthropic, transform_schema
from anthropic.types.beta import BetaMessage
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ingredient, Measurement, Preparation
from app.schemas.imports import ImportUsage, RecipeDraft

SYSTEM = """You turn a recipe into structured data for a recipe app. Copy the recipe; don't improve or invent anything.

- name: the recipe's title.
- servings, active_cook_time, inactive_cook_time: whole numbers, times in minutes; null when the recipe doesn't say. \
Active time is hands-on work; inactive time is baking, resting, chilling and the like.
- steps: one entry per step of the method, in order, without the step numbers.
- requirements: equipment the recipe calls for (a large pot, a 9-inch pan), if any.
- ingredients: one entry per ingredient line.
  - The amount is a fraction: amount_numerator / amount_denominator, where the denominator is 1, 2, 3, 4 or 8 \
and the numerator is at least 1. "1 1/2" is 3/2; "0.33" is 1/3; "2" is 2/1.
  - Counted ingredients ("2 eggs") use the measurement "whole". Ingredients with no amount ("salt to taste") use \
amount 1/1 and the measurement "to taste".
  - preparation is how the ingredient is prepared ("finely chopped", "melted"), or null.
  - Reuse a name from the existing lists below whenever one means the same thing ("tbsp" is "tablespoon", \
"yellow onion" may be "onion" if that's all there is), spelled exactly as listed. Otherwise use a short, lowercase, \
singular name.
- The app can't store ranges ("1-2 cups": use the larger), amounts it can't express exactly, ingredient groups \
("For the sauce:"), or notes on an ingredient line ("optional", "plus more to serve"). Make the nearest fit, and add \
one line per thing you changed or left out to notes, so nothing is lost.
- notes: any other useful text from the recipe (tips, storage, variations), then the lines above. null if none."""


# shortcut: list prices in USD per million (input, output) tokens, copied by hand
# (2026-11); update when Anthropic changes prices or RECIPES_IMPORT_MODEL names a new model.
# Prompt caching isn't used, so cache reads and writes are left out.
PRICES = {
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-haiku-5-5": (0.1, 0.5),
    "claude-fable-5-2": (8.0, 40.0),
}

_SCHEMA = transform_schema(RecipeDraft)


def usage_of(response: BetaMessage, requested: str) -> ImportUsage:
    usage = response.usage
    # With a refusal fallback, each model that ran is billed at its own rate. The first
    # run may leave its model out; it's the one requested.
    runs = [
        (getattr(it, "model", None) or requested, it.input_tokens, it.output_tokens)
        for it in usage.iterations or []
        if it.type in ("message", "fallback_message")
    ]
    if not runs:
        runs = [(response.model, usage.input_tokens, usage.output_tokens)]
    costs = [(i * PRICES[m][0] + o * PRICES[m][1]) / 1_000_000 if m in PRICES else None for m, i, o in runs]
    return ImportUsage(
        model=response.model,
        input_tokens=sum(i for _, i, _ in runs),
        output_tokens=sum(o for _, _, o in runs),
        cost_usd=None if None in costs else sum(c for c in costs if c is not None),
    )


def _names(db: Session, model: type[Ingredient | Measurement | Preparation]) -> str:
    names = db.execute(select(model.name).order_by(model.name)).scalars().all()
    return "\n".join(names) or "(none yet)"


def parse_text(client: Anthropic, model: str, db: Session, text: str) -> tuple[RecipeDraft | None, ImportUsage]:
    """The draft (None when Claude declined or couldn't finish one) and what the call cost."""
    prompt = (
        f"<existing_measurements>\n{_names(db, Measurement)}\n</existing_measurements>\n"
        f"<existing_ingredients>\n{_names(db, Ingredient)}\n</existing_ingredients>\n"
        f"<existing_preparations>\n{_names(db, Preparation)}\n</existing_preparations>\n\n"
        f"<recipe>\n{text}\n</recipe>"
    )
    # create(), not parse(): parse() raises on a refusal's partial reply, and the usage
    # (what was billed) is needed either way.
    response = client.beta.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": _SCHEMA}},
        # A safety-classifier decline is retried on a suitable model inside the same call.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    usage = usage_of(response, model)
    if response.stop_reason in ("refusal", "max_tokens"):
        return None, usage
    reply = next((block.text for block in response.content if block.type == "text"), "")
    try:
        return RecipeDraft.model_validate_json(reply), usage
    except ValidationError:
        return None, usage
