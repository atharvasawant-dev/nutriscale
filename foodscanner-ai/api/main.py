from __future__ import annotations

from pathlib import Path
import base64
import io
import json
import logging
import hashlib
import os
import random
import re
import time
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from datetime import date

from database.db_session import get_db
from database.orm import init_db as orm_init_db
from database.models import FoodLog, ScanHistory, User
from services.barcode_lookup import lookup_product
from services.product_search import search_products
from services.recommendation_engine import get_healthier_alternatives
from services import db_service
from services.health_report import generate_daily_report
from services.score_explainer import explain_score
from services.goal_report import generate_goal_report
from services.auth_service import create_access_token, get_current_user, hash_password, verify_password
from services.ingredient_analyzer import analyze_ingredients
from services.additive_analyzer import analyze_additives
from services.food_health_score import compute_food_health_score
from services.final_decision_engine import compute_final_decision
from services.decision_explainer import build_decision_reasons
from services.nutriscale import create_scan_session, get_owned_session, record_measurement, save_session
from services.thingspeak_service import publish_saved_portion
from services.nutrition_intelligence import NutritionIntelligence, build_nutrition_intelligence

import pandas as pd
from rapidfuzz import fuzz


from dotenv import load_dotenv

load_dotenv()
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)


app = FastAPI(title="FoodScanner AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    barcode: str = Field(..., pattern=r"^\d{8,14}$")
    product_name: str | None = None


class MeasurementRequest(BaseModel):
    weight_grams: float = Field(..., gt=0, le=100000)
    source: Literal["mock", "esp8266", "hardware", "wifi"] = "mock"


class CompareRequest(BaseModel):
    product_a: str
    product_b: str


class AnalyzeRequest(BaseModel):
    product_name: str
    calories: float | None = None
    fat: float | None = None
    sugar: float | None = None
    salt: float | None = None
    protein: float | None = None
    fiber: float | None = None
    carbs: float | None = None
    serving_size: float | None = None


class OCRRequest(BaseModel):
    image_base64: str


class FoodLogRequest(BaseModel):
    product_name: str
    calories: float = 0
    fat: float | None = None
    sugar: float | None = None
    salt: float | None = None
    protein: float | None = None
    fiber: float | None = None
    carbs: float | None = None
    serving_size: float | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str | None = None
    daily_calorie_limit: int = 2000


class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfileUpdateRequest(BaseModel):
    name: str | None = None
    daily_calorie_limit: int | None = None
    diet_type: str | None = None
    goal_type: str | None = None
    goal_target_days: int | None = None


def _to_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _pct_less(a: float | None, b: float | None) -> int | None:
    if a is None or b is None or a == 0:
        return None
    if b >= a:
        return None
    return int(round(((a - b) / a) * 100))


def _pct_more(a: float | None, b: float | None) -> int | None:
    if a is None or b is None or a == 0:
        return None
    if b <= a:
        return None
    return int(round(((b - a) / a) * 100))


def _csv_fuzzy_lookup(name: str, threshold: float = 75.0) -> dict | None:
    q = (name or "").strip()
    if not q:
        return None

    try:
        df = pd.read_csv(Path(__file__).resolve().parents[1] / "datasets" / "indian_foods" / "indian_packaged_foods.csv")
    except Exception:
        return None

    if "product_name" not in df.columns:
        return None

    best_row = None
    best_name = None
    best_score = 0.0
    for _, row in df.iterrows():
        candidate = str(row.get("product_name") or "").strip()
        if not candidate:
            continue
        score = max(
            float(fuzz.token_set_ratio(q.lower(), candidate.lower())),
            float(fuzz.partial_ratio(q.lower(), candidate.lower())),
        )
        if score > best_score:
            best_score = score
            best_row = row
            best_name = candidate

    if best_row is None or best_score < float(threshold):
        return None

    def _f(v: object) -> float | None:
        return _to_float(v)

    return {
        "product_name": best_name,
        "calories": _f(best_row.get("calories")),
        "fat": _f(best_row.get("fat")),
        "sugar": _f(best_row.get("sugar")),
        "salt": _f(best_row.get("salt")),
        "protein": _f(best_row.get("protein")),
        "fiber": _f(best_row.get("fiber")),
        "carbs": _f(best_row.get("carbs")),
        "ingredients": None,
        "additives": None,
        "source": "indian_dataset",
        "_match": {
            "query": q,
            "matched_name": best_name,
            "similarity": best_score,
            "source": "indian_dataset_fuzzy",
        },
    }


def _ocr_extract_text(image_bytes: bytes) -> str:
    # Prefer easyocr (far better for nutrition labels). Fall back to pytesseract.
    ocr_engine = str(os.getenv("FOODSCANNER_OCR_ENGINE") or "easyocr").strip().lower()
    if ocr_engine != "tesseract":
        try:
            import numpy as np
            from PIL import Image

            arr = _preprocess_ocr_image(image_bytes)
            if arr is None:
                img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                arr = np.array(img)

            reader = _get_easyocr_reader()
            parts = reader.readtext(arr, detail=0)
            text = "\n".join([str(p) for p in parts if p])
            if text.strip():
                return text
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"easyocr failed: {e}")

    try:
        from PIL import Image
    except Exception as e:
        raise HTTPException(status_code=501, detail="Pillow is not installed") from e

    try:
        import pytesseract
    except Exception as e:
        raise HTTPException(status_code=501, detail="pytesseract is not installed") from e

    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail="invalid image") from e

    try:
        from PIL import ImageOps

        img = ImageOps.exif_transpose(img)
        img = img.convert("L")
        img = ImageOps.autocontrast(img)
        # Upscale for better OCR on small labels
        img = img.resize((img.size[0] * 2, img.size[1] * 2))
        # Simple threshold
        img = img.point(lambda p: 255 if p > 160 else 0)

        # Try multiple page segmentation modes and pick the best.
        def score_text(t: str) -> tuple[int, int]:
            # Prefer text with digits and keywords (nutrition labels)
            digits = sum(ch.isdigit() for ch in (t or ""))
            keywords = sum(1 for k in ["kcal", "energy", "fat", "protein", "sugar", "salt", "carb"] if k in (t or "").lower())
            return (digits, keywords)

        t1 = pytesseract.image_to_string(img, config="--oem 3 --psm 6")
        t2 = pytesseract.image_to_string(img, config="--oem 3 --psm 4")
        text = t1 if score_text(t1) >= score_text(t2) else t2
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"pytesseract failed: {e}")
        return ""

    return str(text or "")


def _parse_nutrition_from_text(text: str) -> dict:
    """Parse nutrition values from noisy OCR text with conservative, nutrient-specific heuristics."""
    text_lower = (text or "").lower()
    lines = [ln.strip() for ln in re.split(r"\r?\n", text_lower) if ln and ln.strip()]

    # Normalize common OCR mistakes observed on nutrition labels.
    normalized_lines = []
    for ln in lines:
        ln = (
            ln.replace("@", ".")
            .replace("kca|", "kcal")
            .replace("larbohydrate", "carbohydrate")
            .replace("carbohvdrate", "carbohydrate")
            .replace("lotal", "total")
            .replace("iolal", "total")
            .replace("fa|", "fat")
            .replace("fal}", "fat")
            .replace("proein", "protein")
            .replace("isodiv", "sodium")
            .replace("sering", "serving")
        )
        # EasyOCR often reads a trailing "g" as "9" on compact nutrition rows:
        # "fat7 9", "sugars59", "protein 129".
        ln = re.sub(
            r"\b(fat|sugars?|protein|fibre|fiber|carbohydrate|carbs)\s*(\d{1,2})\s*9\b",
            r"\1 \2 g",
            ln,
        )
        # Salt decimals often lose the dot: "salt0 2g".
        ln = re.sub(r"\b(salt)\s*(\d+)\s+(\d+)\s*g\b", r"\1 \2.\3 g", ln)
        normalized_lines.append(ln)
    lines = normalized_lines

    def _to_num(raw: str | None) -> float | None:
        if not raw:
            return None
        try:
            cleaned = str(raw).replace("@", ".").replace("o", "0").strip()
            cleaned = re.sub(r"[^0-9.]", "", cleaned)
            if not cleaned:
                return None
            return float(cleaned)
        except (TypeError, ValueError):
            return None

    def _normalize_grams_value(raw_token: str, nutrient: str) -> float | None:
        """Interpret OCR-mangled gram values such as 035 -> 0.35, 503 -> 50.3."""
        base = _to_num(raw_token)
        if base is None:
            return None

        token = re.sub(r"[^0-9.]", "", (raw_token or ""))
        if token and "." not in token and token.startswith("0") and len(token) >= 2:
            # 035 -> 0.35, 049 -> 0.49
            return round(float("0." + token[1:]), 3)

        if token and "." not in token and len(token) == 3:
            # 503 -> 50.3 (common OCR drop of decimal point)
            if nutrient in {"fat", "sugar", "carbs", "protein", "fiber", "sat_fat"}:
                as_one_decimal = base / 10.0
                if as_one_decimal <= 100:
                    return round(as_one_decimal, 3)

        return base

    def _stabilize_small_value(val: float | None) -> float | None:
        if val is None:
            return None
        if 0 < val < 1:
            # OCR frequently overstates the second decimal place (0.35 vs 0.3).
            return int(val * 10) / 10.0
        return val

    def _extract_first_numeric_token(s: str) -> str | None:
        m = re.search(r"(\d+(?:[.@]\d+)?)", s or "")
        return m.group(1) if m else None

    def _find_value(pattern: str, nutrient: str, max_lookahead: int = 3, skip_pattern: str | None = None) -> float | None:
        for i, line in enumerate(lines):
            if not re.search(pattern, line):
                continue

            for j in range(i, min(len(lines), i + max_lookahead + 1)):
                probe = lines[j]
                if j > i and re.search(r"^(?:\d+\s*%|%|rda)\s*$", probe):
                    continue
                if skip_pattern and re.search(skip_pattern, probe):
                    continue
                if skip_pattern and j > 0 and re.search(skip_pattern, lines[j - 1]):
                    continue
                token = _extract_first_numeric_token(probe)
                if token is None:
                    continue
                val = _normalize_grams_value(token, nutrient)
                if val is not None:
                    return val
        return None

    calories = _find_value(r"energy|calories?|kcal|\bcal\b", "calories", max_lookahead=2)
    if calories and calories > 5000:
        calories = round(calories / 4.184, 1)

    protein = _find_value(r"\bprotein\b", "protein")
    carbs = _find_value(r"carbohydrate|\bcarbs?\b", "carbs")
    fiber = _find_value(r"fibre|fiber", "fiber")
    sat_fat = _find_value(r"saturated\s*fat|sat\s*fat", "sat_fat")

    # Prefer explicit "total sugars" and avoid taking "added sugar" values.
    sugar = _find_value(r"total\s*sugars?|\bsugars?\b", "sugar", max_lookahead=4, skip_pattern=r"\badded\b")
    if sugar is None and carbs is not None and carbs <= 1.5:
        # If OCR misses sugar value but carbs are very low, this is often the same row family.
        sugar = carbs

    fat = _find_value(r"total\s*fat|\bfat\b|fal", "fat", max_lookahead=3, skip_pattern=r"saturated")
    if fat is not None and fat > 100:
        fat = None
    if fat is not None and sat_fat is not None and fat <= sat_fat:
        # If total fat OCR is lower than saturated fat, the total fat row was likely misread.
        fat = None
    if fat is None and sat_fat is not None and 0 < sat_fat <= 70:
        # Conservative fallback: total fat is typically above saturated fat, estimate only when fat is unreadable.
        fat = float(round(min(100.0, sat_fat * 1.6), 0))

    salt = _find_value(r"\bsalt\b", "salt", max_lookahead=2)
    sodium_mg = _find_value(r"sodium|\bsod\w*\b", "sodium", max_lookahead=3)
    if salt is None and sodium_mg is not None:
        salt = round((sodium_mg * 2.54) / 1000.0, 2)

    serving_size = _find_value(r"serving\s*size", "serving", max_lookahead=2)

    # Guardrails for physically impossible per-100g values.
    if carbs is not None and carbs > 100:
        carbs = round(carbs / 10.0, 3) if carbs <= 1000 else None
    if protein is not None and protein > 100:
        protein = round(protein / 10.0, 3) if protein <= 1000 else None
    if sugar is not None and sugar > 100:
        sugar = round(sugar / 10.0, 3) if sugar <= 1000 else None

    protein = _stabilize_small_value(protein)
    sugar = _stabilize_small_value(sugar)
    carbs = _stabilize_small_value(carbs)
    fiber = _stabilize_small_value(fiber)

    confidence = "medium" if any(v is not None for v in [calories, fat, sugar, protein, salt, carbs]) else "low"

    return {
        "product_name": "",
        "calories": calories,
        "fat": fat,
        "sugar": sugar,
        "salt": salt,
        "protein": protein,
        "fiber": fiber,
        "carbs": carbs,
        "serving_size": serving_size,
        "confidence": confidence,
        "raw_text": text,
    }


_EASYOCR_READER = None
_OCR_CACHE: dict[str, dict[str, object]] = {}
_OCR_CACHE_MAX = 64
_OCR_PARSER_VERSION = "v3"


def _get_easyocr_reader():
    global _EASYOCR_READER
    if _EASYOCR_READER is None:
        import easyocr

        _EASYOCR_READER = easyocr.Reader(["en"], gpu=False)
    return _EASYOCR_READER


def _preprocess_ocr_image(image_bytes: bytes):
    try:
        import numpy as np
        from PIL import Image, ImageEnhance, ImageFilter

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Accuracy-first preprocessing for noisy food labels.
        w, h = img.size
        if min(w, h) < 1200:
            scale = 1200.0 / float(min(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.BICUBIC)

        # Stronger contrast and denoise improve decimal/character recognition.
        img = ImageEnhance.Contrast(img).enhance(1.45)
        img = img.filter(ImageFilter.MedianFilter(size=3))
        img = img.filter(ImageFilter.SHARPEN)

        return np.array(img)
    except Exception:
        return None


@app.post("/ocr", tags=["tracking"])
def ocr_nutrition_label(
    req: OCRRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    img_b64 = (req.image_base64 or "").strip()
    if not img_b64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    if "," in img_b64 and "base64" in img_b64[:80].lower():
        img_b64 = img_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(img_b64, validate=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail="invalid base64") from e

    # Cache OCR by image hash to speed up repeated scans of the same photo
    img_hash = hashlib.sha256(image_bytes).hexdigest()
    cache_key = f"{_OCR_PARSER_VERSION}:{img_hash}"
    cached = _OCR_CACHE.get(cache_key)
    if isinstance(cached, dict) and "raw_text" in cached:
        return dict(cached)

    extracted_text = _ocr_extract_text(image_bytes)
    parsed = _parse_nutrition_from_text(extracted_text)
    parsed["raw_text"] = extracted_text

    _OCR_CACHE[cache_key] = dict(parsed)
    if len(_OCR_CACHE) > _OCR_CACHE_MAX:
        try:
            # drop oldest inserted item (insertion order preserved in py3.7+)
            first_key = next(iter(_OCR_CACHE.keys()))
            _OCR_CACHE.pop(first_key, None)
        except Exception:
            _OCR_CACHE.clear()
    return parsed


@app.post("/food-log", tags=["tracking"])
def log_food(
    req: FoodLogRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    product_name = (req.product_name or "").strip()
    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required")

    # Scale nutrition values by serving size if provided (OCR returns per 100g values)
    scale_factor = 1.0
    if req.serving_size and req.serving_size > 0:
        scale_factor = req.serving_size / 100.0

    calories = float(req.calories or 0.0) * scale_factor
    fat = (float(req.fat) * scale_factor) if req.fat else None
    sugar = (float(req.sugar) * scale_factor) if req.sugar else None
    salt = (float(req.salt) * scale_factor) if req.salt else None
    protein = (float(req.protein) * scale_factor) if req.protein else None
    fiber = (float(req.fiber) * scale_factor) if req.fiber else None
    carbs = (float(req.carbs) * scale_factor) if req.carbs else None

    db_service.log_food_consumption(
        db,
        barcode="manual",
        product_name=product_name,
        calories=calories,
        fat=fat,
        sugar=sugar,
        salt=salt,
        protein=protein,
        fiber=fiber,
        carbs=carbs,
        user_id=int(current_user.id),
    )
    db.commit()
    return {"status": "logged"}


@app.post("/analyze", tags=["tracking"])
def analyze(
    req: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    name = (req.product_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="product_name is required")

    product = {
        "barcode": "00000000",
        "product_name": name,
        "calories": req.calories,
        "fat": req.fat,
        "sugar": req.sugar,
        "salt": req.salt,
        "protein": req.protein,
        "fiber": req.fiber,
        "carbs": req.carbs,
        "ingredients": None,
        "additives": None,
    }

    product["ingredient_analysis"] = analyze_ingredients(product.get("ingredients"))
    product["additive_analysis"] = analyze_additives(product.get("additives"))

    health = compute_food_health_score(product)
    final = compute_final_decision(
        health,
        remaining_calories=float("inf"),
        product_calories=float(product.get("calories") or 0.0),
    )
    product["health_score"] = final.get("health_score")
    product["final_decision"] = final.get("final_decision")
    product["reasons"] = build_decision_reasons(product, remaining_calories=float("inf"))

    diet_note = final.get("diet_note")
    if diet_note is None and isinstance(health, dict):
        diet_note = health.get("diet_note")

    nutrition_per_100g = {
        "calories": product.get("calories"),
        "fat": product.get("fat"),
        "sugar": product.get("sugar"),
        "salt": product.get("salt"),
        "protein": product.get("protein"),
        "fiber": product.get("fiber"),
        "carbs": product.get("carbs"),
    }

    serving_size = req.serving_size
    if isinstance(serving_size, (int, float)):
        try:
            serving_size = float(serving_size)
        except Exception:
            serving_size = None
    if serving_size is not None and serving_size <= 0:
        serving_size = None

    nutrition_per_serving = None
    if serving_size is not None:
        ratio = float(serving_size) / 100.0

        def _scale(v: object) -> float | None:
            f = _to_float(v)
            if f is None:
                return None
            return round(f * ratio, 3)

        nutrition_per_serving = {
            "serving_size": float(serving_size),
            "calories": _scale(nutrition_per_100g.get("calories")),
            "fat": _scale(nutrition_per_100g.get("fat")),
            "sugar": _scale(nutrition_per_100g.get("sugar")),
            "salt": _scale(nutrition_per_100g.get("salt")),
            "protein": _scale(nutrition_per_100g.get("protein")),
            "fiber": _scale(nutrition_per_100g.get("fiber")),
            "carbs": _scale(nutrition_per_100g.get("carbs")),
        }

    return {
        "product": {
            "name": product.get("product_name"),
            "nutrition": nutrition_per_100g,
            "nutrition_per_100g": nutrition_per_100g,
            "nutrition_per_serving": nutrition_per_serving,
            "nutriscore": None,
        },
        "analysis": {
            "ingredient_analysis": product.get("ingredient_analysis"),
            "additive_analysis": product.get("additive_analysis"),
            "health_score": product.get("health_score"),
        },
        "decision": {
            "final_decision": product.get("final_decision"),
            "reasons": product.get("reasons"),
        },
        "diet_note": diet_note,
        "recommendations": [],
        "daily_intake": {
            "consumed": None,
            "remaining": None,
        },
    }


@app.on_event("startup")
def on_startup() -> None:
    orm_init_db()
    print("FoodScanner API running. For Expo Go, start uvicorn with --host 0.0.0.0 and open http://<your-lan-ip>:8000/health")


@app.get("/health", tags=["tracking"])
def health() -> dict:
    return {"status": "running"}


@app.post("/register", tags=["auth"])
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    email = (req.email or "").strip().lower()
    password = req.password or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="email already registered")

    user = User(
        email=email,
        name=(req.name.strip() if isinstance(req.name, str) and req.name.strip() else None),
        hashed_password=hash_password(password),
        daily_calorie_limit=int(req.daily_calorie_limit or 2000),
        diet_type=None,
        created_at=db_service._utc_now_str(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=int(user.id))
    return {"access_token": token, "token_type": "bearer"}


@app.post("/login", tags=["auth"])
def login(req: LoginRequest, db: Session = Depends(get_db)) -> dict:
    email = (req.email or "").strip().lower()
    password = req.password or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user_id=int(user.id))
    return {"access_token": token, "token_type": "bearer"}


@app.get("/search", tags=["products"])
def search(
    query: str = Query(..., min_length=2, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    return search_products(db, query)


@app.get("/product/{barcode}", tags=["products"])
def get_product(
    barcode: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    barcode = (barcode or "").strip()
    if not barcode.isdigit() or not (8 <= len(barcode) <= 14):
        raise HTTPException(status_code=400, detail="invalid barcode")

    product = db_service.get_product_by_barcode(db, barcode)
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")

    product["ingredient_analysis"] = analyze_ingredients(product.get("ingredients"))
    product["additive_analysis"] = analyze_additives(product.get("additives"))
    health = compute_food_health_score(product)
    final = compute_final_decision(
        health,
        remaining_calories=float("inf"),
        product_calories=float(product.get("calories") or 0.0),
    )
    product["health_score"] = final.get("health_score")
    product["final_decision"] = final.get("final_decision")
    product["reasons"] = build_decision_reasons(product, remaining_calories=float("inf"))

    analysis = {
        "ingredient_analysis": product.get("ingredient_analysis"),
        "additive_analysis": product.get("additive_analysis"),
        "health_score": product.get("health_score"),
    }
    decision = {
        "final_decision": product.get("final_decision"),
        "reasons": product.get("reasons"),
    }

    return {
        "product": {
            "name": product.get("product_name"),
            "nutrition": {
                "calories": product.get("calories"),
                "fat": product.get("fat"),
                "sugar": product.get("sugar"),
                "salt": product.get("salt"),
                "protein": product.get("protein"),
                "fiber": product.get("fiber"),
                "carbs": product.get("carbs"),
            },
            "nutriscore": product.get("nutriscore"),
        },
        "analysis": analysis,
        "decision": decision,
    }


@app.get("/today", tags=["tracking"])
def today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    today_calories = db_service.get_today_calories(db, user_id=int(current_user.id))
    calorie_limit = float(current_user.daily_calorie_limit or 2000)
    remaining_calories = db_service.get_remaining_calories(
        db,
        daily_limit=calorie_limit,
        user_id=int(current_user.id),
    )

    start, end = db_service._local_day_bounds()
    today_logs = db.execute(
        select(FoodLog).where(
            FoodLog.user_id == int(current_user.id),
            FoodLog.consumed_at >= start,
            FoodLog.consumed_at < end,
        ).order_by(FoodLog.consumed_at.desc())
    ).scalars().all()

    total_sugar = 0.0
    total_salt = 0.0
    total_fat = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    food_items = []
    for log in today_logs:
        cal = float(log.calories) if log.calories is not None else None
        sugar_val = float(log.sugar) if log.sugar is not None else None
        salt_val = float(log.salt) if log.salt is not None else None
        fat_val = float(log.fat) if log.fat is not None else None
        protein_val = float(log.protein) if log.protein is not None else None
        carbs_val = float(log.carbs) if log.carbs is not None else None
        weight_val = float(log.weight_grams) if log.weight_grams is not None else None

        if sugar_val is not None:
            total_sugar += sugar_val
        if salt_val is not None:
            total_salt += salt_val
        if fat_val is not None:
            total_fat += fat_val
        if protein_val is not None:
            total_protein += protein_val
        if carbs_val is not None:
            total_carbs += carbs_val

        verdict = "Safe"
        if (sugar_val is not None and sugar_val > 15) or (cal is not None and cal > 200):
            verdict = "Moderate"
        if (sugar_val is not None and sugar_val > 35) or (salt_val is not None and salt_val > 3.0):
            verdict = "Avoid"

        food_items.append({
            "product_name": log.product_name,
            "calories": cal,
            "weight_grams": weight_val,
            "sugar": sugar_val,
            "salt": salt_val,
            "fat": fat_val,
            "protein": protein_val,
            "carbs": carbs_val,
            "verdict": verdict,
            "consumed_at": log.consumed_at,
        })

    total_sodium = round(total_salt / 2.5, 2)

    return {
        "calories_consumed_today": today_calories,
        "remaining_calories": remaining_calories,
        "daily_calorie_limit": calorie_limit,
        "total_sugar": round(total_sugar, 1),
        "total_salt": round(total_salt, 2),
        "total_sodium": total_sodium,
        "total_fat": round(total_fat, 1),
        "total_protein": round(total_protein, 1),
        "total_carbs": round(total_carbs, 1),
        "target_sugar": 50.0,
        "target_sodium": 2.0,
        "foods": food_items,
    }


@app.post("/scan", tags=["tracking"])
def scan(
    req: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    barcode = req.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="barcode is required")

    try:
        result = lookup_product(
            db,
            barcode,
            product_name_hint=req.product_name,
            user_id=int(current_user.id),
            daily_calorie_limit=int(current_user.daily_calorie_limit or 2000),
            diet_type=current_user.diet_type,
            log_consumption=False,
        )
    except Exception as e:
        logging.error(f"Scan error for barcode {barcode}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scan error: {str(e)}")
    
    if result is None:
        raise HTTPException(status_code=404, detail="product not found")

    nutrition = {
        "calories": result.get("calories"),
        "fat": result.get("fat"),
        "sugar": result.get("sugar"),
        "salt": result.get("salt"),
        "protein": result.get("protein"),
        "fiber": result.get("fiber"),
        "carbs": result.get("carbs"),
    }

    final_decision = str(result.get("final_decision") or "")
    if final_decision and final_decision.upper() != "SAFE":
        recommendations = get_healthier_alternatives(str(result.get("product_name") or ""), nutrition)
    else:
        recommendations = []

    scan_session = create_scan_session(db, user_id=int(current_user.id), product=result)
    db.commit()

    return {
        "scan_session_id": scan_session.id,
        "nutrition_basis": "per_100g",
        "product": {
            "name": result.get("product_name"),
            "nutrition": nutrition,
            "nutriscore": result.get("nutriscore"),
        },
        "analysis": {
            "ingredient_analysis": result.get("ingredient_analysis"),
            "additive_analysis": result.get("additive_analysis"),
            "health_score": result.get("health_score"),
        },
        "decision": {
            "final_decision": result.get("final_decision"),
            "reasons": result.get("reasons"),
        },
        "diet_note": result.get("diet_note"),
        "recommendations": recommendations,
        "daily_intake": {
            "consumed": result.get("today_calories_consumed"),
            "remaining": result.get("remaining_calories"),
        },
    }


@app.post("/scan-sessions/{session_id}/measurement", tags=["tracking"])
def measure_scan_session(
    session_id: int,
    req: MeasurementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    session = get_owned_session(db, session_id=session_id, user_id=int(current_user.id))
    _, portion = record_measurement(
        db,
        session=session,
        weight_grams=req.weight_grams,
        source=req.source,
    )
    intelligence = build_nutrition_intelligence(
        db,
        session=session,
        user=current_user,
        portion=portion,
    )
    db.commit()
    return {
        "scan_session_id": session.id,
        "weight_grams": req.weight_grams,
        "nutrition_basis": "measured_portion",
        "portion_nutrition": portion,
        "nutrition_intelligence": intelligence.model_dump(),
    }


@app.post("/scan-sessions/{session_id}/save", tags=["tracking"])
def save_scan_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    session = get_owned_session(db, session_id=session_id, user_id=int(current_user.id))

    # Inspect existing database state to prevent duplicate ThingSpeak publishing on re-save
    is_newly_saved = (
        db.execute(
            select(FoodLog.id).where(FoodLog.scan_session_id == session.id)
        ).scalar_one_or_none() is None
    )

    food_log, portion = save_session(db, session=session)
    db.commit()

    # Publish to ThingSpeak only after successful database commit, for newly saved portions only
    if is_newly_saved:
        try:
            publish_saved_portion(food_log)
        except Exception as exc:
            logging.getLogger(__name__).warning("ThingSpeak publishing encountered error: %s", type(exc).__name__)

    return {
        "saved": True,
        "food_log_id": food_log.id,
        "portion_nutrition": portion,
    }


@app.post("/compare", tags=["products"])
def compare(req: CompareRequest, db: Session = Depends(get_db)) -> dict:
    a = db_service.get_product_by_name_fuzzy(db, req.product_a, min_similarity=80.0)
    if a is None:
        ds = _csv_fuzzy_lookup(req.product_a, threshold=75.0)
        if ds is None:
            raise HTTPException(status_code=404, detail="product_a not found")
        a = ds

    b = db_service.get_product_by_name_fuzzy(db, req.product_b, min_similarity=80.0)
    if b is None:
        ds = _csv_fuzzy_lookup(req.product_b, threshold=75.0)
        if ds is None:
            raise HTTPException(status_code=404, detail="product_b not found")
        b = ds

    a_nutrition = {
        "calories": _to_float(a.get("calories")),
        "sugar": _to_float(a.get("sugar")),
        "salt": _to_float(a.get("salt")),
        "fat": _to_float(a.get("fat")),
        "fiber": _to_float(a.get("fiber")),
        "protein": _to_float(a.get("protein")),
    }
    b_nutrition = {
        "calories": _to_float(b.get("calories")),
        "sugar": _to_float(b.get("sugar")),
        "salt": _to_float(b.get("salt")),
        "fat": _to_float(b.get("fat")),
        "fiber": _to_float(b.get("fiber")),
        "protein": _to_float(b.get("protein")),
    }

    a_score = 0
    b_score = 0
    reasons: list[str] = []

    if a_nutrition.get("sugar") is not None and b_nutrition.get("sugar") is not None:
        if b_nutrition["sugar"] < a_nutrition["sugar"]:
            b_score += 1
            pct = _pct_less(a_nutrition["sugar"], b_nutrition["sugar"])
            reasons.append(f"{pct}% less sugar" if pct is not None else "lower sugar")
        elif a_nutrition["sugar"] < b_nutrition["sugar"]:
            a_score += 1
            pct = _pct_less(b_nutrition["sugar"], a_nutrition["sugar"])
            reasons.append(f"{pct}% less sugar" if pct is not None else "lower sugar")

    if a_nutrition.get("salt") is not None and b_nutrition.get("salt") is not None:
        if b_nutrition["salt"] < a_nutrition["salt"]:
            b_score += 1
            pct = _pct_less(a_nutrition["salt"], b_nutrition["salt"])
            reasons.append(f"{pct}% less sodium" if pct is not None else "lower sodium")
        elif a_nutrition["salt"] < b_nutrition["salt"]:
            a_score += 1
            pct = _pct_less(b_nutrition["salt"], a_nutrition["salt"])
            reasons.append(f"{pct}% less sodium" if pct is not None else "lower sodium")

    if a_nutrition.get("fat") is not None and b_nutrition.get("fat") is not None:
        if b_nutrition["fat"] < a_nutrition["fat"]:
            b_score += 1
            pct = _pct_less(a_nutrition["fat"], b_nutrition["fat"])
            reasons.append(f"{pct}% less fat" if pct is not None else "lower fat")
        elif a_nutrition["fat"] < b_nutrition["fat"]:
            a_score += 1
            pct = _pct_less(b_nutrition["fat"], a_nutrition["fat"])
            reasons.append(f"{pct}% less fat" if pct is not None else "lower fat")

    if a_nutrition.get("fiber") is not None and b_nutrition.get("fiber") is not None:
        if b_nutrition["fiber"] > a_nutrition["fiber"]:
            b_score += 1
            pct = _pct_more(a_nutrition["fiber"], b_nutrition["fiber"])
            reasons.append(f"{pct}% more fiber" if pct is not None else "higher fiber")
        elif a_nutrition["fiber"] > b_nutrition["fiber"]:
            a_score += 1
            pct = _pct_more(b_nutrition["fiber"], a_nutrition["fiber"])
            reasons.append(f"{pct}% more fiber" if pct is not None else "higher fiber")

    if b_score > a_score:
        healthier = str(b.get("product_name") or "")
    elif a_score > b_score:
        healthier = str(a.get("product_name") or "")
    else:
        healthier = "TIE"
        reasons = []

    return {
        "product_a": {
            "name": a.get("product_name"),
            "nutrition": a_nutrition,
            "match": a.get("_match"),
        },
        "product_b": {
            "name": b.get("product_name"),
            "nutrition": b_nutrition,
            "match": b.get("_match"),
        },
        "healthier_product": healthier,
        "reasons": reasons,
    }


@app.get("/history", tags=["tracking"])
def history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    return db_service.get_recent_scans(db, user_id=int(current_user.id), limit=20)


@app.delete("/history/{scan_id}", tags=["tracking"])
def delete_history(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    scan = (
        db.query(ScanHistory)
        .filter(
            ScanHistory.id == int(scan_id),
            ScanHistory.user_id == int(current_user.id),
        )
        .first()
    )
    if scan is None:
        raise HTTPException(status_code=404, detail="scan not found")

    db.delete(scan)
    db.commit()
    return {"deleted": True}


@app.get("/stats", tags=["tracking"])
def stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    counts = db_service.get_scan_counts(db, user_id=int(current_user.id))
    most = db_service.get_most_scanned_product(db, user_id=int(current_user.id))
    decisions = db_service.get_decision_counts(db, user_id=int(current_user.id))
    avg_score = db_service.get_average_health_score(db, user_id=int(current_user.id))

    return {
        "total_scans_ever": counts.get("total_scans", 0),
        "scans_this_week": counts.get("scans_this_week", 0),
        "most_scanned_product": most,
        "average_health_score": avg_score,
        "decision_counts": decisions,
    }


@app.get("/user/profile", tags=["user"])
def get_user_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    profile = db_service.get_user_profile(db, user_id=int(current_user.id))
    if profile is None:
        raise HTTPException(status_code=404, detail="user not found")
    return profile


@app.put("/user/profile", tags=["user"])
def update_user_profile(
    req: UserProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    diet_type = req.diet_type
    if isinstance(diet_type, str):
        diet_type = diet_type.strip().lower()
        if not diet_type:
            diet_type = None

    updated = db_service.update_user_profile(
        db,
        user_id=int(current_user.id),
        name=req.name,
        daily_calorie_limit=req.daily_calorie_limit,
        diet_type=diet_type,
        goal_type=req.goal_type,
        goal_target_days=req.goal_target_days,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="user not found")
    return updated


@app.get("/report/daily", tags=["tracking"])
def daily_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return generate_daily_report(db, current_user)


@app.get("/report/weekly", tags=["tracking"])
def weekly_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    week_logs = db_service.get_week_food_logs(db, int(current_user.id))
    daily_summaries = []
    for day_str, logs in week_logs.items():
        total_cal = sum(float(log.get("calories") or 0) for log in logs)
        total_products = len(logs)
        avoid_count = 0
        for log in logs:
            mock = {
                "calories": log["calories"],
                "sugar": log["sugar"],
                "salt": log["salt"],
                "fat": log["fat"],
                "saturated_fat": log.get("saturated_fat"),
                "protein": log["protein"],
                "fiber": log["fiber"],
                "ingredients": log["ingredients"],
                "additives": log["additives"],
            }
            result = compute_food_health_score(mock)
            if result.get("decision") == "AVOID":
                avoid_count += 1
        # Simple day score: 100 - 15*avoid_count - 5*MODERATE (not counted here)
        day_score = max(0, 100 - avoid_count * 15)
        daily_summaries.append(
            {
                "date": day_str,
                "total_calories": round(total_cal, 1),
                "total_products_scanned": total_products,
                "avoid_count": avoid_count,
                "day_score": day_score,
            }
        )
    # Week summary
    if not daily_summaries:
        return {"days": [], "week_summary": {"average_day_score": 0, "best_day": None, "worst_day": None, "trend": "STABLE"}}
    avg_score = sum(d["day_score"] for d in daily_summaries) / len(daily_summaries)
    best = max(daily_summaries, key=lambda d: d["day_score"])
    worst = min(daily_summaries, key=lambda d: d["day_score"])
    # Trend: compare first 3 vs last 3 days
    first_three = [d["day_score"] for d in daily_summaries[-3:]]
    last_three = [d["day_score"] for d in daily_summaries[:3]]
    if len(first_three) == 0 or len(last_three) == 0:
        trend = "STABLE"
    else:
        avg_first = sum(first_three) / len(first_three)
        avg_last = sum(last_three) / len(last_three)
        if avg_last > avg_first + 5:
            trend = "IMPROVING"
        elif avg_last < avg_first - 5:
            trend = "DECLINING"
        else:
            trend = "STABLE"
    return {
        "days": daily_summaries,
        "week_summary": {
            "average_day_score": round(avg_score, 1),
            "best_day": {"date": best["date"], "score": best["day_score"]},
            "worst_day": {"date": worst["date"], "score": worst["day_score"]},
            "trend": trend,
        },
    }


@app.get("/explain/{barcode}", tags=["products"])
def explain_product(
    barcode: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    product = db_service.get_product_by_barcode(db, barcode.strip())
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")
    # Enrich with ingredient/additive analysis for explanation
    product["ingredient_analysis"] = analyze_ingredients(product.get("ingredients"))
    product["additive_analysis"] = analyze_additives(product.get("additives"))
    return explain_score(product, current_user.diet_type)


@app.get("/report/goal", tags=["tracking"])
def goal_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return generate_goal_report(db, current_user)
