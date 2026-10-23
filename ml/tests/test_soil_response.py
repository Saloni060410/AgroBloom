"""How the dose follows the soil test, and whether the farmer is told how.

The dose is the published standard dose plus a soil-test adjustment, minus credit. Where PAU publishes an
adjustment for a crop and nutrient (wheat potassium, rice phosphorus and potassium, ...), that table decides.
Where it publishes none (wheat nitrogen and phosphorus, rice nitrogen, maize all three), the dose follows the
soil's rating BAND by the general ICAR rule: low +25%, medium the standard dose, high -25%, the same anywhere
inside a band. pH and organic carbon have no dose rule, so they never move a dose. These tests pin that down
so it is a decision, not an accident."""

from datetime import date

import pytest

from src.api.schemas import RecommendRequest
from src.engine import recommendation_engine as engine_module
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


def band_note(response):
    return next((n for n in response.explanation.data_notes if "publishes no soil-test adjustment" in n), None)


# ---- the band rule: same inside a band, a step at its edge -------------------------------------

def test_wheat_nitrogen_is_one_dose_inside_each_band_and_steps_at_the_edges(engine):
    low = {doses(plan(engine, n=value))[0] for value in (20, 100, 200, 279)}
    medium = {doses(plan(engine, n=value))[0] for value in (280, 300, 450, 559)}
    high = {doses(plan(engine, n=value))[0] for value in (561, 600, 700)}
    assert len(low) == len(medium) == len(high) == 1
    (low,), (medium,), (high,) = low, medium, high
    assert medium == 123.6  # the published standard dose
    assert low == pytest.approx(medium * 1.25, abs=0.01) and high == pytest.approx(medium * 0.75, abs=0.01)


def test_wheat_phosphorus_steps_at_its_own_band_edges(engine):
    low = {doses(plan(engine, p=value))[1] for value in (2, 5, 9.9)}
    medium = {doses(plan(engine, p=value))[1] for value in (10, 15, 25)}
    high = {doses(plan(engine, p=value))[1] for value in (26, 40)}
    assert len(low) == len(medium) == len(high) == 1
    (low,), (medium,), (high,) = low, medium, high
    assert medium == 61.8 and low == pytest.approx(77.25, abs=0.01) and high == pytest.approx(46.35, abs=0.01)


def test_the_nutrients_move_independently(engine):
    n_low = doses(plan(engine, n=100))
    assert n_low[1] == doses(plan(engine))[1] and n_low[2] == doses(plan(engine))[2]  # P and K untouched
    p_low = doses(plan(engine, p=5))
    assert p_low[0] == doses(plan(engine))[0]


def test_ph_and_organic_carbon_never_move_a_dose(engine):
    baseline = doses(plan(engine))
    for change in ({"ph": 5.2}, {"ph": 8.8}, {"organic_carbon": 0.2}, {"organic_carbon": 1.2}, {"moisture": 80}):
        assert doses(plan(engine, **change)) == baseline, change


def test_a_published_pau_adjustment_still_wins(engine):
    """Wheat potassium has a PAU table (low and very low add MOP). The band rule never touches it: no
    reduction for a high reading either, because PAU publishes none."""
    ok, low, high = (doses(plan(engine, k=value))[2] for value in (150, 60, 450))
    assert ok == 0 and low == pytest.approx(29.7, abs=0.01) and high == 0


def test_the_ratings_follow_the_soil_values(engine):
    ratings = {value: plan(engine, n=value).explanation.nutrient_balance.n.soil_rating for value in (100, 300, 650)}
    assert ratings == {100: "low", 300: "medium", 650: "high"}


def test_switching_the_band_rule_off_goes_back_to_the_plain_standard_dose():
    off = Engine()
    off.rules["soil_rating_fallback"]["enabled"] = False
    assert {doses(plan(off, n=value))[0] for value in (100, 300, 650)} == {123.6}
    assert "so the general ICAR rule" not in band_note(plan(off))
    assert "stay at the standard published dose" in band_note(plan(off))


# ---- the farmer is told ------------------------------------------------------------------------

def test_the_note_names_the_band_and_the_effect(engine):
    note = band_note(plan(engine, n=100))
    assert "wheat" in note and "nitrogen and phosphorus" in note and "potassium" not in note
    assert "nitrogen 100 kg/ha is in the low band, +25% (+30.9 kg/ha)" in note
    assert "phosphorus 15 kg/ha is in the medium band, so the standard dose" in note
    assert "-25% (-30.9 kg/ha)" in band_note(plan(engine, n=600))


def test_the_note_lists_the_right_nutrients_per_crop(engine):
    assert "nitrogen 300" in band_note(plan(engine, crop="rice", stage="transplanting")) and "phosphorus" not in band_note(plan(engine, crop="rice", stage="transplanting"))
    maize = band_note(plan(engine, crop="maize"))
    assert "nitrogen, phosphorus and potassium" in maize
    # sugarcane has published phosphorus and potassium adjustments, so only nitrogen is banded
    stage = next(r["stage_id"] for r in engine.tables.growth_stages if r["crop_id"] == "sugarcane")
    sugarcane = band_note(plan(engine, crop="sugarcane", stage=stage))
    assert sugarcane is not None and "publishes no soil-test adjustment for nitrogen," in sugarcane


def test_the_soil_adjustment_appears_in_the_working(engine):
    balance = plan(engine, n=100).explanation.nutrient_balance
    assert balance.n.soil_adjustment_kg_ha == pytest.approx(30.9, abs=0.01)
    assert balance.n.standard_dose_kg_ha == 123.6
    assert balance.n.fertilizer_needed_kg_ha == pytest.approx(123.6 + 30.9, abs=0.01)
    assert balance.p.soil_adjustment_kg_ha == 0  # medium band: the standard dose


# ---- the band rule with credits, the risk check, and the classifier note ---------------------------

def test_a_credit_comes_off_the_banded_dose_and_never_below_zero(engine):
    """Credit for a recent application is taken off the dose the band rule gave, and the result stops at 0."""
    def needed(kg_per_acre, **soil):
        request = RecommendRequest(
            field_id="f", crop_type="wheat", irrigation="irrigated", growth_stage="sowing", soil={**BASE, **soil},
            weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"},
            previous_fertilizer_usage=[{"type": "urea", "quantity_kg_per_acre": kg_per_acre, "applied_on": "2026-10-10"}],
        )
        return recommend(request, engine, TODAY).explanation.nutrient_balance.n

    low, medium = needed(30, n=100), needed(30, n=300)
    assert low.prior_credit_kg_ha == medium.prior_credit_kg_ha > 0
    assert low.fertilizer_needed_kg_ha - medium.fertilizer_needed_kg_ha == pytest.approx(30.9, abs=0.01)
    assert needed(400, n=100).fertilizer_needed_kg_ha == needed(400, n=300).fertilizer_needed_kg_ha == 0


def test_the_planned_risk_check_uses_the_same_banded_dose(engine):
    from src.api.schemas import RiskScoreRequest
    from src.engine.recommendation_engine import score_planned_risk

    def risk(n):
        request = RiskScoreRequest(
            crop_type="wheat", irrigation="irrigated", growth_stage="sowing", soil={**BASE, "n": n},
            weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"},
            planned_application=[{"fertilizer_type": "urea", "quantity_kg_per_acre": 100}],
        )
        return score_planned_risk(request, engine, TODAY)

    low, high = risk(100), risk(650)
    assert low.model_dump() != high.model_dump()  # a 100 kg/acre urea plan is read against different needs


def test_a_missing_factor_table_means_the_standard_dose_not_a_crash():
    off = Engine()
    del off.rules["soil_rating_fallback"]["factors"]
    assert {doses(plan(off, n=value))[0] for value in (100, 300, 650)} == {123.6}
    assert "stay at the standard published dose" in band_note(plan(off))


def test_the_note_says_the_band_rule_is_not_a_pau_figure(engine):
    assert "not a PAU figure" in band_note(plan(engine, n=600))


def test_a_classifier_trained_on_other_rules_is_left_out_and_health_says_why(monkeypatch):
    stale = Engine()
    if stale.model is None:
        pytest.skip("no classifier trained in this checkout")
    monkeypatch.setattr(engine_module, "_rules_hash8", lambda: "00000000")
    again = Engine()
    assert again.model is None and again.model_stale and again.status == "degraded"
    assert "older rules" in again.status_detail
    assert doses(plan(again)) == doses(plan(stale))  # the plan itself never depended on it
