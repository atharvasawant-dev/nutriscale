from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models import FoodLog, Nutrition, PortionMeasurement, Product, ScanSession
from services import db_service

SUPPORTED_MEASUREMENT_SOURCES = {"mock", "esp8266", "hardware", "wifi"}
MAX_WEIGHT_GRAMS = 100_000.0
NUTRIENTS = ("calories", "protein", "carbs", "fat", "sugar", "fiber", "salt")


def _now() -> str:
    return datetime.now().isoformat(sep=" ", timespec="seconds")


def _portion_nutrition(nutrition: Nutrition, weight_grams: float) -> dict[str, float | None]:
    factor = weight_grams / 100.0
    return {
        nutrient: (float(getattr(nutrition, nutrient)) * factor)
        if getattr(nutrition, nutrient) is not None else None
        for nutrient in NUTRIENTS
    }


def create_scan_session(db: Session, *, user_id: int, product: dict[str, Any]) -> ScanSession:
    now = _now()
    session = ScanSession(
        user_id=user_id,
        barcode=str(product["barcode"]),
        product_id=int(product["id"]) if product.get("id") is not None else None,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.flush()
    return session


def get_owned_session(db: Session, *, session_id: int, user_id: int) -> ScanSession:
    session = db.execute(
        select(ScanSession).where(ScanSession.id == session_id, ScanSession.user_id == user_id)
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="scan session not found")
    return session


def record_measurement(
    db: Session, *, session: ScanSession, weight_grams: float, source: str
) -> tuple[PortionMeasurement, dict[str, float | None]]:
    if weight_grams <= 0 or weight_grams > MAX_WEIGHT_GRAMS:
        raise HTTPException(status_code=422, detail="weight_grams must be between 0 and 100000")
    if source not in SUPPORTED_MEASUREMENT_SOURCES:
        raise HTTPException(status_code=422, detail="unsupported measurement source")
    if session.status == "saved":
        raise HTTPException(status_code=409, detail="saved scan sessions cannot be measured")

    nutrition = db.execute(
        select(Nutrition).where(Nutrition.product_id == session.product_id)
    ).scalar_one_or_none()
    if nutrition is None:
        raise HTTPException(status_code=422, detail="product nutrition is unavailable")

    measurement = session.measurement
    if measurement is None:
        measurement = PortionMeasurement(
            scan_session_id=session.id,
            weight_grams=float(weight_grams),
            source=source,
            stability="stable",
            measured_at=_now(),
        )
        db.add(measurement)
        session.measurement = measurement
    else:
        measurement.weight_grams = float(weight_grams)
        measurement.source = source
        measurement.measured_at = _now()

    session.status = "measured"
    session.updated_at = _now()
    db.flush()
    return measurement, _portion_nutrition(nutrition, float(weight_grams))


def save_session(db: Session, *, session: ScanSession) -> tuple[FoodLog, dict[str, float | None]]:
    if session.measurement is None:
        raise HTTPException(status_code=409, detail="measurement is required before saving")

    nutrition = db.execute(
        select(Nutrition).where(Nutrition.product_id == session.product_id)
    ).scalar_one_or_none()
    product = db.get(Product, session.product_id) if session.product_id is not None else None
    if nutrition is None or product is None:
        raise HTTPException(status_code=422, detail="product nutrition is unavailable")

    portion = _portion_nutrition(nutrition, session.measurement.weight_grams)
    existing = db.execute(
        select(FoodLog).where(FoodLog.scan_session_id == session.id)
    ).scalar_one_or_none()
    if existing is not None:
        session.status = "saved"
        return existing, portion

    food_log = FoodLog(
        user_id=session.user_id,
        barcode=session.barcode,
        product_name=product.product_name,
        scan_session_id=session.id,
        weight_grams=session.measurement.weight_grams,
        consumed_at=_now(),
        **portion,
    )
    db.add(food_log)
    session.status = "saved"
    session.updated_at = _now()
    db.flush()
    return food_log, portion
