from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.models import Nutrition, Product, ScanSession, User
from services import db_service
from services.additive_analyzer import analyze_additives
from services.food_health_score import compute_diet_aware_score, compute_food_health_score
from services.ingredient_analyzer import analyze_ingredients
from services.recommendation_engine import get_healthier_alternatives


class NutritionValues(BaseModel):
    calories: float | None = None
    carbs: float | None = None
    fat: float | None = None
    protein: float | None = None
    salt: float | None = None
    sugar: float | None = None
    fiber: float | None = None


class PortionSummary(BaseModel):
    weight_grams: float
    nutrition: NutritionValues


class StandoutNutrient(BaseModel):
    nutrient: str
    label: str
    value: float
    unit: str = "g"
    reason: str


class NutrientExplanation(BaseModel):
    nutrient: str
    explanation: str


class Suitability(BaseModel):
    status: Literal["GENERAL VIEW", "GOOD FIT", "LIMITED", "NOT IDEAL"]
    explanation: str
    profile_used: bool


class IngredientInsights(BaseModel):
    available: bool
    risk_level: str | None = None
    findings: list[str] = Field(default_factory=list)


class Alternative(BaseModel):
    product_name: str
    brand: str | None = None
    nutrition_per_100g: NutritionValues
    reason: str
    comparison_reasons: list[str] = Field(default_factory=list)
    source: str


class SmallerPortion(BaseModel):
    suggested_weight_grams: float
    nutrition: NutritionValues


class DailyContext(BaseModel):
    target_calories: float
    consumed_calories: float
    remaining_calories: float
    portion_percent_of_target: float | None = None


class NutritionIntelligence(BaseModel):
    portion_summary: PortionSummary
    standout_nutrients: list[StandoutNutrient] = Field(default_factory=list)
    nutrient_explanations: list[NutrientExplanation] = Field(default_factory=list)
    suitability: Suitability
    suitability_reasons: list[str] = Field(default_factory=list)
    ingredient_insights: IngredientInsights
    alternative: Alternative | None = None
    smaller_portion: SmallerPortion
    daily_context: DailyContext | None = None


_LABELS = {
    "calories": ("Calories", "kcal"),
    "carbs": ("Carbs", "g"),
    "fat": ("Fat", "g"),
    "protein": ("Protein", "g"),
    "salt": ("Salt", "g"),
}


def _number(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _nutrition_values(values: dict[str, Any]) -> NutritionValues:
    return NutritionValues(
        **{key: _number(values.get(key)) for key in NutritionValues.model_fields}
    )


def _standouts(portion: dict[str, Any]) -> list[StandoutNutrient]:
    candidates: list[tuple[float, str, str]] = []
    for key in ("calories", "salt", "sugar", "fat", "carbs", "protein"):
        value = _number(portion.get(key))
        if value is None:
            continue
        # These thresholds keep the section focused on portion-relevant values.
        threshold = {"calories": 200, "salt": 1, "sugar": 10, "fat": 15, "carbs": 30, "protein": 10}[key]
        if value >= threshold:
            candidates.append((value, key, _standout_reason(key)))

    candidates.sort(reverse=True)
    return [
        StandoutNutrient(
            nutrient=key,
            label=_LABELS.get(key, (key.title(), "g"))[0],
            value=value,
            unit=_LABELS.get(key, (key.title(), "g"))[1],
            reason=reason,
        )
        for value, key, reason in candidates[:3]
    ]


def _standout_reason(nutrient: str) -> str:
    return {
        "calories": "A substantial calorie contribution for this portion.",
        "carbs": "A high carbohydrate contribution for this portion.",
        "fat": "A high fat contribution for this portion.",
        "protein": "A meaningful protein contribution for this portion.",
        "salt": "A high salt contribution for this portion.",
        "sugar": "A high sugar contribution for this portion.",
    }[nutrient]


def _explanations(standouts: list[StandoutNutrient]) -> list[NutrientExplanation]:
    explanations = {
        "calories": "This is the energy cost of the measured portion, so it has a noticeable effect on your daily intake.",
        "carbs": "This portion supplies a large share of its energy as carbohydrates, which matters when managing your overall intake.",
        "fat": "This portion gets a substantial amount of its energy from fat, making portion size especially relevant.",
        "protein": "This portion provides a meaningful amount of protein, which can make it more filling than the calories alone suggest.",
        "salt": "This portion contributes a noticeable amount of salt, so the rest of the day's salty foods matter more.",
        "sugar": "This portion contributes a high amount of sugar, which is important to account for in the rest of the day's intake.",
    }
    return [
        NutrientExplanation(nutrient=item.nutrient, explanation=explanations[item.nutrient])
        for item in standouts
        if item.nutrient in explanations
    ]


def _ingredient_insights(product: Product) -> IngredientInsights:
    ingredient = analyze_ingredients(product.ingredients)
    additive = analyze_additives(product.additives)
    findings: list[str] = []
    findings.extend(f"Flagged ingredient: {flag}" for flag in ingredient.get("flags", [])[:3])
    findings.extend(
        f"{item.get('code')}: {item.get('name')}"
        for item in additive.get("additives", [])[:3]
    )
    available = bool(product.ingredients or product.additives)
    if not available:
        return IngredientInsights(available=False, findings=[])
    return IngredientInsights(
        available=True,
        risk_level=max(
            (str(ingredient.get("risk_level") or "LOW"), str(additive.get("risk_level") or "LOW")),
            key={"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get,
        ),
        findings=findings,
    )


def _suitability(user: User, product_data: dict[str, Any], score: dict[str, Any]) -> tuple[Suitability, list[str]]:
    profile_used = bool(user.diet_type or user.goal_type)
    reasons: list[str] = []
    if user.diet_type:
        if score.get("diet_note"):
            reasons.append(str(score["diet_note"]))
        if str(score.get("decision") or "").upper() == "AVOID":
            status: Literal["GOOD FIT", "LIMITED", "NOT IDEAL"] = "NOT IDEAL"
        elif str(score.get("decision") or "").upper() == "MODERATE":
            status = "LIMITED"
        else:
            status = "GOOD FIT"
        explanation = f"Based on your {user.diet_type} profile and this portion's nutrition."
    elif user.goal_type:
        calories = _number(product_data.get("calories"))
        if calories is not None and calories > 400:
            status = "LIMITED"
            reasons.append("The portion is relatively energy-dense.")
        else:
            status = "GOOD FIT"
        explanation = f"Based on your {user.goal_type} goal and the measured portion."
    else:
        status = "GENERAL VIEW"
        explanation = "No personal goal is set yet, so this assessment is based on the measured portion and product nutrition rather than a personal health goal."
    if score.get("reason"):
        reasons.append(str(score["reason"]))
    return Suitability(status=status, explanation=explanation, profile_used=profile_used), reasons[:4]


def _alternative_comparisons(
    base: dict[str, Any],
    alternative: dict[str, Any],
) -> list[str]:
    comparisons: list[str] = []
    lower = (
        ("calories", "calories"),
        ("sugar", "sugar"),
        ("fat", "fat"),
        ("salt", "salt"),
    )
    higher = (("protein", "protein"), ("fiber", "fiber"))
    for key, label in lower:
        base_value = _number(base.get(key))
        alternative_value = _number(alternative.get(key))
        if base_value is not None and alternative_value is not None and alternative_value < base_value:
            comparisons.append(
                f"Lower {label}: {alternative_value:g} vs {base_value:g} per 100 g."
            )
    for key, label in higher:
        base_value = _number(base.get(key))
        alternative_value = _number(alternative.get(key))
        if base_value is not None and alternative_value is not None and alternative_value > base_value:
            comparisons.append(
                f"Higher {label}: {alternative_value:g} vs {base_value:g} per 100 g."
            )
    return comparisons[:3]


def build_nutrition_intelligence(
    db: Session,
    *,
    session: ScanSession,
    user: User,
    portion: dict[str, Any],
) -> NutritionIntelligence:
    product = db.get(Product, session.product_id) if session.product_id is not None else None
    nutrition = db.get(Nutrition, session.product_id) if session.product_id is not None else None
    if product is None or nutrition is None or session.measurement is None:
        raise ValueError("product and measurement are required for nutrition intelligence")

    product_data = {
        "product_name": product.product_name,
        "calories": nutrition.calories,
        "carbs": nutrition.carbs,
        "fat": nutrition.fat,
        "protein": nutrition.protein,
        "salt": nutrition.salt,
        "sugar": nutrition.sugar,
        "fiber": nutrition.fiber,
        "nutriscore": product.nutriscore,
        "ingredients": product.ingredients,
        "additives": product.additives,
    }
    product_data["ingredient_analysis"] = analyze_ingredients(product.ingredients)
    product_data["additive_analysis"] = analyze_additives(product.additives)
    score = compute_diet_aware_score(product_data, user.diet_type) if user.diet_type else compute_food_health_score(product_data)

    weight = float(session.measurement.weight_grams)
    suggested_weight = max(1.0, round(weight * 0.5, 1))
    smaller = {
        key: (value * suggested_weight / weight if _number(value) is not None and weight else None)
        for key, value in portion.items()
    }
    alternatives = get_healthier_alternatives(product.product_name, product_data, limit=1)
    alternative = None
    if alternatives:
        candidate = alternatives[0]
        alternative_nutrition = candidate.get("nutrition") or {}
        comparison_reasons = _alternative_comparisons(product_data, alternative_nutrition)
        alternative = Alternative(
            product_name=candidate["product_name"],
            brand=candidate.get("brand"),
            nutrition_per_100g=_nutrition_values(alternative_nutrition),
            reason=candidate["reason"],
            comparison_reasons=comparison_reasons,
            source=candidate["source"],
        )

    target = _number(user.daily_calorie_limit)
    consumed = db_service.get_today_calories(db, user_id=int(user.id))
    daily = None
    if target is not None and target > 0:
        daily = DailyContext(
            target_calories=target,
            consumed_calories=consumed,
            remaining_calories=target - consumed,
            portion_percent_of_target=(
                round(float(portion["calories"]) / target * 100, 1)
                if _number(portion.get("calories")) is not None else None
            ),
        )

    suitability, suitability_reasons = _suitability(user, product_data, score)
    standouts = _standouts(portion)
    return NutritionIntelligence(
        portion_summary=PortionSummary(weight_grams=weight, nutrition=_nutrition_values(portion)),
        standout_nutrients=standouts,
        nutrient_explanations=_explanations(standouts),
        suitability=suitability,
        suitability_reasons=suitability_reasons,
        ingredient_insights=_ingredient_insights(product),
        alternative=alternative,
        smaller_portion=SmallerPortion(
            suggested_weight_grams=suggested_weight,
            nutrition=_nutrition_values(smaller),
        ),
        daily_context=daily,
    )
