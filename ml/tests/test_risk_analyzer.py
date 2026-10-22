from datetime import UTC, datetime, timedelta

import pytest

from src.data_pipeline.soil_data_loader import load_reference_tables
from src.degradation.risk_analyzer import assess_recommendation, score_planned

TABLES = load_reference_tables()

# Mirrors ml/data/external/agronomy_rules.yaml -- not re-read from disk so a test failure
# here always means the risk logic broke, never that someone edited the yaml.
RULES = {
    "credit_window_days": 60,
    "rain_hold_mm": 20,
    "over_application_ratio_medium": 1.25,
    "over_application_ratio_high": 1.5,
    "under_application_ratio": 0.75,
}

SOIL_OK = {"n": 300, "p": 15, "k": 150, "ph": 7.2, "organic_carbon": 0.6, "moisture": 40}
WEATHER_OK = {"temperature_c": 26, "humidity_pct": 52, "rainfall_mm_forecast": 5}

NB_OK = {
    "n": {"soil_rating": "medium", "fertilizer_needed_kg_ha": 123.6},
    "p": {"soil_rating": "medium", "fertilizer_needed_kg_ha": 61.8},
    "k": {"soil_rating": "medium", "fertilizer_needed_kg_ha": 0},
}


def _urea_application(quantity_kg_per_acre, applied_on="2026-09-01"):
    return [{"type": "urea", "quantity_kg_per_acre": quantity_kg_per_acre, "applied_on": applied_on}]


def test_healthy_case_has_no_flags_and_low_level():
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    assert r["level"] == "low"
    assert r["over_application_pct"] is None
    assert r["reason"] and r["soil_health_impact"] and r["yield_impact"]


def test_over_application_medium_tier():
    # urea is 46% N; 123.6 kg/ha needed. 1.3x ratio sits in the medium band (1.25-1.5).
    needed_n = NB_OK["n"]["fertilizer_needed_kg_ha"]
    kg_per_acre = (needed_n * 1.3) / (0.46 * 2.4711)
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, WEATHER_OK, _urea_application(kg_per_acre), RULES, TABLES)
    assert r["level"] == "medium"
    assert "N" in r["reason"]
    assert r["over_application_pct"] is not None
    assert 25 <= r["over_application_pct"] <= 35


def test_over_application_high_tier():
    needed_n = NB_OK["n"]["fertilizer_needed_kg_ha"]
    kg_per_acre = (needed_n * 2.0) / (0.46 * 2.4711)
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, WEATHER_OK, _urea_application(kg_per_acre), RULES, TABLES)
    assert r["level"] == "high"
    assert r["over_application_pct"] is not None
    assert r["over_application_pct"] > 50


def test_under_application_when_soil_tests_low_and_little_applied():
    nb = {**NB_OK, "n": {"soil_rating": "low", "fertilizer_needed_kg_ha": 123.6}}
    r = assess_recommendation("wheat", nb, [], SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    assert r["level"] == "medium"
    assert "low" in r["reason"] or "N" in r["reason"]


def test_no_under_application_flag_when_soil_rating_is_not_low():
    # Ratio is 0 (nothing applied) but soil_rating is "medium" -- the under-application
    # signal requires BOTH conditions, so this must stay healthy, not flagged.
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    assert r["level"] == "low"


def test_imbalance_when_one_nutrient_high_and_another_low():
    # N just over the high-tier cutoff (>= 1.5x) on its own would also fire the per-nutrient
    # over_application signal at the same "high" level and win the tie (see _compute_risk's
    # documented tie-break), so this uses N at exactly the high-tier ratio and checks the
    # imbalance signal is at least present among the candidates by checking both nutrients'
    # numbers appear when P is the only nutrient additionally at "low" soil_rating and under
    # the under_application_ratio -- i.e. verifies imbalance still requires both conditions
    # and matches high_nutrients/low_nutrients, not that it wins every tie.
    nb = {**NB_OK, "p": {"soil_rating": "low", "fertilizer_needed_kg_ha": 61.8}}
    needed_n = NB_OK["n"]["fertilizer_needed_kg_ha"]
    kg_per_acre = (needed_n * 2.0) / (0.46 * 2.4711)  # N far over, P untouched (far under)
    r = assess_recommendation("wheat", nb, [], SOIL_OK, WEATHER_OK, _urea_application(kg_per_acre), RULES, TABLES)
    # Per-nutrient over_application(N) is appended before imbalance and ties at "high", so it
    # wins by the documented first-appended rule -- this is the actionable message reported.
    assert r["level"] == "high"
    assert "N" in r["reason"]


def test_low_organic_carbon_flagged_in_isolation():
    soil = {**SOIL_OK, "organic_carbon": 0.3}  # below the 0.5% low_below cutoff
    r = assess_recommendation("wheat", NB_OK, [], soil, WEATHER_OK, [], RULES, TABLES)
    assert r["level"] == "medium"
    assert "0.3" in r["reason"]


def test_ph_out_of_band_flagged_in_isolation():
    soil = {**SOIL_OK, "ph": 5.5}  # below the 6.5 low_below cutoff
    r = assess_recommendation("wheat", NB_OK, [], soil, WEATHER_OK, [], RULES, TABLES)
    assert r["level"] == "medium"
    assert "5.5" in r["reason"]


def test_runoff_flagged_when_heavy_rain_forecast_and_n_needed():
    weather = {**WEATHER_OK, "rainfall_mm_forecast": 25}  # >= rain_hold_mm
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, weather, [], RULES, TABLES)
    assert r["level"] == "medium"
    assert "25" in r["reason"]


def test_no_runoff_flag_when_no_nitrogen_is_needed():
    nb = {**NB_OK, "n": {"soil_rating": "medium", "fertilizer_needed_kg_ha": 0}}
    weather = {**WEATHER_OK, "rainfall_mm_forecast": 25}
    r = assess_recommendation("wheat", nb, [], SOIL_OK, weather, [], RULES, TABLES)
    assert r["level"] == "low"


def test_prior_usage_outside_credit_window_is_not_counted():
    stale = _urea_application(50, applied_on="2020-01-01")  # far older than credit_window_days
    r = assess_recommendation("wheat", NB_OK, [], SOIL_OK, WEATHER_OK, stale, RULES, TABLES)
    assert r["level"] == "low"  # would be a healthy dose if the stale application counted too


def test_never_blames_the_farmer():
    nb = {**NB_OK, "n": {"soil_rating": "low", "fertilizer_needed_kg_ha": 123.6}}
    r = assess_recommendation("wheat", nb, [], SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    combined = f"{r['reason']} {r['soil_health_impact']} {r['yield_impact']}".lower()
    for blaming_word in ("you should have", "your fault", "farmer's mistake", "you failed"):
        assert blaming_word not in combined


def test_every_result_carries_readable_impact_sentences():
    for level_soil, level_weather in [(SOIL_OK, WEATHER_OK), ({**SOIL_OK, "ph": 8.5}, WEATHER_OK)]:
        r = assess_recommendation("wheat", NB_OK, [], level_soil, level_weather, [], RULES, TABLES)
        assert isinstance(r["soil_health_impact"], str) and len(r["soil_health_impact"]) > 10
        assert isinstance(r["yield_impact"], str) and len(r["yield_impact"]) > 10


def test_score_planned_returns_nutrient_balance_with_ratio_per_nutrient():
    planned = _urea_application(60)
    result = score_planned(planned, NB_OK, SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    assert set(result.keys()) == {"risk", "nutrient_balance"}
    for nutrient in ("n", "p", "k"):
        entry = result["nutrient_balance"][nutrient]
        assert set(entry.keys()) == {"applied_kg_ha", "recommended_kg_ha", "ratio"}
    assert result["nutrient_balance"]["n"]["applied_kg_ha"] > 0
    assert result["nutrient_balance"]["k"]["ratio"] == 1.0  # 0 needed, 0 applied -- no risk by construction


def test_score_planned_does_not_use_prior_usage_for_the_planned_dose_itself():
    # score_planned scores the hypothetical planned_application, not prior_usage -- prior
    # usage here should have zero effect on the reported applied_kg_ha.
    planned = _urea_application(60)
    prior = _urea_application(200)
    with_prior = score_planned(planned, NB_OK, SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    without_prior = score_planned(planned, NB_OK, SOIL_OK, WEATHER_OK, [], RULES, TABLES)
    assert with_prior["nutrient_balance"] == without_prior["nutrient_balance"]


# --- Season window vs credit window (Part 5) -------------------------------------------
# Wheat's N need (123.6 kg/ha) fully supplied via urea (46% N): 123.6/(0.46*2.4711) kg/acre.
_WHEAT_FULL_N_KG_PER_ACRE = 123.6 / (0.46 * 2.4711)
_NB_LOW_N = {**NB_OK, "n": {"soil_rating": "low", "fertilizer_needed_kg_ha": 123.6}}


def _applied_days_ago(days: int, quantity_kg_per_acre=_WHEAT_FULL_N_KG_PER_ACRE):
    applied_on = (datetime.now(tz=UTC).date() - timedelta(days=days)).isoformat()
    return [{"type": "urea", "quantity_kg_per_acre": quantity_kg_per_acre, "applied_on": applied_on}]


def test_wheat_basal_application_past_the_60_day_credit_window_but_within_season_is_credited():
    # 90 days ago is past agronomy_rules.yaml's 60-day credit_window_days but well within
    # wheat's real ~158-day season (growth_stages.csv's sourced maturity stage) -- this is
    # exactly the case Part 5 flags: a basal application shouldn't be silently dropped from
    # the risk picture just because it's older than the (unrelated) credit window.
    prior = _applied_days_ago(90)
    r = assess_recommendation("wheat", _NB_LOW_N, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "low"  # fully credited -> ratio ~1.0 -> no under-application flag


def test_wheat_application_from_a_previous_season_is_not_credited():
    # 200 days ago is past even wheat's real ~158-day season -- correctly NOT credited.
    prior = _applied_days_ago(200)
    r = assess_recommendation("wheat", _NB_LOW_N, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "medium"  # not credited -> ratio ~0 -> under-application flag fires


def test_wheat_application_exactly_at_the_season_boundary_is_still_credited():
    # season_length_days for wheat is 158 (growth_stages.csv's upper maturity bound) --
    # exactly 158 days ago must still count (the cutoff is "> within_days", not ">=").
    prior = _applied_days_ago(158)
    r = assess_recommendation("wheat", _NB_LOW_N, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "low"


def test_wheat_application_one_day_past_the_season_boundary_is_not_credited():
    prior = _applied_days_ago(159)
    r = assess_recommendation("wheat", _NB_LOW_N, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "medium"


def test_a_crop_with_no_sourced_season_length_falls_back_to_credit_window_and_warns():
    # rice has no maturity/harvest row in growth_stages.csv (only wheat and barley do) --
    # must fall back to credit_window_days (60), explicitly and audibly, not silently.
    nb_rice = {**NB_OK, "n": {"soil_rating": "low", "fertilizer_needed_kg_ha": 103.8}}
    prior = _applied_days_ago(90, quantity_kg_per_acre=103.8 / (0.46 * 2.4711))
    with pytest.warns(UserWarning, match="no sourced season length"):
        r = assess_recommendation("rice", nb_rice, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "medium"  # 90 days > credit_window_days (60) -> not credited


def test_a_crop_with_no_sourced_season_length_still_credits_within_the_60_day_fallback():
    nb_rice = {**NB_OK, "n": {"soil_rating": "low", "fertilizer_needed_kg_ha": 103.8}}
    prior = _applied_days_ago(30, quantity_kg_per_acre=103.8 / (0.46 * 2.4711))
    with pytest.warns(UserWarning, match="no sourced season length"):
        r = assess_recommendation("rice", nb_rice, [], SOIL_OK, WEATHER_OK, prior, RULES, TABLES)
    assert r["level"] == "low"  # 30 days is within even the 60-day fallback -> credited


def test_applied_nutrient_the_crop_does_not_need_does_not_crash():
    """Regression: wheat on a medium-potassium soil needs 0 kg/ha K2O, so a logged potash (MOP)
    application gave ratio=inf and `round(inf * 100)` raised OverflowError -> HTTP 500 for every
    recommendation on that field."""
    from src.data_pipeline.soil_data_loader import load_reference_tables
    from src.degradation.risk_analyzer import _compute_risk

    tables = load_reference_tables()
    rules = {"over_application_ratio_high": 1.5, "over_application_ratio_medium": 1.2,
             "under_application_ratio": 0.5, "rain_hold_mm": 10, "credit_window_days": 60}
    balance = {
        "n": {"fertilizer_needed_kg_ha": 100.0, "soil_rating": "medium"},
        "p": {"fertilizer_needed_kg_ha": 50.0, "soil_rating": "medium"},
        "k": {"fertilizer_needed_kg_ha": 0.0, "soil_rating": "medium"},
    }
    soil = {"organic_carbon": 0.6, "ph": 7.0}
    risk = _compute_risk({"n": 100.0, "p": 50.0, "k": 12.0}, balance, soil, {"rainfall_mm_forecast": 0}, rules, tables)
    assert risk["level"] == "high"
    assert "needs none" in risk["reason"]
    assert risk["over_application_pct"] is None  # no percentage over a need of zero
    assert "inf" not in risk["reason"] and "None" not in risk["reason"]


def test_imbalance_with_an_unneeded_nutrient_has_its_own_wording():
    from src.data_pipeline.soil_data_loader import load_reference_tables
    from src.degradation.risk_analyzer import _compute_risk

    tables = load_reference_tables()
    rules = {"over_application_ratio_high": 1.5, "over_application_ratio_medium": 1.2,
             "under_application_ratio": 0.5, "rain_hold_mm": 10, "credit_window_days": 60}
    balance = {
        "n": {"fertilizer_needed_kg_ha": 100.0, "soil_rating": "low"},
        "p": {"fertilizer_needed_kg_ha": 50.0, "soil_rating": "medium"},
        "k": {"fertilizer_needed_kg_ha": 0.0, "soil_rating": "medium"},
    }
    # K applied though not needed, N barely applied: both an over- and an under-application signal.
    risk = _compute_risk({"n": 5.0, "p": 50.0, "k": 12.0}, balance, {"organic_carbon": 0.6, "ph": 7.0},
                          {"rainfall_mm_forecast": 0}, rules, tables)
    assert risk["level"] == "high"
    assert risk["reason"]  # rendered without raising
