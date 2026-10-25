from __future__ import annotations

import logging
import os
import ssl
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import httpx

load_dotenv()
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger(__name__)

THINGSPEAK_UPDATE_URL = "https://api.thingspeak.com/update.json"


def _get_ssl_context():
    """Returns an SSLContext with default system root certificates loaded."""
    try:
        ctx = ssl.create_default_context()
        ctx.load_default_certs()
        return ctx
    except Exception:
        return True


def convert_salt_to_sodium_mg(salt_g: float | None) -> float | None:
    """Converts salt in grams to estimated sodium in milligrams.

    Conversion convention used across the project:
      1g salt / 2.5 = 0.4g sodium = 400mg sodium.
    """
    if salt_g is None:
        return None
    return round(float(salt_g) * 400.0, 2)


def publish_portion(
    *,
    weight_grams: float | None = None,
    calories: float | None = None,
    sugar: float | None = None,
    fat: float | None = None,
    protein: float | None = None,
    carbs: float | None = None,
    salt_g: float | None = None,
) -> bool:
    """Publish one saved food portion to ThingSpeak via httpx.

    Fields mapping:
      Field 1: weight in grams
      Field 2: calories in kcal
      Field 3: sugar in grams
      Field 4: fat in grams
      Field 5: protein in grams
      Field 6: carbohydrates in grams
      Field 7: estimated sodium in milligrams (1g salt ≈ 400mg sodium)

    Credentials are read from environment variables only.
    API keys are never logged or exposed in responses.
    """
    write_key = os.getenv("THINGSPEAK_WRITE_API_KEY")
    channel_id = os.getenv("THINGSPEAK_CHANNEL_ID")

    if not channel_id or not write_key:
        logger.warning("ThingSpeak credentials are missing.")
        return False

    sodium_mg = convert_salt_to_sodium_mg(salt_g)

    payload: dict[str, Any] = {
        "api_key": write_key,
        "field1": round(float(weight_grams), 2) if weight_grams is not None else None,
        "field2": round(float(calories), 2) if calories is not None else None,
        "field3": round(float(sugar), 2) if sugar is not None else None,
        "field4": round(float(fat), 2) if fat is not None else None,
        "field5": round(float(protein), 2) if protein is not None else None,
        "field6": round(float(carbs), 2) if carbs is not None else None,
        "field7": sodium_mg,
    }

    # Filter out None values
    filtered_payload = {
        key: value
        for key, value in payload.items()
        if value is not None
    }

    if len(filtered_payload) <= 1:
        logger.warning("No nutrition or weight fields provided to publish to ThingSpeak.")
        return False

    try:
        response = httpx.post(
            THINGSPEAK_UPDATE_URL,
            data=filtered_payload,
            verify=_get_ssl_context(),
            timeout=5.0,
        )
        if response.status_code != 200:
            logger.warning("ThingSpeak returned non-200 status code: %d", response.status_code)
            return False

        try:
            result = response.json()
        except ValueError:
            logger.warning("ThingSpeak returned non-JSON response.")
            return False

        # ThingSpeak returns integer 0 or {"entry_id": 0} on rate limit rejection
        if not isinstance(result, dict) or not result.get("entry_id"):
            logger.warning("ThingSpeak rejected the update.")
            return False

        logger.info("ThingSpeak portion published successfully.")
        return True

    except httpx.TimeoutException:
        logger.warning("ThingSpeak request timed out.")
        return False
    except httpx.HTTPError as exc:
        logger.warning("ThingSpeak HTTP error occurred: %s", type(exc).__name__)
        return False
    except Exception as exc:
        logger.warning("ThingSpeak unexpected error: %s", type(exc).__name__)
        return False


def publish_saved_portion(food_log: Any, portion: dict[str, float | None] | None = None) -> bool:
    """Helper to publish from a saved FoodLog instance."""
    weight = getattr(food_log, "weight_grams", None)
    weight_grams = float(weight) if weight is not None else None

    # Use portion dictionary if provided, otherwise retrieve from food_log
    def _val(attr: str) -> float | None:
        if portion is not None and attr in portion and portion[attr] is not None:
            return float(portion[attr])
        val = getattr(food_log, attr, None)
        return float(val) if val is not None else None

    return publish_portion(
        weight_grams=weight_grams,
        calories=_val("calories"),
        sugar=_val("sugar"),
        fat=_val("fat"),
        protein=_val("protein"),
        carbs=_val("carbs"),
        salt_g=_val("salt"),
    )
