from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException
import httpx
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from database.models import FoodLog, Nutrition, Product, ScanSession, User
from database.orm import Base
from api.main import save_scan_session
from services import db_service
from services.nutriscale import create_scan_session, record_measurement
from services.thingspeak_service import (
    convert_salt_to_sodium_mg,
    publish_portion,
    publish_saved_portion,
)


@pytest.fixture()
def db(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test_ts.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(email="ts_user@example.com", hashed_password="pw", created_at="2026-01-01")
        product = Product(barcode="99887766", product_name="Granola Bar", created_at="2026-01-01")
        session.add_all([user, product])
        session.flush()
        session.add(
            Nutrition(
                product_id=product.id,
                calories=400,
                protein=8,
                carbs=50,
                fat=15,
                sugar=20,
                fiber=5,
                salt=0.8,
            )
        )
        session.commit()
        yield session, user, product


def test_salt_to_sodium_conversion():
    assert convert_salt_to_sodium_mg(None) is None
    assert convert_salt_to_sodium_mg(0.0) == 0.0
    # 1g salt / 2.5 = 0.4g sodium = 400mg sodium
    assert convert_salt_to_sodium_mg(1.0) == 400.0
    assert convert_salt_to_sodium_mg(1.2) == 480.0
    assert convert_salt_to_sodium_mg(0.6) == 240.0
    assert convert_salt_to_sodium_mg(2.5) == 1000.0


def test_thingspeak_publish_success(monkeypatch):
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY_123")

    captured_call = {}

    def mock_post(url, data=None, **kwargs):
        captured_call["url"] = url
        captured_call["data"] = data
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"channel_id": 3549459, "entry_id": 101}
        return mock_resp

    monkeypatch.setattr(httpx, "post", mock_post)

    success = publish_portion(
        weight_grams=50.0,
        calories=200.0,
        sugar=10.0,
        fat=7.5,
        protein=4.0,
        carbs=25.0,
        salt_g=0.4,
    )

    assert success is True
    assert captured_call["data"]["api_key"] == "TEST_KEY_123"
    assert captured_call["data"]["field1"] == 50.0
    assert captured_call["data"]["field2"] == 200.0
    assert captured_call["data"]["field3"] == 10.0
    assert captured_call["data"]["field4"] == 7.5
    assert captured_call["data"]["field5"] == 4.0
    assert captured_call["data"]["field6"] == 25.0
    # 0.4g salt * 400 = 160.0mg sodium
    assert captured_call["data"]["field7"] == 160.0


def test_thingspeak_missing_credentials(monkeypatch):
    mock_post = MagicMock()
    monkeypatch.setattr(httpx, "post", mock_post)

    # Missing API key
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.delenv("THINGSPEAK_WRITE_API_KEY", raising=False)
    assert publish_portion(weight_grams=50.0) is False
    assert mock_post.call_count == 0

    # Missing channel ID
    monkeypatch.delenv("THINGSPEAK_CHANNEL_ID", raising=False)
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "SOME_KEY")
    assert publish_portion(weight_grams=50.0) is False
    assert mock_post.call_count == 0

    # Both missing
    monkeypatch.delenv("THINGSPEAK_CHANNEL_ID", raising=False)
    monkeypatch.delenv("THINGSPEAK_WRITE_API_KEY", raising=False)
    assert publish_portion(weight_grams=50.0) is False
    assert mock_post.call_count == 0


def test_thingspeak_rejection_and_failures(monkeypatch):
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY")

    # 1. ThingSpeak rate limit rejection (returns integer 0)
    mock_resp_rejection = MagicMock()
    mock_resp_rejection.status_code = 200
    mock_resp_rejection.json.return_value = 0
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: mock_resp_rejection)
    assert publish_portion(weight_grams=50.0) is False

    # 2. HTTP non-200 error
    mock_resp_err = MagicMock()
    mock_resp_err.status_code = 400
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: mock_resp_err)
    assert publish_portion(weight_grams=50.0) is False

    # 3. Timeout exception
    def mock_timeout(*a, **kw):
        raise httpx.TimeoutException("Connection timed out")

    monkeypatch.setattr(httpx, "post", mock_timeout)
    assert publish_portion(weight_grams=50.0) is False

    # 4. ConnectError
    def mock_connect_err(*a, **kw):
        raise httpx.ConnectError("Network unreachable")

    monkeypatch.setattr(httpx, "post", mock_connect_err)
    assert publish_portion(weight_grams=50.0) is False

    # 5. Non-JSON response
    mock_resp_bad_json = MagicMock()
    mock_resp_bad_json.status_code = 200
    mock_resp_bad_json.json.side_effect = ValueError("Invalid JSON")
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: mock_resp_bad_json)
    assert publish_portion(weight_grams=50.0) is False


def test_field_mapping_omits_none_fields(monkeypatch):
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY")

    captured_data = {}

    def mock_post(url, data=None, **kwargs):
        captured_data.update(data or {})
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"entry_id": 5}
        return mock_resp

    monkeypatch.setattr(httpx, "post", mock_post)

    # weight provided, but sugar, fat, salt are None
    publish_portion(
        weight_grams=75.0,
        calories=150.0,
        sugar=None,
        fat=None,
        protein=5.0,
        carbs=None,
        salt_g=None,
    )

    assert "field1" in captured_data
    assert captured_data["field1"] == 75.0
    assert captured_data["field2"] == 150.0
    assert captured_data["field5"] == 5.0
    # Fields that were None must not be present
    assert "field3" not in captured_data
    assert "field4" not in captured_data
    assert "field6" not in captured_data
    assert "field7" not in captured_data


def test_save_scan_session_publishes_to_thingspeak_only_on_first_save(db, monkeypatch):
    session, user, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    record_measurement(session, session=scan, weight_grams=50, source="mock")
    session.commit()

    published_calls = []

    def fake_publish(food_log):
        published_calls.append(food_log)
        return True

    monkeypatch.setattr("api.main.publish_saved_portion", fake_publish)

    # First save request
    res = save_scan_session(session_id=scan.id, db=session, current_user=user)

    assert res["saved"] is True
    assert "food_log_id" in res
    assert "portion_nutrition" in res
    assert len(published_calls) == 1
    assert published_calls[0].weight_grams == 50.0
    assert published_calls[0].calories == 200.0  # 400 * (50/100)


def test_repeated_save_requests_do_not_republish_to_thingspeak(db, monkeypatch):
    session, user, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    record_measurement(session, session=scan, weight_grams=100, source="mock")
    session.commit()

    published_calls = []

    def fake_publish(food_log):
        published_calls.append(food_log)
        return True

    monkeypatch.setattr("api.main.publish_saved_portion", fake_publish)

    # Save #1
    res1 = save_scan_session(session_id=scan.id, db=session, current_user=user)
    assert len(published_calls) == 1

    # Save #2 (repeat)
    res2 = save_scan_session(session_id=scan.id, db=session, current_user=user)
    # Published call count must remain 1 (duplicate prevention)
    assert len(published_calls) == 1
    assert res1["food_log_id"] == res2["food_log_id"]

    # Save #3 (repeat)
    res3 = save_scan_session(session_id=scan.id, db=session, current_user=user)
    assert len(published_calls) == 1

    # FoodLog count in database must remain exactly 1
    count = session.scalar(
        select(func.count()).select_from(FoodLog).where(FoodLog.scan_session_id == scan.id)
    )
    assert count == 1


def test_thingspeak_failure_does_not_block_food_log_or_modify_response(db, monkeypatch):
    session, user, product = db
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    record_measurement(session, session=scan, weight_grams=80, source="mock")
    session.commit()

    def failing_publish(food_log):
        raise httpx.ConnectError("ThingSpeak connection refused")

    monkeypatch.setattr("api.main.publish_saved_portion", failing_publish)

    # The save endpoint must still succeed and commit food log
    res = save_scan_session(session_id=scan.id, db=session, current_user=user)

    assert res["saved"] is True
    assert isinstance(res["food_log_id"], int)
    assert res["portion_nutrition"]["calories"] == 320.0  # 400 * 0.8

    # Verify FoodLog exists in DB despite ThingSpeak failure
    log = session.get(FoodLog, res["food_log_id"])
    assert log is not None
    assert log.weight_grams == 80.0
    assert log.calories == 320.0

    # Verify daily calories update still accurately reflects the saved log
    from api.main import today
    today_res = today(db=session, current_user=user)
    assert today_res["calories_consumed_today"] == 320.0
    assert len(today_res["foods"]) == 1


def test_viewing_or_measuring_does_not_publish_to_thingspeak(db, monkeypatch):
    session, user, product = db
    published_calls = []

    def fake_publish(*a, **kw):
        published_calls.append(True)
        return True

    monkeypatch.setattr("services.thingspeak_service.publish_portion", fake_publish)

    # 1. View / scan
    scan = create_scan_session(
        session,
        user_id=user.id,
        product={"id": product.id, "barcode": product.barcode},
    )
    assert len(published_calls) == 0

    # 2. Record measurement
    record_measurement(session, session=scan, weight_grams=120, source="mock")
    session.commit()
    assert len(published_calls) == 0

    # Verify no food log created
    count = session.scalar(select(func.count()).select_from(FoodLog))
    assert count == 0


def test_publish_saved_portion_supports_explicit_portion_and_zero_values(monkeypatch):
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY")

    captured_data = {}

    def mock_post(url, data=None, **kwargs):
        captured_data.update(data or {})
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"entry_id": 99}
        return mock_resp

    monkeypatch.setattr(httpx, "post", mock_post)

    fake_log = MagicMock()
    fake_log.weight_grams = 50.0
    fake_log.calories = 100.0
    fake_log.sugar = 0.0
    fake_log.fat = 0.0
    fake_log.protein = 5.0
    fake_log.carbs = 10.0
    fake_log.salt = 0.0

    success = publish_saved_portion(fake_log)
    assert success is True
    # Zero values must be explicitly preserved as 0.0, not omitted
    assert captured_data["field1"] == 50.0
    assert captured_data["field2"] == 100.0
    assert captured_data["field3"] == 0.0
    assert captured_data["field4"] == 0.0
    assert captured_data["field5"] == 5.0
    assert captured_data["field6"] == 10.0
    assert captured_data["field7"] == 0.0

    # Test with portion dict override
    captured_data.clear()
    custom_portion = {
        "calories": 250.0,
        "sugar": 12.5,
        "fat": 8.0,
        "protein": 4.0,
        "carbs": 30.0,
        "salt": 0.5,
    }
    success2 = publish_saved_portion(fake_log, custom_portion)
    assert success2 is True
    assert captured_data["field2"] == 250.0
    assert captured_data["field3"] == 12.5
    assert captured_data["field4"] == 8.0
    assert captured_data["field5"] == 4.0
    assert captured_data["field6"] == 30.0
    assert captured_data["field7"] == 200.0  # 0.5 * 400


def test_publish_portion_empty_payload_rejected(monkeypatch):
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY")
    mock_post = MagicMock()
    monkeypatch.setattr(httpx, "post", mock_post)

    # If all fields are None, nothing should be posted
    result = publish_portion()
    assert result is False
    assert mock_post.call_count == 0


def test_end_to_end_portion_scaling_and_thingspeak_payload_integrity(tmp_path, monkeypatch):
    """Regression test ensuring base per-100g product nutrition is scaled by (weight/100)

    exactly once, preserving macro-to-calorie consistency and salt-to-sodium conversion.
    """
    monkeypatch.setenv("THINGSPEAK_CHANNEL_ID", "3549459")
    monkeypatch.setenv("THINGSPEAK_WRITE_API_KEY", "TEST_KEY")

    engine = create_engine(f"sqlite:///{tmp_path / 'test_butter.db'}")
    Base.metadata.create_all(engine)

    captured_payload = {}

    def mock_post(url, data=None, **kwargs):
        captured_payload.update(data or {})
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"entry_id": 3}
        return resp

    monkeypatch.setattr(httpx, "post", mock_post)

    with Session(engine) as session:
        user = User(email="butter_user@example.com", hashed_password="pw", created_at="2026-01-01")
        # 1. Product with real per-100g values for salted butter
        product = Product(barcode="00000000", product_name="Amul Butter", created_at="2026-01-01")
        session.add_all([user, product])
        session.flush()

        session.add(
            Nutrition(
                product_id=product.id,
                calories=717.0,  # per 100g
                fat=81.0,        # per 100g
                sugar=0.5,       # per 100g
                salt=1.5,        # per 100g
                protein=0.8,     # per 100g
                fiber=0.0,
                carbs=0.5,       # per 100g
            )
        )
        session.commit()

        # 2. Start session & measure 126g
        scan = create_scan_session(
            session,
            user_id=user.id,
            product={"id": product.id, "barcode": product.barcode},
        )
        measurement, portion = record_measurement(session, session=scan, weight_grams=126.0, source="mock")
        session.commit()

        # Check portion calculation: factor = 126 / 100 = 1.26
        assert portion["calories"] == pytest.approx(903.42)
        assert portion["fat"] == pytest.approx(102.06)
        assert portion["sugar"] == pytest.approx(0.63)
        assert portion["salt"] == pytest.approx(1.89)
        assert portion["protein"] == pytest.approx(1.008)
        assert portion["carbs"] == pytest.approx(0.63)

        # 3. Save scan session (triggers publish_saved_portion)
        res = save_scan_session(session_id=scan.id, db=session, current_user=user)
        assert res["saved"] is True

        # 4. Verify ThingSpeak payload was scaled exactly once
        assert captured_payload["field1"] == 126.0
        assert captured_payload["field2"] == 903.42
        assert captured_payload["field3"] == 0.63
        assert captured_payload["field4"] == 102.06
        assert captured_payload["field5"] == 1.01  # round(1.008, 2)
        assert captured_payload["field6"] == 0.63
        # 1.89g salt * 400 = 756.0mg sodium
        assert captured_payload["field7"] == 756.0
