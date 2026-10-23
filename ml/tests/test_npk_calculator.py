"""Golden tests for the S4 NPK dose calculator. Small, hand-computed cases plus tests against
Richa's real merged reference tables where a case naturally occurs there."""

import dataclasses
from datetime import date

import pytest

from src.data_pipeline.soil_data_loader import load_reference_tables
from src.engine.npk_calculator import (
    ACRES_PER_HECTARE,
    ReferenceDataIncomplete,
    UnknownStageError,
    compute_balance,
    to_products,
)

TABLES = load_reference_tables()
TODAY = date(2026, 11, 20)

FIXTURE_SOIL = {"n": 210.0, "p": 9.0, "k": 90.0, "ph": 7.4, "organic_carbon": 0.42, "moisture": 18.0}


FIRST_STAGE = {"wheat": "sowing", "rice": "nursery_sowing", "chickpea": "sowing", "maize": "sowing"}


def balance(crop_id, variety=None, irrigation=None, growth_stage=None, soil=None, prior_usage=None, today=TODAY):
    growth_stage = growth_stage or FIRST_STAGE[crop_id]
    return compute_balance(
        crop_id, variety, irrigation, growth_stage, soil or FIXTURE_SOIL, prior_usage or [], TABLES, today
    )


# ---------- compute_balance: reference-dose method ----------


def test_reference_dose_with_low_k_soil_adjustment_matches_the_hand_computed_example():
    result, trace = balance("wheat", soil={**FIXTURE_SOIL, "k": 90.0})  # 90 kg/ha is "low" (below 108)
    assert result["n"]["fertilizer_needed_kg_ha"] == 123.6
    assert result["p"]["fertilizer_needed_kg_ha"] == 61.8
    assert result["k"]["fertilizer_needed_kg_ha"] == 29.7
    assert result["k"]["method"] == "reference_dose"
    assert result["k"]["soil_rating"] == "low"
    assert result["k"]["soil_adjustment_kg_ha"] == 29.7
    assert any(entry["rule_id"] == "soil_adjustment" and entry["nutrient"] == "k" for entry in trace)


def test_a_soil_rating_with_no_adjustment_row_means_zero_not_an_error():
    # wheat/n has no real (non-TODO) soil_adjustments.csv row for any rating: adjustment must
    # be 0, not raise, per contract C1 ("a missing row means the source publishes no adjustment").
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "n": 50.0})  # "low" n rating
    assert result["n"]["soil_adjustment_kg_ha"] == 0.0
    assert result["n"]["fertilizer_needed_kg_ha"] == 123.6


def test_rice_skips_the_standard_p_and_k_dose_when_soil_tests_medium_or_high():
    # PAU: apply P/K only when soil tests deficient (low). Medium/high subtracts the whole
    # standard dose via a negative adjustment row -- fertilizer_needed clamps to 0, never negative.
    result, _ = balance("rice", soil={**FIXTURE_SOIL, "p": 18.0, "k": 200.0})  # p medium, k medium
    assert result["p"]["fertilizer_needed_kg_ha"] == 0.0
    assert result["k"]["fertilizer_needed_kg_ha"] == 0.0
    assert result["p"]["soil_adjustment_kg_ha"] == -29.7


def test_exact_variety_dose_overrides_the_generic_one():
    generic, _ = balance("rice", variety=None)
    pr_132, _ = balance("rice", variety="pr_132")
    assert generic["n"]["fertilizer_needed_kg_ha"] == pytest.approx(103.8)
    assert pr_132["n"]["fertilizer_needed_kg_ha"] == pytest.approx(77.8)
    assert pr_132["p"]["standard_dose_kg_ha"] == generic["p"]["standard_dose_kg_ha"]  # p2o5/k2o unchanged


def test_negative_total_clamps_to_zero_not_negative():
    huge_credit_usage = [{"type": "dap", "quantity_kg_per_acre": 1000.0, "applied_on": TODAY.isoformat()}]
    result, _ = balance("rice", soil={**FIXTURE_SOIL, "p": 18.0}, prior_usage=huge_credit_usage)  # p adjustment already -29.7
    assert result["p"]["fertilizer_needed_kg_ha"] == 0.0


# ---------- compute_balance: STCR method (synthetic tables, isolates the formula) ----------


def _stcr_tables(a=5.0, b=1.0, target=40.0):
    from dataclasses import replace

    return replace(
        TABLES,
        stcr_equations=[
            {
                "crop_id": "wheat", "variety_id": "generic", "region": "Test", "applies_to": "irrigated",
                "nutrient": "n", "a": str(a), "b": str(b),
                "target_yield_default_q_ha": "TODO(data)" if target is None else str(target),
                "source": "test", "notes": "",
            }
        ],
    )


def test_stcr_formula_matches_the_hand_computed_example():
    # FN = a*T - b*SN = 5*40 - 1*100 = 100
    tables = _stcr_tables(a=5.0, b=1.0, target=40.0)
    result, trace = compute_balance(
        "wheat", None, "irrigated", "sowing", {**FIXTURE_SOIL, "n": 100.0}, [], tables, TODAY
    )
    assert result["n"]["method"] == "stcr"
    assert result["n"]["standard_dose_kg_ha"] == 200.0
    assert result["n"]["soil_adjustment_kg_ha"] == -100.0
    assert result["n"]["fertilizer_needed_kg_ha"] == 100.0
    assert any(entry["rule_id"] == "dose_stcr" for entry in trace)


def test_stcr_is_skipped_when_the_target_yield_is_not_filled():
    # Synthetic stcr_equations row with an unfilled target, isolated from the real table's
    # current state (real wheat/wh_542 now has a sourced target_yield_default_q_ha -- see the
    # positive test right below -- so this must not depend on that staying unsourced forever).
    tables = _stcr_tables(a=5.0, b=1.0, target=None)
    result, _ = compute_balance("wheat", None, "irrigated", "sowing", FIXTURE_SOIL, [], tables, TODAY)
    assert result["n"]["method"] == "reference_dose"


def test_stcr_fires_for_real_wheat_wh_542_now_that_a_target_yield_is_sourced():
    # Richa sourced a real target_yield_default_q_ha (50 q/ha) for wheat/wh_542. A request for
    # that exact variety now genuinely uses STCR, not the flat reference dose.
    result, trace = balance("wheat", variety="wh_542")
    assert result["n"]["method"] == "stcr"
    assert any(entry["rule_id"] == "dose_stcr" for entry in trace)


def test_stcr_row_with_unfilled_target_falls_back_to_reference_dose_generic():
    result, _ = balance("wheat")  # generic; real stcr row for wheat/n has no usable target yield
    assert result["n"]["method"] == "reference_dose"
    assert result["n"]["fertilizer_needed_kg_ha"] == 123.6


# ---------- prior credit ----------


def test_a_recent_urea_application_credits_nitrogen():
    recent = [{"type": "urea", "quantity_kg_per_acre": 50.0, "applied_on": "2026-11-10"}]  # 10 days before TODAY
    result, trace = balance("rice", prior_usage=recent)  # rice/n has a usable default efficiency (0.426)
    assert result["n"]["prior_credit_kg_ha"] > 0
    expected_credit = 50.0 * 0.46 * ACRES_PER_HECTARE * 0.426
    assert result["n"]["prior_credit_kg_ha"] == pytest.approx(expected_credit, rel=1e-3)
    assert any(entry["rule_id"] == "prior_credit" and entry["nutrient"] == "n" for entry in trace)


def test_an_old_application_outside_the_credit_window_is_not_credited():
    old = [{"type": "urea", "quantity_kg_per_acre": 200.0, "applied_on": "2026-01-01"}]  # >60 days before TODAY
    result, _ = balance("rice", prior_usage=old)
    assert result["n"]["prior_credit_kg_ha"] == 0.0


def test_p_credit_now_uses_the_sourced_national_average_efficiency():
    # nutrient_efficiency.csv's default/p row used to be TODO(data), so a P application was
    # never credited. Now sourced (PIB Release ID 2237709, 10 Mar 2026, citing ICAR: national
    # NUE for P is 15-25%, 0.20 used as the range's midpoint) -- P applications are credited
    # like N's already were.
    usage = [{"type": "dap", "quantity_kg_per_acre": 80.0, "applied_on": "2026-11-10"}]
    result, trace = balance("rice", soil={**FIXTURE_SOIL, "p": 5.0}, prior_usage=usage)  # p "low", dose applies
    expected_credit = 80.0 * 0.46 * ACRES_PER_HECTARE * 0.20
    assert result["p"]["prior_credit_kg_ha"] == pytest.approx(expected_credit, rel=1e-3)
    assert any(entry["rule_id"] == "prior_credit" and entry["nutrient"] == "p" for entry in trace)


def test_a_missing_efficiency_skips_the_credit_with_a_trace_entry():
    # General, crop-and-nutrient-agnostic version of the coverage the P-specific test above
    # used to provide before nutrient_efficiency.csv's P gap closed -- kept independent of any
    # one real row so it can't go stale the same way again. Strips every P row (crop-specific
    # and default) from a copy of TABLES to simulate "no efficiency data exists at all".
    no_p_efficiency = [row for row in TABLES.nutrient_efficiency if row["nutrient"] != "p"]
    synthetic_tables = dataclasses.replace(TABLES, nutrient_efficiency=no_p_efficiency)
    usage = [{"type": "dap", "quantity_kg_per_acre": 80.0, "applied_on": "2026-11-10"}]
    result, trace = compute_balance(
        "rice", None, "irrigated", "nursery_sowing", {**FIXTURE_SOIL, "p": 5.0}, usage, synthetic_tables, TODAY,
    )
    assert result["p"]["prior_credit_kg_ha"] == 0.0
    assert any(entry["rule_id"] == "credit_skipped_no_efficiency" and entry["nutrient"] == "p" for entry in trace)


def test_an_unknown_previous_product_is_ignored_for_credit_and_traced():
    usage = [{"type": "some-unlisted-product", "quantity_kg_per_acre": 100.0, "applied_on": "2026-11-10"}]
    result, trace = balance("rice", prior_usage=usage)
    assert result["n"]["prior_credit_kg_ha"] == 0.0
    assert any(entry["rule_id"] == "credit_ignored_unknown_product" for entry in trace)


def test_kg_per_acre_to_kg_per_hectare_conversion_is_correct_to_three_decimals():
    usage = [{"type": "urea", "quantity_kg_per_acre": 100.0, "applied_on": "2026-11-10"}]
    result, _ = balance("rice", prior_usage=usage)
    raw_kg_ha = 100.0 * 0.46 * ACRES_PER_HECTARE
    expected = round(raw_kg_ha * 0.426, 3)
    assert result["n"]["prior_credit_kg_ha"] == pytest.approx(expected, abs=1e-3)


# ---------- errors ----------


def test_a_crop_with_no_reference_dose_row_at_all_raises_reference_data_incomplete():
    # Synthetic, isolated tables (not "whichever real crop happens to lack a dose today" --
    # that list keeps shrinking as Richa sources more crops, most recently maize/cotton/
    # sugarcane/barley, which previously made this exact test's premise go stale once already).
    from dataclasses import replace

    bare_tables = replace(
        TABLES,
        crops=[{"crop_id": "flax", "name_en": "Flax", "name_hi": "", "dataset_label": "", "season": "rabi", "source": "test"}],
        growth_stages=[{"crop_id": "flax", "stage_id": "sowing", "name_en": "Sowing", "name_hi": "", "order": "1", "das_start": "0", "das_end": "0", "source": "test"}],
        reference_doses=[],
        stcr_equations=[],
    )
    with pytest.raises(ReferenceDataIncomplete):
        compute_balance("flax", None, "irrigated", "sowing", FIXTURE_SOIL, [], bare_tables, TODAY)


def test_an_unknown_growth_stage_raises_unknown_stage_error():
    with pytest.raises(UnknownStageError):
        balance("wheat", growth_stage="not-a-real-stage")


# ---------- to_products ----------


def test_an_unpriced_product_is_still_selected_and_dosed():
    # MOP's price is genuinely TODO(data) in the real, merged fertilizer_products.csv (Richa
    # re-checked 2026-09-27: IFFCO's own list doesn't carry it, market listings too
    # inconsistent to cite). A wheat field with low soil K needs potash -- per the current
    # product decision, MOP is still selected with a real quantity; pricing it (or not) is
    # cost.py's job, not this function's (see its module docstring and test_cost.py).
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "k": 90.0})
    assert result["k"]["fertilizer_needed_kg_ha"] > 0
    schedule = to_products(result, "wheat", "sowing", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    mop_line = next(i for i in schedule if i["fertilizer_type"] == "mop")
    assert mop_line["quantity_kg_per_acre"] > 0


def test_a_product_with_no_row_at_all_still_raises_reference_data_incomplete():
    # Genuinely different from an unpriced-but-known product (above): if fertilizer_products.csv
    # has no row for the product at all, quantity itself can't be computed (n_pct/p2o5_pct/
    # k2o_pct come from that row) -- this is still a hard, structural gap.
    broken_products = [row for row in TABLES.fertilizer_products if row["product_id"] != "mop"]
    broken_tables = dataclasses.replace(TABLES, fertilizer_products=broken_products)
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "k": 90.0})
    with pytest.raises(ReferenceDataIncomplete, match="mop"):
        to_products(
            result, "wheat", "sowing", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, broken_tables, TODAY
        )


def test_a_full_wheat_plan_when_potash_is_not_needed():
    # Soil K high enough that no potash is needed, so the schedule never touches the
    # unpriced MOP product and a full plan can be produced end to end.
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "k": 300.0})
    assert result["k"]["fertilizer_needed_kg_ha"] == 0.0
    schedule = to_products(result, "wheat", "sowing", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    products_used = {item["fertilizer_type"] for item in schedule}
    assert products_used == {"dap", "urea"}
    assert all(item["quantity_kg_per_acre"] > 0 for item in schedule)


def test_rain_forecast_above_the_threshold_delays_the_top_dress_date():
    result, _ = balance("wheat", growth_stage="second_irrigation", soil={**FIXTURE_SOIL, "k": 300.0})
    calm = to_products(result, "wheat", "second_irrigation", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    wet = to_products(result, "wheat", "second_irrigation", date(2026, 11, 5), {"rainfall_mm_forecast": 40}, TABLES, TODAY)
    calm_date = date.fromisoformat(next(i for i in calm if i["fertilizer_type"] == "urea")["apply_by"])
    wet_date = date.fromisoformat(next(i for i in wet if i["fertilizer_type"] == "urea")["apply_by"])
    assert (wet_date - calm_date).days == 2
    assert "delayed 2 days" in next(i for i in wet if i["fertilizer_type"] == "urea")["timing_note"].lower()


def test_a_later_growth_stage_drops_the_basal_stage():
    result, _ = balance("wheat", growth_stage="crown_root_initiation", soil={**FIXTURE_SOIL, "k": 300.0})
    schedule = to_products(
        result, "wheat", "crown_root_initiation", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY
    )
    assert {item["stage"] for item in schedule} == {"crown_root_initiation", "second_irrigation"}
    assert "dap" not in {item["fertilizer_type"] for item in schedule}


def test_a_stage_with_no_pau_day_count_gets_an_estimated_apply_by_and_says_so():
    """PAU gives no day count for wheat's first irrigation. The dose still gets an approximate best-before date
    (stage_timing_estimates.csv: 21 to 28 days after sowing), and the note says it is an estimate."""
    result, _ = balance("wheat", growth_stage="crown_root_initiation", soil={**FIXTURE_SOIL, "k": 300.0})
    schedule = to_products(
        result, "wheat", "crown_root_initiation", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY
    )
    first_split = next(i for i in schedule if i["stage"] == "crown_root_initiation")
    assert first_split["apply_by"] == "2026-12-03"  # 28 days after the 5 November sowing
    assert "first irrigation" in first_split["timing_note"].lower()
    assert "an estimate" in first_split["timing_note"]


def test_dap_nitrogen_is_credited_against_the_first_nitrogen_stage():
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "k": 300.0})
    schedule = to_products(result, "wheat", "sowing", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    dap_qty = next(i for i in schedule if i["fertilizer_type"] == "dap")["quantity_kg_per_acre"]
    dap_n_kg_ha = dap_qty * 0.18 * ACRES_PER_HECTARE
    first_urea = next(i for i in schedule if i["fertilizer_type"] == "urea")
    uncredited_first_split = 123.6 / 2 / ACRES_PER_HECTARE / 0.46
    assert first_urea["quantity_kg_per_acre"] < uncredited_first_split
    assert dap_n_kg_ha > 0


def test_no_sowing_date_falls_back_to_the_current_stages_midpoint():
    result, _ = balance("wheat", growth_stage="second_irrigation", soil={**FIXTURE_SOIL, "k": 300.0})
    schedule = to_products(result, "wheat", "second_irrigation", None, {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    item = next(i for i in schedule if i["stage"] == "second_irrigation")
    assert item["apply_by"] is not None  # second_irrigation's das_start is sourced (50 days)


def test_a_chickpea_plan_never_touches_potash():
    result, _ = balance("chickpea")
    assert result["k"]["fertilizer_needed_kg_ha"] == 0.0
    schedule = to_products(result, "chickpea", "sowing", date(2026, 10, 20), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    assert "mop" not in {item["fertilizer_type"] for item in schedule}


def test_barley_now_has_a_real_split_schedule_and_produces_a_real_plan():
    # Barley used to have a real reference dose but zero split_schedule.csv rows -- this test
    # originally locked in that to_products() raises ReferenceDataIncomplete rather than
    # silently returning schedule=[] for that gap (a real bug, fixed separately). The gap
    # itself is now closed: PAU POP Rabi 2025-26 p.25 ("Drill all fertilizers at sowing")
    # gives barley the same single-stage full-N/P/K-at-sowing pattern as chickpea, added to
    # split_schedule.csv. Barley is no longer a "not ready" example -- see
    # test_a_crop_with_no_split_schedule_rows_raises_instead_of_a_fake_empty_plan below for
    # the general (now crop-agnostic) regression coverage for that bug.
    result, _ = balance("barley", growth_stage="sowing")
    assert result["n"]["fertilizer_needed_kg_ha"] > 0  # a real need exists
    schedule = to_products(result, "barley", "sowing", date(2026, 10, 20), {"rainfall_mm_forecast": 0}, TABLES, TODAY)
    assert schedule  # a real plan, not the old silent empty-schedule bug
    assert all(item["stage"] == "sowing" for item in schedule)  # full N/P/K at sowing, per the source


def test_a_crop_with_no_split_schedule_rows_raises_instead_of_a_fake_empty_plan():
    # General, crop-agnostic version of the barley regression above: a synthetic crop with a
    # real reference dose and growth stage but zero split_schedule.csv rows must still raise
    # ReferenceDataIncomplete, not silently return schedule=[]. Kept independent of any real
    # crop's data so this doesn't go stale again the next time a real "not ready" crop gets a
    # source and becomes ready (exactly what happened to the barley version of this test).
    synthetic_dose = {
        "crop_id": "test_not_ready_crop", "variety_id": "generic", "irrigation": "irrigated",
        "region": "Punjab", "n_kg_ha": "100", "p2o5_kg_ha": "50", "k2o_kg_ha": "0",
        "source": "test fixture", "notes": "",
    }
    synthetic_stage = {
        "crop_id": "test_not_ready_crop", "stage_id": "sowing", "name_en": "Sowing", "name_hi": "बुवाई",
        "order": "1", "das_start": "0", "das_end": "0", "source": "test fixture",
    }
    synthetic_tables = dataclasses.replace(
        TABLES,
        reference_doses=[*TABLES.reference_doses, synthetic_dose],
        growth_stages=[*TABLES.growth_stages, synthetic_stage],
        # deliberately NOT added to split_schedule -- that's the gap under test
    )
    result, _ = compute_balance(
        "test_not_ready_crop", None, "irrigated", "sowing", FIXTURE_SOIL, [], synthetic_tables, TODAY,
    )
    assert result["n"]["fertilizer_needed_kg_ha"] > 0  # a real need exists
    with pytest.raises(ReferenceDataIncomplete, match="split_schedule"):
        to_products(
            result, "test_not_ready_crop", "sowing", date(2026, 10, 20),
            {"rainfall_mm_forecast": 0}, synthetic_tables, TODAY,
        )


# ---------- region ambiguity: reference_dose_row / stcr_dose ----------


def test_two_reference_dose_rows_in_different_regions_raises_rather_than_picking_the_first():
    # region is a real reference_doses.csv column that _reference_dose_row never filtered on
    # (the request has no region field -- contract C1). Harmless while every crop/variety/
    # irrigation combination has exactly one region, which is true today by luck, not by
    # construction. This constructs the ambiguous case directly.
    extra_row = {
        "crop_id": "wheat", "variety_id": "generic", "irrigation": "irrigated", "region": "Haryana",
        "n_kg_ha": "100.0", "p2o5_kg_ha": "50.0", "k2o_kg_ha": "0",
    }
    ambiguous_tables = dataclasses.replace(TABLES, reference_doses=[*TABLES.reference_doses, extra_row])
    with pytest.raises(ReferenceDataIncomplete, match="ambiguous"):
        compute_balance("wheat", None, "irrigated", "sowing", FIXTURE_SOIL, [], ambiguous_tables, TODAY)


def test_two_stcr_rows_in_different_regions_raises_rather_than_picking_the_first():
    extra_row = {
        "crop_id": "wheat", "variety_id": "wh_542", "region": "Punjab", "applies_to": "irrigated",
        "nutrient": "n", "a": "5.0", "b": "1.0", "target_yield_default_q_ha": "45",
    }
    stcr_row = next(r for r in TABLES.stcr_equations if r["crop_id"] == "wheat" and r["nutrient"] == "n")
    assert stcr_row["region"] != "Punjab"  # sanity: this really is a second, different region
    ambiguous_tables = dataclasses.replace(TABLES, stcr_equations=[*TABLES.stcr_equations, extra_row])
    with pytest.raises(ReferenceDataIncomplete, match="ambiguous"):
        compute_balance("wheat", "wh_542", "irrigated", "sowing", FIXTURE_SOIL, [], ambiguous_tables, TODAY)


# ---------- split across stages: p_lines / k_lines must be exactly one ----------


def test_p_split_across_two_stages_raises_instead_of_silently_dropping_the_second():
    extra_line = {"crop_id": "wheat", "stage_id": "second_irrigation", "n_fraction": "0", "p_fraction": "0.3", "k_fraction": "0"}
    two_p_lines_tables = dataclasses.replace(TABLES, split_schedule=[*TABLES.split_schedule, extra_line])
    result, _ = balance("wheat", soil={**FIXTURE_SOIL, "k": 300.0})
    with pytest.raises(ReferenceDataIncomplete, match="P is assumed basal"):
        to_products(result, "wheat", "sowing", date(2026, 11, 5), {"rainfall_mm_forecast": 0}, two_p_lines_tables, TODAY)
