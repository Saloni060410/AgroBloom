"""History in the recommendation: stage from the sowing date, rainfall after nitrogen, a longer
phosphorus/potassium credit, and observations from earlier soil tests. Every case builds on the real
reference tables and rules, so it also checks the new rule keys are present and sensible."""

from datetime import date, timedelta

import pytest
import yaml

from src.api.schemas import RecommendRequest
from src.data_pipeline.soil_data_loader import EXTERNAL_DIR, load_reference_tables
from src.engine.history import rain_after, recent_rain, soil_history_insights, stage_from_sowing
from src.engine.recommendation_engine import Engine, recommend

TODAY = date(2026, 10, 22)
SOIL = {"n": 300, "p": 15, "k": 150, "ph": 7.0, "organic_carbon": 0.6, "moisture": 30}


@pytest.fixture(scope="module")
def tables():
    return load_reference_tables()


@pytest.fixture(scope="module")
def rules():
    return yaml.safe_load((EXTERNAL_DIR / "agronomy_rules.yaml").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def engine():
    return Engine()


def request(**overrides):
    body = {
        "field_id": "f", "crop_type": "wheat", "irrigation": "irrigated", "growth_stage": "sowing",
        "sowing_date": (TODAY - timedelta(days=51)).isoformat(), "soil": SOIL,
        "weather": {"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"},
        "previous_fertilizer_usage": [],
    }
    body.update(overrides)
    return RecommendRequest(**body)


def ago(days):
    return (TODAY - timedelta(days=days)).isoformat()


def nitrogen_credit(response):
    return response.explanation.nutrient_balance.n.prior_credit_kg_ha


# ---- stage from the sowing date -------------------------------------------------------------

def test_stage_is_taken_from_the_sowing_date_when_the_saved_one_is_behind(tables):
    assert stage_from_sowing(tables, "wheat", TODAY - timedelta(days=51), TODAY)["stage_id"] == "second_irrigation"
    assert stage_from_sowing(tables, "wheat", None, TODAY) is None


def test_a_stale_saved_stage_is_moved_forward_and_says_so(engine):
    r = recommend(request(growth_stage="sowing"), engine, TODAY)
    assert r.explanation.stage_used == "second_irrigation"
    assert [line.stage for line in r.recommendation.schedule] == ["second_irrigation"]
    assert any("51 days after sowing" in note for note in r.explanation.data_notes)


def test_a_stage_the_farmer_advanced_is_never_moved_back(engine):
    r = recommend(request(growth_stage="maturity"), engine, TODAY)
    assert r.explanation.stage_used == "maturity"


def test_without_a_sowing_date_the_saved_stage_stands(engine):
    r = recommend(request(growth_stage="sowing", sowing_date=None), engine, TODAY)
    assert r.explanation.stage_used == "sowing"


# ---- rainfall -------------------------------------------------------------------------------

def test_rain_after_counts_only_days_it_has_data_for():
    history = [{"date": "2026-10-10", "mm": 12}, {"date": "2026-10-11", "mm": 30}]
    assert rain_after(history, date(2026, 10, 10), 3) == (42, 2)
    assert recent_rain(history, date(2026, 10, 11), 2) == 42


def test_heavy_rain_after_urea_reduces_its_nitrogen_credit(engine):
    usage = [{"type": "urea", "quantity_kg_per_acre": 100, "applied_on": ago(10)}]
    dry = recommend(request(previous_fertilizer_usage=usage, rainfall_history=[]), engine, TODAY)
    wet = recommend(
        request(previous_fertilizer_usage=usage, rainfall_history=[{"date": ago(9), "mm": 35}, {"date": ago(8), "mm": 10}]),
        engine, TODAY,
    )
    assert nitrogen_credit(wet) == pytest.approx(nitrogen_credit(dry) * 0.5, rel=1e-6)
    assert any("45.0 mm of rain" in n for n in wet.explanation.data_notes)


def test_light_rain_after_urea_changes_nothing(engine):
    usage = [{"type": "urea", "quantity_kg_per_acre": 100, "applied_on": ago(10)}]
    dry = recommend(request(previous_fertilizer_usage=usage), engine, TODAY)
    light = recommend(request(previous_fertilizer_usage=usage, rainfall_history=[{"date": ago(9), "mm": 4}]), engine, TODAY)
    assert nitrogen_credit(light) == nitrogen_credit(dry)


def test_rain_after_a_phosphorus_application_does_not_touch_its_credit(engine):
    usage = [{"type": "dap", "quantity_kg_per_acre": 50, "applied_on": ago(10)}]
    dry = recommend(request(previous_fertilizer_usage=usage), engine, TODAY)
    wet = recommend(request(previous_fertilizer_usage=usage, rainfall_history=[{"date": ago(9), "mm": 90}]), engine, TODAY)
    assert wet.explanation.nutrient_balance.p.prior_credit_kg_ha == dry.explanation.nutrient_balance.p.prior_credit_kg_ha


def test_recent_heavy_rain_holds_top_dressing(engine):
    r = recommend(request(rainfall_history=[{"date": TODAY.isoformat(), "mm": 30}]), engine, TODAY)
    assert any("heavy rain in the last few days" in (line.timing_note or "") for line in r.recommendation.schedule)


# ---- phosphorus and potassium keep their credit for the season ------------------------------

def test_phosphorus_from_a_basal_dap_still_counts_late_in_the_season(engine):
    usage = [{"type": "dap", "quantity_kg_per_acre": 50, "applied_on": ago(90)}]  # past the 60-day nitrogen window
    r = recommend(request(previous_fertilizer_usage=usage), engine, TODAY)
    assert r.explanation.nutrient_balance.p.prior_credit_kg_ha > 0
    assert nitrogen_credit(r) == 0  # nitrogen from that DAP is long gone


# ---- earlier soil tests ---------------------------------------------------------------------

def previous(days, **values):
    return {"tested_on": ago(days), **SOIL, **values}


def test_a_reading_far_from_the_last_test_is_flagged_as_a_possible_misread(tables, rules):
    latest = {**SOIL, "n": 800}
    out = soil_history_insights(tables, rules, latest, TODAY, [previous(40)], TODAY)
    kinds = [(i["kind"], i["nutrient"]) for i in out]
    assert ("soil_jump", "n") in kinds
    assert "check the report" in next(i["text"] for i in out if i["nutrient"] == "n")


def test_ph_and_organic_carbon_jumps_are_flagged(tables, rules):
    out = soil_history_insights(tables, rules, {**SOIL, "ph": 8.6, "organic_carbon": 1.2}, TODAY, [previous(40)], TODAY)
    assert {i["nutrient"] for i in out if i["kind"] == "soil_jump"} == {"ph", "organic_carbon"}


def test_an_old_previous_test_is_not_compared_for_jumps(tables, rules):
    out = soil_history_insights(tables, rules, {**SOIL, "n": 800}, TODAY, [previous(900)], TODAY)
    assert not [i for i in out if i["kind"] == "soil_jump"]


def test_a_rating_that_dropped_is_reported(tables, rules):
    out = soil_history_insights(tables, rules, {**SOIL, "p": 9}, TODAY, [previous(100, p=16)], TODAY)
    item = next(i for i in out if i["kind"] == "rating_dropped")
    assert item["nutrient"] == "p" and item["severity"] == "watch"
    assert "medium to low" in item["text"]


def test_a_rating_that_improved_is_reported_as_good(tables, rules):
    out = soil_history_insights(tables, rules, {**SOIL, "k": 160}, TODAY, [previous(100, k=90)], TODAY)
    assert any(i["kind"] == "rating_improved" and i["severity"] == "good" for i in out)


def test_falling_organic_carbon_over_several_tests_is_reported(tables, rules):
    earlier = [previous(300, organic_carbon=0.7), previous(150, organic_carbon=0.65)]
    out = soil_history_insights(tables, rules, {**SOIL, "organic_carbon": 0.55}, TODAY, earlier, TODAY)
    item = next(i for i in out if i["kind"] == "oc_falling")
    assert "0.7%" in item["text"] and "0.55%" in item["text"] and "manure" in item["text"]


def test_organic_carbon_that_went_up_in_between_is_not_called_falling(tables, rules):
    earlier = [previous(300, organic_carbon=0.55), previous(150, organic_carbon=0.7)]
    out = soil_history_insights(tables, rules, {**SOIL, "organic_carbon": 0.56}, TODAY, earlier, TODAY)
    assert not [i for i in out if i["kind"] == "oc_falling"]


def test_no_earlier_tests_means_no_insights(tables, rules):
    assert soil_history_insights(tables, rules, SOIL, TODAY, [], TODAY) == []


def test_insights_come_back_through_recommend(engine):
    r = recommend(
        request(soil={**SOIL, "n": 800}, soil_tested_on=TODAY.isoformat(), previous_soil_tests=[previous(40)]),
        engine, TODAY,
    )
    assert any(i.kind == "soil_jump" and i.severity == "warning" for i in r.explanation.history_insights)
    # also in data_notes, which every existing screen already renders
    assert any("check the report" in note for note in r.explanation.data_notes)


def test_a_request_without_any_history_fields_still_works_as_before(engine):
    r = recommend(request(growth_stage="second_irrigation"), engine, TODAY)
    assert r.explanation.history_insights == []
    assert r.explanation.stage_used == "second_irrigation"
