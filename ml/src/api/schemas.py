"""Request/response schemas for the ML service. Must match docs/api-contract.md exactly.

S7: every request/response model carries a full `json_schema_extra["example"]` so /docs
(Swagger) shows a realistic, pre-filled example for every field, not an empty or all-zeros
body. The four request/response fixtures are read from docs/contract-fixtures/ directly --
one example, reused, instead of a second hand-maintained copy that can drift from it.

`docs/` is a sibling of `ml/` in the monorepo checkout, but the Docker image (ml/Dockerfile,
S9) packages only `ml/`'s own contents -- `docs/contract-fixtures/` isn't in the image, on
purpose (the contract docs aren't service code). `_fixture_example` must degrade to no example
rather than crash: a missing OpenAPI example is a cosmetic /docs gap, not a reason the whole
service should fail to start.
"""

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "docs" / "contract-fixtures"


def _fixture_example(name: str) -> dict | None:
    try:
        payload = json.loads((_FIXTURES_DIR / name).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    payload.pop("_note", None)
    return payload


def _example_config(name: str) -> ConfigDict:
    """`ConfigDict(json_schema_extra={"example": ...})` when the fixture is reachable, else a
    plain `ConfigDict()` so /docs falls back to pydantic's own generated example instead of
    showing a misleading empty one."""
    example = _fixture_example(name)
    return ConfigDict(json_schema_extra={"example": example}) if example is not None else ConfigDict()


class Soil(BaseModel):
    """The soil schema is fixed by the problem statement. Do not add or rename fields."""

    n: float = Field(ge=0)
    p: float = Field(ge=0)
    k: float = Field(ge=0)
    ph: float = Field(ge=0, le=14)
    organic_carbon: float = Field(ge=0, le=100)
    moisture: float = Field(ge=0, le=100)


class Weather(BaseModel):
    temperature_c: float
    humidity_pct: float = Field(ge=0, le=100)
    rainfall_mm_forecast: float = Field(ge=0)
    source: Literal["live", "cached", "seasonal_average"] = "live"


class FertilizerUsage(BaseModel):
    type: str
    quantity_kg_per_acre: float = Field(ge=0)
    applied_on: date


class PreviousSoilTest(BaseModel):
    """An earlier soil test of the same field (the latest one travels as `soil`)."""

    tested_on: date
    n: float = Field(ge=0)
    p: float = Field(ge=0)
    k: float = Field(ge=0)
    ph: float = Field(ge=0, le=14)
    organic_carbon: float = Field(ge=0, le=100)
    moisture: float = Field(ge=0, le=100)


class DailyRain(BaseModel):
    """Rain that actually fell on one day at the field, mm."""

    date: date
    mm: float = Field(ge=0)


class PlannedApplication(BaseModel):
    fertilizer_type: str
    quantity_kg_per_acre: float = Field(ge=0)


class RecommendRequest(BaseModel):
    model_config = _example_config("recommend_request.json")

    field_id: str
    crop_type: str
    variety: str | None = None
    irrigation: Literal["irrigated", "rainfed"] | None = None
    growth_stage: str
    sowing_date: date | None = None
    soil: Soil
    weather: Weather
    previous_fertilizer_usage: list[FertilizerUsage] = []
    # History the engine can use when the backend supplies it. All optional: without them the
    # recommendation is exactly what it was before they existed.
    soil_tested_on: date | None = None
    previous_soil_tests: list[PreviousSoilTest] = []
    rainfall_history: list[DailyRain] = []


class RiskScoreRequest(BaseModel):
    model_config = _example_config("risk_score_request.json")

    crop_type: str
    variety: str | None = None
    irrigation: Literal["irrigated", "rainfed"] | None = None
    growth_stage: str
    sowing_date: date | None = None
    soil: Soil
    weather: Weather
    previous_fertilizer_usage: list[FertilizerUsage] = []
    planned_application: list[PlannedApplication]


class ScheduleItem(BaseModel):
    stage: str
    fertilizer_type: str
    quantity_kg_per_acre: float
    apply_by: date | None = None
    timing_note: str | None = None


class Recommendation(BaseModel):
    fertilizer_type: str
    quantity_kg_per_acre: float
    schedule: list[ScheduleItem]


class Risk(BaseModel):
    level: Literal["low", "medium", "high"]
    reason: str
    soil_health_impact: str
    yield_impact: str
    over_application_pct: float | None = None


class NutrientPlan(BaseModel):
    method: Literal["reference_dose", "stcr"]
    soil_rating: Literal["very_low", "low", "medium", "high"] | None = None
    standard_dose_kg_ha: float
    soil_adjustment_kg_ha: float
    prior_credit_kg_ha: float
    fertilizer_needed_kg_ha: float


class NutrientBalance(BaseModel):
    n: NutrientPlan
    p: NutrientPlan
    k: NutrientPlan


class HistoryInsight(BaseModel):
    """One observation drawn from the field's earlier soil tests."""

    kind: str
    severity: Literal["warning", "watch", "good"]
    nutrient: str | None = None
    text: str


class Explanation(BaseModel):
    top_factors: list[str]
    nutrient_balance: NutrientBalance
    formula: str
    data_notes: list[str] = []
    history_insights: list[HistoryInsight] = []
    # The stage the plan was built for. It is the saved stage unless the sowing date shows the crop
    # has moved on, in which case it is the later stage (and data_notes says so).
    stage_used: str | None = None


class CostLine(BaseModel):
    fertilizer_type: str
    quantity_kg_per_acre: float
    cost_inr_per_acre: float


class Cost(BaseModel):
    estimated_cost_inr_per_acre: float
    previous_cost_inr_per_acre: float | None = None
    saving_inr_per_acre: float | None = None
    prices_as_of: date | None = None
    breakdown: list[CostLine] = []


class Impact(BaseModel):
    over_application_reduction_pct: float | None = None


class RecommendResponse(BaseModel):
    model_config = _example_config("recommend_response.json")

    recommendation: Recommendation
    risk: Risk
    explanation: Explanation
    cost: Cost
    impact: Impact
    model_version: str


class AppliedVsRecommended(BaseModel):
    applied_kg_ha: float
    recommended_kg_ha: float
    ratio: float | None  # None: the crop needs none of this nutrient but some is planned (the ratio is infinite)


class AppliedBalance(BaseModel):
    n: AppliedVsRecommended
    p: AppliedVsRecommended
    k: AppliedVsRecommended


class RiskScoreResponse(BaseModel):
    model_config = _example_config("risk_score_response.json")

    risk: Risk
    nutrient_balance: AppliedBalance
    model_version: str


class HealthResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"status": "ok", "model_version": "fertilizer-classifier-0.1.0+rules-f22bca59", "detail": None}
        }
    )

    status: Literal["ok", "degraded"]
    model_version: str
    detail: str | None = None


class ReferenceVariety(BaseModel):
    id: str
    name_en: str
    name_hi: str | None = None


class ReferenceStage(BaseModel):
    id: str
    name_en: str
    name_hi: str | None = None
    order: int


class ReferenceCrop(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "wheat",
                "name_en": "Wheat",
                "name_hi": "गेहूं",
                "varieties": [{"id": "wh_542", "name_en": "WH 542", "name_hi": None}],
                "stages": [{"id": "sowing", "name_en": "Sowing", "name_hi": None, "order": 1}],
            }
        }
    )

    id: str
    name_en: str
    name_hi: str | None = None
    varieties: list[ReferenceVariety] = []
    stages: list[ReferenceStage] = []


class SoilRating(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"parameter": "k", "unit": "kg/ha", "very_low_below": 60.0, "low_below": 120.0, "high_above": 280.0}
        }
    )

    parameter: str
    unit: str
    very_low_below: float | None = None
    low_below: float
    high_above: float


class FertilizerProduct(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "urea",
                "name": "Urea",
                "n_pct": 46.0,
                "p2o5_pct": 0.0,
                "k2o_pct": 0.0,
                "price_inr_per_kg": 5.92,
                "price_date": "2025-01-01",
                "bag_size_kg": 45.0,
            }
        }
    )

    id: str
    name: str
    n_pct: float
    p2o5_pct: float
    k2o_pct: float
    price_inr_per_kg: float | None = None  # None: no verified price yet; the product can still be planned and logged
    price_date: date | None = None
    bag_size_kg: float | None = None


class SeasonalWeather(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"temperature_c": 24.0, "humidity_pct": 55.0, "rainfall_mm_forecast": 3.2, "source": "seasonal_average"}
        }
    )

    temperature_c: float
    humidity_pct: float
    rainfall_mm_forecast: float
    source: Literal["seasonal_average"] = "seasonal_average"


class ValidationErrorDetail(BaseModel):
    """Shape of one entry in a 422 response's `detail` list (docs/api-contract.md rule 9,
    docs/contract-fixtures/error_422.json) -- the same shape FastAPI's own pydantic validation
    errors already use, which is why business-logic 422s (src/api/errors.py) are made to match
    it too, instead of introducing a second error shape."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"loc": ["body", "soil", "ph"], "msg": "Input should be less than or equal to 14", "type": "value_error"}
        }
    )

    loc: list[str | int]
    msg: str
    type: str


class ValidationErrorResponse(BaseModel):
    detail: list[ValidationErrorDetail]


class ServiceUnavailableResponse(BaseModel):
    """503 shape (docs/api-contract.md rule 9, docs/contract-fixtures/error_503.json): the
    model or a reference table is missing. Never invented data, never a 200 with a guess."""

    model_config = ConfigDict(
        json_schema_extra={"example": {"detail": "Reference data is unavailable: reference_doses.csv is missing"}}
    )

    detail: str
