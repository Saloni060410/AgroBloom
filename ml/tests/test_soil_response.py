"""How much the dose follows the soil test, and whether the farmer is told when it does not.

The dose is the published standard dose plus the published soil-test adjustment, minus credit. Where the
source publishes no adjustment (wheat nitrogen and phosphorus, rice nitrogen, maize all three), the dose
does not follow that soil value, and that is correct, not a fault. These tests pin that down so it is a
decision, not an accident, and check the explanation says so."""

from datetime import date

import pytest

from src.api.schemas import RecommendRequest
from src.engine.recommendation_engine import Engine, recommend

TODAY = date(2026, 10, 22)
BASE = {"n": 300, "p": 15, "k": 150, "ph": 7.0, "organic_carbon": 0.6, "moisture": 30}


@pytest.fixture(scope="module")
def engine():
    return Engine()


def plan(engine, crop="wheat", stage="sowing", **soil):
    request = RecommendRequest(
        field_id="f", crop_type=crop, irrigation="irrigated", growth_stage=stage, soil={**BASE, **soil},
        weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"},
        previous_fertilizer_usage=[],
    )
    return recommend(request, engine, TODAY)


def doses(response):
    balance = response.explanation.nutrient_balance
    return balance.n.fertilizer_needed_kg_ha, balance.p.fertilizer_needed_kg_ha, balance.k.fertilizer_needed_kg_ha


def adjustment_note(response):
    return next((n for n in response.explanation.data_notes if "publishes no soil-test adjustment" in n), None)


def test_wheat_nitrogen_and_phosphorus_follow_the_published_standard_not_the_soil(engine):
    baseline = doses(plan(engine))
    for change in ({"n": 100}, {"n": 650}, {"p": 4}, {"p": 45}, {"ph": 5.2}, {"ph": 8.8}, {"organic_carbon": 0.2}, {"organic_carbon": 1.2}):
        n, p, _ = doses(plan(engine, **change))
        assert (n, p) == baseline[:2], change


def test_wheat_potassium_does_follow_the_soil_because_the_source_publishes_it(engine):
    # (There is no "very low" band for potassium in the ratings table yet, so low is the lowest.)
    ok = doses(plan(engine, k=150))[2]
    low = doses(plan(engine, k=60))[2]
    assert ok == 0 and low > 0


def test_the_ratings_still_follow_the_soil_values(engine):
    low = plan(engine, n=100).explanation.nutrient_balance.n.soil_rating
    high = plan(engine, n=650).explanation.nutrient_balance.n.soil_rating
    assert (low, high) == ("low", "high")


def test_the_farmer_is_told_which_nutrients_do_not_follow_the_soil(engine):
    wheat = adjustment_note(plan(engine))
    assert "wheat" in wheat and "nitrogen and phosphorus" in wheat and "potassium" not in wheat
    # Still said when potassium does adjust, because nitrogen and phosphorus still do not.
    assert "nitrogen and phosphorus" in adjustment_note(plan(engine, k=60))
    assert "nitrogen." in adjustment_note(plan(engine, crop="rice", stage="transplanting"))
    maize = adjustment_note(plan(engine, crop="maize"))
    assert "nitrogen, phosphorus and potassium" in maize


def test_a_crop_whose_adjustment_is_published_is_not_told_it_has_none(engine):
    # sugarcane has published phosphorus and potassium adjustments, so only nitrogen is left unadjusted
    stage = next(r["stage_id"] for r in engine.tables.growth_stages if r["crop_id"] == "sugarcane")
    note = adjustment_note(plan(engine, crop="sugarcane", stage=stage))
    assert note is not None and "nitrogen." in note and "phosphorus" not in note and "potassium" not in note
