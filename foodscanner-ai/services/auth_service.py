from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database.db_session import get_db
from database.models import User


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

load_dotenv()
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def _get_secret_key() -> str:
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        allow_insecure = str(os.environ.get("ALLOW_INSECURE_DEV_AUTH") or "").strip().lower() in {"1", "true", "yes"}
        if allow_insecure:
            return "dev-insecure-secret-key"
        raise HTTPException(
            status_code=500,
            detail="Server misconfigured: SECRET_KEY is not set. Create foodscanner-ai/.env (see .env.example).",
        )
    return secret


def create_access_token(*, user_id: int, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=30))
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
    }
    return jwt.encode(to_encode, _get_secret_key(), algorithm="HS256")


def verify_access_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _get_secret_key(), algorithms=["HS256"])
        sub = payload.get("sub")
        if sub is None:
            raise ValueError("missing sub")
        return int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization token")

    user_id = verify_access_token(credentials.credentials)
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
