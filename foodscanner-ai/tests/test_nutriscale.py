from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from database.models import FoodLog, Nutrition, Product, ScanSession, User
from database.orm import Base
from api.main import ScanRequest, scan
from services.barcode_lookup import lookup_product
from services import db_service
from services.hardware.mock_scale import MockScale
from services.nutriscale import (
    create_scan_session,
    get_owned_session,
    record_measurement,
    save_session,
)
from services.nutrition_intelligence import build_nutrition_intelligence


@pytest.fixture()
def db(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(email="test@example.com", hashed_password="test", created_at="2026-01-01")
        other = User(email="other@example.com", hashed_password="test", created_at="2026-01-01")
        product = Product(barcode="12345678", product_name="Test Food", created_at="2026-01-01")
        session.add_all([user, other, product])
        session.flush()
        session.add(
            Nutrition(
                product_id=product.id,
                calories=493,
                protein=10,
                carbs=20,
                fat=5,
                sugar=8,
                fiber=3,
                salt=1.2,
            )
        )
        session.commit()
        yield session, user, other, product


def test_scan_session_starts_pending(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    assert scan.status == "pending"
    assert scan.user_id == user.id


def test_legacy_lookup_logs_consumption_by_default(db):
    session, user, _, product = db
    product.nutriscore = "A"
    session.commit()

    lookup_product(session, product.barcode, user_id=user.id)

    food_log = session.scalar(
        select(FoodLog).where(FoodLog.user_id == user.id, FoodLog.barcode == product.barcode)
    )
    assert food_log is not None
    assert food_log.calories == 493


def test_scan_endpoint_returns_pending_session_without_logging_consumption(db, monkeypatch):
    session, user, _, product = db
    lookup_options = {}

    def fake_lookup(*args, **kwargs):
        lookup_options.update(kwargs)
        return {
            "id": product.id,
            "barcode": product.barcode,
            "product_name": product.product_name,
            "calories": 493,
            "protein": 10,
            "carbs": 20,
            "fat": 5,
            "sugar": 8,
            "fiber": 3,
            "salt": 1.2,
            "final_decision": "SAFE",
            "ingredient_analysis": None,
            "additive_analysis": None,
            "health_score": 80,
            "reasons": [],
        }

    monkeypatch.setattr(
        "api.main.lookup_product",
        fake_lookup,
    )
    response = scan(
        ScanRequest(barcode=product.barcode),
        db=session,
        current_user=user,
    )
    assert lookup_options["log_consumption"] is False
    assert response["nutrition_basis"] == "per_100g"
    assert session.get(FoodLog, 1) is None
    assert session.get(ScanSession, response["scan_session_id"]).status == "pending"


def test_existing_product_lookup_still_returns_cached_nutrition(db):
    session, _, _, product = db
    cached = db_service.get_product_by_barcode(session, product.barcode)
    assert cached["product_name"] == product.product_name
    assert cached["calories"] == 493


@pytest.mark.parametrize(
    ("query", "expected_name"),
    [("Maggi", "Maggi Masala Noodles"), ("Kurkure", "Kurkure Masala Munch")],
)
def test_name_lookup_uses_requested_product_instead_of_placeholder_cache(db, monkeypatch, query, expected_name):
    session, user, _, _ = db
    dataset_product = {
        "product_name": expected_name,
        "calories": 430,
        "fat": 15,
        "sugar": 4,
        "salt": 3.5,
        "protein": 9,
        "fiber": 2,
        "carbs": 65,
    }
    monkeypatch.setattr(
        "services.barcode_lookup.search_indian_dataset",
        lambda product_name: dataset_product if product_name == query else None,
    )

    result = lookup_product(
        session,
        "00000000",
        product_name_hint=query,
        user_id=user.id,
        log_consumption=False,
    )

    assert result is not None
    assert result["product_name"] == expected_name


def test_unknown_name_lookup_returns_not_found(db, monkeypatch):
    session, user, _, _ = db
    monkeypatch.setattr("services.barcode_lookup.search_indian_dataset", lambda _: None)

    result = lookup_product(
        session,
        "00000000",
        product_name_hint="Unknown Product",
        user_id=user.id,
        log_consumption=False,
    )

    assert result is None


def test_user_cannot_access_another_users_session(db):
    session, user, other, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    with pytest.raises(HTTPException) as error:
        get_owned_session(session, session_id=scan.id, user_id=other.id)
    assert error.value.status_code == 404


def test_measurement_calculates_all_nutrients(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    _, portion = record_measurement(session, session=scan, weight_grams=126, source="mock")
    assert portion == pytest.approx({
        "calories": 621.18,
        "protein": 12.6,
        "carbs": 25.2,
        "fat": 6.3,
        "sugar": 10.08,
        "fiber": 3.78,
        "salt": 1.512,
    })


def test_nutrition_intelligence_scales_portion_and_selects_standouts(db):
    session, user, _, product = db
    scan_session = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    _, portion = record_measurement(session, session=scan_session, weight_grams=126, source="mock")

    intelligence = build_nutrition_intelligence(
        session,
        session=scan_session,
        user=user,
        portion=portion,
    )

    assert intelligence.portion_summary.weight_grams == 126
    assert intelligence.portion_summary.nutrition.calories == pytest.approx(621.18)
    assert [item.nutrient for item in intelligence.standout_nutrients] == [
        "calories",
        "protein",
        "sugar",
    ]
    assert intelligence.nutrient_explanations
    assert intelligence.smaller_portion.suggested_weight_grams == 63
    assert intelligence.smaller_portion.nutrition.calories == pytest.approx(310.59)


def test_nutrition_intelligence_uses_profile_and_real_ingredient_findings(db):
    session, user, _, product = db
    user.diet_type = "vegetarian"
    product.ingredients = "refined wheat flour, palm oil"
    product.additives = "en:621"
    session.commit()
    scan_session = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    _, portion = record_measurement(session, session=scan_session, weight_grams=100, source="mock")

    intelligence = build_nutrition_intelligence(
        session,
        session=scan_session,
        user=user,
        portion=portion,
    )

    assert intelligence.suitability.profile_used is True
    assert intelligence.suitability.status in {"GOOD FIT", "LIMITED", "NOT IDEAL"}
    assert intelligence.suitability_reasons
    assert intelligence.ingredient_insights.available is True
    assert intelligence.ingredient_insights.risk_level in {"MEDIUM", "HIGH"}
    assert any("palm oil" in finding or "refined wheat flour" in finding for finding in intelligence.ingredient_insights.findings)


def test_nutrition_intelligence_handles_missing_profile_data_and_alternative(db, monkeypatch):
    session, user, _, product = db
    user.diet_type = None
    user.goal_type = None
    user.daily_calorie_limit = 0
    product.ingredients = None
    product.additives = None
    session.commit()
    monkeypatch.setattr(
        "services.nutrition_intelligence.get_healthier_alternatives",
        lambda *_args, **_kwargs: [{
            "product_name": "Lighter Test Food",
            "brand": "Test Brand",
            "nutrition": {"calories": 300, "fat": 2, "protein": 12},
            "reason": "Lower fat than the scanned product.",
            "source": "test_dataset",
        }],
    )
    scan_session = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    _, portion = record_measurement(session, session=scan_session, weight_grams=100, source="mock")

    intelligence = build_nutrition_intelligence(
        session,
        session=scan_session,
        user=user,
        portion=portion,
    )

    assert intelligence.suitability.profile_used is False
    assert intelligence.suitability.status == "GENERAL VIEW"
    assert intelligence.ingredient_insights.available is False
    assert intelligence.alternative.product_name == "Lighter Test Food"
    assert intelligence.alternative.source == "test_dataset"
    assert intelligence.alternative.comparison_reasons == [
        "Lower calories: 300 vs 493 per 100 g.",
        "Lower fat: 2 vs 5 per 100 g.",
        "Higher protein: 12 vs 10 per 100 g.",
    ]
    assert intelligence.daily_context is None


def test_nutrition_intelligence_requires_measured_portion(db):
    session, user, _, product = db
    scan_session = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )

    with pytest.raises(ValueError, match="product and measurement are required"):
        build_nutrition_intelligence(
            session,
            session=scan_session,
            user=user,
            portion={},
        )


def test_invalid_weight_is_rejected(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    with pytest.raises(HTTPException) as error:
        record_measurement(session, session=scan, weight_grams=-1, source="mock")
    assert error.value.status_code == 422


def test_save_requires_measurement(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    with pytest.raises(HTTPException) as error:
        save_session(session, session=scan)
    assert error.value.status_code == 409


def test_save_is_one_portion_aware_event_and_idempotent(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    record_measurement(session, session=scan, weight_grams=126, source="mock")
    first, _ = save_session(session, session=scan)
    second, _ = save_session(session, session=scan)
    count = session.scalar(
        select(func.count()).select_from(FoodLog).where(FoodLog.scan_session_id == scan.id)
    )
    assert first.id == second.id
    assert count == 1
    assert first.weight_grams == 126
    assert first.calories == 621.18


def test_daily_nutrition_uses_measured_portion(db):
    session, user, _, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    record_measurement(session, session=scan, weight_grams=126, source="mock")
    save_session(session, session=scan)
    session.commit()
    assert db_service.get_today_calories(session, user_id=user.id) == 621.18


def test_mock_scale_is_deterministic():
    reading = MockScale(weight_grams=126).read_weight()
    assert reading.grams == 126
    assert reading.source == "mock"
    assert reading.stability == "stable"
