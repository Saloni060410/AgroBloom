"""When to apply: the dates and the instruction on each line of the schedule.

PAU states the timing for each crop. Wheat nitrogen goes on with the first and second irrigation, the
second finished by 55 days after sowing. Rice nitrogen goes on in three splits counted from TRANSPLANTING
(within 7 days, 21 days, 42 days), not from the nursery sowing the field's sowing date records. These tests
pin the dates so the second rice split can never again be told to a farmer before the crop is planted."""

from datetime import date, timedelta

import pytest

from src.api.schemas import RecommendRequest
from src.engine.history import stage_from_sowing
from src.engine.recommendation_engine import Engine, recommend

SOIL = {"n": 300, "p": 5, "k": 60, "ph": 7.0, "organic_carbon": 0.6, "moisture": 30}
WEATHER = {"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"}


@pytest.fixture(scope="module")
def engine():
    return Engine()


def plan(engine, crop, stage, sowing, today, weather=None, **extra):
    request = RecommendRequest(
        field_id="f", crop_type=crop, irrigation="irrigated", growth_stage=stage, sowing_date=sowing, soil=SOIL,
        weather=weather or WEATHER, previous_fertilizer_usage=[], **extra,
    )
    return recommend(request, engine, today)


def lines(response, product=None, stage=None):
    return [s for s in response.recommendation.schedule if (product is None or s.fertilizer_type == product) and (stage is None or s.stage == stage)]


# ---- rice: nitrogen splits count from transplanting ---------------------------------------------

def test_rice_nitrogen_splits_are_dated_from_transplanting_not_from_nursery_sowing(engine):
    sowing = date(2026, 6, 10)
    response = plan(engine, "rice", "nursery_sowing", sowing.isoformat(), date(2026, 6, 12))
    transplant = sowing + timedelta(days=25)  # PAU: seedlings are ready 25 to 30 days after nursery sowing
    by = {s.stage: s.apply_by for s in lines(response, "urea")}
    assert by["first_n_split"] == transplant + timedelta(days=7)  # within 7 days of transplanting
    assert by["active_tillering"] == transplant + timedelta(days=21)  # 21 days after transplanting
    assert by["panicle_initiation"] == transplant + timedelta(days=42)  # 42 days after transplanting
    assert min(by.values()) > transplant  # no nitrogen is told to a farmer before the crop is in the field


@pytest.mark.parametrize("nursery_day", range(0, 40, 3))
def test_no_rice_nitrogen_is_ever_dated_before_transplanting(engine, nursery_day):
    sowing = date(2026, 6, 1) + timedelta(days=nursery_day)
    response = plan(engine, "rice", "nursery_sowing", sowing.isoformat(), sowing)
    first_day = sowing + timedelta(days=25)
    assert all(s.apply_by > first_day for s in lines(response, "urea"))


def test_rice_stage_follows_the_days_after_transplanting(engine):
    tables = engine.tables
    sowing = date(2026, 6, 10)

    def stage_on(days):
        return (stage_from_sowing(tables, "rice", sowing, sowing + timedelta(days=days)) or {}).get("stage_id")

    assert stage_on(22) == "nursery_sowing"  # still in the nursery: the second split is not due
    assert stage_on(27) == "transplanting"
    assert stage_on(33) == "first_n_split"
    assert stage_on(52) == "active_tillering"
    assert stage_on(70) == "panicle_initiation"


# ---- the date is the best-before day ------------------------------------------------------------

def test_a_nitrogen_top_dressing_is_dated_to_the_last_day_of_its_window(engine):
    response = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1))
    second = lines(response, "urea", "second_irrigation")[0]
    assert second.apply_by == date(2026, 12, 30)  # 55 days after sowing: PAU says the second split is finished by then
    assert "Best between 25 Dec and 30 Dec" in second.timing_note
    assert "7.5% urea solution" in second.timing_note  # PAU's alternative when water stands in the field


def test_basal_phosphorus_and_potash_are_dated_to_the_first_day(engine):
    response = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1))
    assert {s.apply_by for s in lines(response, "dap") + lines(response, "mop")} == {date(2026, 11, 5)}
    assert "Drill all the phosphorus and potash at sowing" in lines(response, "dap")[0].timing_note


def test_a_stage_with_no_pau_day_count_gets_an_approximate_date_that_says_it_is_one(engine):
    """PAU gives no day count for the first irrigation, the knee-high stage and the like. The farmer still gets a
    best-before date for each dose, from an estimate in growth_stages.csv, and the note says it is an estimate."""
    wheat = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1))
    first = lines(wheat, "urea", "crown_root_initiation")[0]
    assert first.apply_by == date(2026, 11, 5) + timedelta(days=28)
    assert first.timing_note.startswith("Broadcast urea with the first irrigation.")
    assert "an estimate" in first.timing_note
    maize = plan(engine, "maize", "sowing", "2026-07-01", date(2026, 6, 28))
    knee = lines(maize, "urea", "knee_high")[0]
    assert knee.apply_by == date(2026, 7, 1) + timedelta(days=35) and "knee-high" in knee.timing_note and "an estimate" in knee.timing_note


def test_a_stage_with_a_pau_day_count_is_never_called_an_estimate(engine):
    wheat = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1))
    assert "estimate" not in lines(wheat, "urea", "second_irrigation")[0].timing_note
    assert "estimate" not in lines(wheat, "dap", "sowing")[0].timing_note


@pytest.mark.parametrize("crop,stage", [("wheat", "sowing"), ("rice", "nursery_sowing"), ("maize", "sowing"), ("cotton", "sowing"), ("sugarcane", "planting"), ("chickpea", "sowing"), ("barley", "sowing")])
def test_every_dose_of_every_crop_has_a_best_before_date(engine, crop, stage):
    response = plan(engine, crop, stage, "2026-11-05", date(2026, 11, 1))
    assert response.recommendation.schedule
    for item in response.recommendation.schedule:
        assert item.apply_by is not None, (crop, item.stage, item.fertilizer_type)
        assert item.apply_by >= date(2026, 11, 5), (crop, item.stage)


@pytest.mark.parametrize("crop,stage", [("wheat", "sowing"), ("rice", "nursery_sowing"), ("maize", "sowing"), ("cotton", "sowing"), ("sugarcane", "planting"), ("chickpea", "sowing"), ("barley", "sowing")])
def test_every_line_of_every_crop_says_when_to_apply(engine, crop, stage):
    response = plan(engine, crop, stage, "2026-11-05", date(2026, 11, 1))
    assert response.recommendation.schedule
    for item in response.recommendation.schedule:
        assert item.timing_note and item.timing_note.strip(), (crop, item.stage, item.fertilizer_type)


def test_a_rain_delay_is_added_as_a_sentence_after_the_instruction(engine):
    rainy = {**WEATHER, "rainfall_mm_forecast": 40}
    response = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1), weather=rainy)
    second = lines(response, "urea", "second_irrigation")[0]
    assert "Delayed 2 days for forecast rain." in second.timing_note
    assert second.apply_by == date(2026, 12, 30) + timedelta(days=2)  # moved later by the hold


# ---- superphosphate ------------------------------------------------------------------------------

def test_wheat_note_says_to_drill_urea_at_sowing_when_superphosphate_is_used(engine):
    response = plan(engine, "wheat", "sowing", "2026-11-05", date(2026, 11, 1))
    note = next(n for n in response.explanation.data_notes if "phosphorus fertilizer in PAU's table" in n)
    assert "SSP (Single Superphosphate)" in note and "drill 20 kg/acre of the urea at sowing" in note


# ---- timing data must never invalidate the product classifier ------------------------------------

def test_changing_the_timing_estimates_does_not_make_the_classifier_out_of_date(tmp_path, monkeypatch):
    """The classifier learns which products a plan has. The estimated dates say when, so editing them must
    leave the rules hash alone (or the model would be left out and need retraining for no reason), while a
    change to anything that decides a product or a dose must still change it."""
    import shutil

    from src.engine import recommendation_engine as module

    shutil.copytree(module.EXTERNAL_DIR, tmp_path / "external")
    monkeypatch.setattr(module, "EXTERNAL_DIR", tmp_path / "external")
    before = module._rules_hash8()

    estimates = tmp_path / "external" / "stage_timing_estimates.csv"
    estimates.write_text(estimates.read_text().replace(",21,28,", ",30,40,"), encoding="utf-8")
    assert module._rules_hash8() == before

    doses = tmp_path / "external" / "reference_doses.csv"
    doses.write_text(doses.read_text() + "\n", encoding="utf-8")
    assert module._rules_hash8() != before


def test_the_registered_classifier_still_matches_the_rules_after_the_timing_estimates(engine):
    assert not engine.model_stale
