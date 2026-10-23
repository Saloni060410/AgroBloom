"""The rest of the app can name and check every product a plan uses, and an unneeded nutrient is not a crash."""

from datetime import date

import pytest

from src.engine.recommendation_engine import Engine

TODAY = date(2026, 10, 22)
MEDIUM = {"n": 300, "p": 15, "k": 150, "ph": 7.0, "organic_carbon": 0.6, "moisture": 30}


@pytest.fixture(scope="module")
def engine():
    return Engine()


# ---- the rest of the app can name and check every product a plan uses --------------------------

def test_every_product_a_plan_can_use_is_in_the_fertilizer_reference(use_settings):
    from fastapi.testclient import TestClient

    from src.api.main import app

    use_settings(predict_mode="real")
    products = {p["id"]: p for p in TestClient(app).get("/reference/fertilizers").json()}
    assert {"urea", "dap", "mop", "ssp", "np_20_20_0"} <= set(products)
    assert products["ssp"]["price_inr_per_kg"] is None and products["ssp"]["p2o5_pct"] == 16
    assert products["urea"]["price_inr_per_kg"] is not None


@pytest.mark.parametrize("planned", ["ssp", "dap"])
def test_planning_phosphorus_the_crop_does_not_need_returns_a_null_ratio_not_a_crash(engine, planned):
    """Sugarcane on a medium-phosphorus soil needs none. The ratio of planned to needed is infinite, which
    cannot be sent as JSON: it used to be an HTTP 500."""
    from src.api.schemas import RiskScoreRequest
    from src.engine.recommendation_engine import score_planned_risk

    request = RiskScoreRequest(
        crop_type="sugarcane", irrigation="irrigated", growth_stage="planting", soil=MEDIUM,
        weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"},
        planned_application=[{"fertilizer_type": planned, "quantity_kg_per_acre": 60}],
    )
    response = score_planned_risk(request, engine, TODAY)
    assert response.nutrient_balance.p.ratio is None
    assert response.model_dump_json()  # serialises
