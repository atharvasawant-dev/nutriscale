from __future__ import annotations

import os
from pathlib import Path
from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from services.auth_service import (
    _get_secret_key,
    create_access_token,
    verify_access_token,
)
from api.main import app


def test_secret_key_loads_from_env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-12345678901234567890")
    key = _get_secret_key()
    assert key == "test-secret-key-12345678901234567890"


def test_secret_key_missing_raises_500(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)
    with pytest.raises(HTTPException) as exc_info:
        _get_secret_key()
    assert exc_info.value.status_code == 500
    assert "SECRET_KEY is not set" in exc_info.value.detail


def test_secret_key_dev_fallback(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("ALLOW_INSECURE_DEV_AUTH", "true")
    key = _get_secret_key()
    assert key == "dev-insecure-secret-key"


def test_token_creation_and_verification_roundtrip(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-roundtrip-example")
    token = create_access_token(user_id=42)
    assert isinstance(token, str)
    user_id = verify_access_token(token)
    assert user_id == 42


def test_today_endpoint_authenticated():
    client = TestClient(app)
    token = create_access_token(user_id=1)
    res = client.get("/today", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "calories_consumed_today" in data
    assert "foods" in data
    assert isinstance(data["foods"], list)


def test_user_profile_authenticated():
    client = TestClient(app)
    token = create_access_token(user_id=1)
    res = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "email" in data
    assert "daily_calorie_limit" in data
