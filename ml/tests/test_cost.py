"""Golden tests for the S5 cost module: estimate_cost, compare_to_history, and the four
required cases (no history -> nulls, over-application reduction formula, negative saving,
prices/price_date traceability)."""

from datetime import date

import pytest

from src.data_pipeline.soil_data_loader import load_reference_tables
from src.engine.cost import compare_to_history, cost_breakdown, estimate_cost, prices_as_of
from src.engine.npk_calculator import ReferenceDataIncomplete

TABLES = load_reference_tables()
PRODUCTS = TABLES.fertilizer_products
TODAY = date(2026, 11, 20)

WHEAT_SCHEDULE = [
    {"stage": "sowing", "fertilizer_type": "dap", "quantity_kg_per_acre": 54.368, "apply_by": "2026-11-05", "timing_note": None},
    {"stage": "crown_root_initiation", "fertilizer_type": "urea", "quantity_kg_per_acre": 33.093, "apply_by": None, "timing_note": "At first irrigation"},
    {"stage": "second_irrigation", "fertilizer_type": "urea", "quantity_kg_per_acre": 54.368, "apply_by": "2026-12-25", "timing_note": None},
]


def dap_price():
    return next(p for p in PRODUCTS if p["product_id"] == "dap")


def urea_price():
    return next(p for p in PRODUCTS if p["product_id"] == "urea")


# ---------- estimate_cost ----------


def test_estimate_cost_is_the_sum_of_quantity_times_price():
    expected = (
        WHEAT_SCHEDULE[0]["quantity_kg_per_acre"] * float(dap_price()["price_inr_per_kg"])
        + WHEAT_SCHEDULE[1]["quantity_kg_per_acre"] * float(urea_price()["price_inr_per_kg"])
        + WHEAT_SCHEDULE[2]["quantity_kg_per_acre"] * float(urea_price()["price_inr_per_kg"])
    )
    assert estimate_cost(WHEAT_SCHEDULE, PRODUCTS) == pytest.approx(expected, rel=1e-6)


def test_estimate_cost_skips_an_unpriced_product_rather_than_raising():
    # Was MOP (a real dated retail price -- PIB Release ID 2237470, 10 Mar 2026 -- was found
    # and sourced for it since this test was first written; see fertilizer_products.csv).
    # SSP is still genuinely TODO(data) as of this pass -- no dated consumer retail price
    # found for it yet, unlike MOP's now-resolved gap. Per the current product decision, an
    # unpriced product no longer blocks the whole recommendation -- it contributes 0 here, and
    # cost_breakdown (below) excludes its line rather than inventing a price for it.
    schedule = [
        {"stage": "sowing", "fertilizer_type": "ssp", "quantity_kg_per_acre": 20.0, "apply_by": "2026-11-05", "timing_note": None},
        WHEAT_SCHEDULE[0],  # dap -- priced, so the total isn't just 0
    ]
    assert estimate_cost(schedule, PRODUCTS) == pytest.approx(
        WHEAT_SCHEDULE[0]["quantity_kg_per_acre"] * float(dap_price()["price_inr_per_kg"]), rel=1e-6
    )


def test_estimate_cost_raises_for_an_unknown_product():
    schedule = [{"stage": "sowing", "fertilizer_type": "made-up-product", "quantity_kg_per_acre": 20.0, "apply_by": None, "timing_note": None}]
    with pytest.raises(ReferenceDataIncomplete, match="made-up-product"):
        estimate_cost(schedule, PRODUCTS)


# ---------- cost_breakdown / prices_as_of ----------


def test_cost_breakdown_combines_quantities_by_product_and_sums_to_the_estimate():
    breakdown = cost_breakdown(WHEAT_SCHEDULE, PRODUCTS)
    assert {line["fertilizer_type"] for line in breakdown} == {"dap", "urea"}
    urea_line = next(line for line in breakdown if line["fertilizer_type"] == "urea")
    assert urea_line["quantity_kg_per_acre"] == pytest.approx(33.093 + 54.368)
    assert sum(line["cost_inr_per_acre"] for line in breakdown) == pytest.approx(estimate_cost(WHEAT_SCHEDULE, PRODUCTS), rel=1e-6)


def test_prices_as_of_is_the_oldest_price_date_used():
    assert prices_as_of(WHEAT_SCHEDULE, PRODUCTS) == date(2025, 1, 1)


def test_cost_breakdown_omits_an_unpriced_product_but_keeps_the_priced_ones():
    # Was MOP -- see test_estimate_cost_skips_an_unpriced_product_rather_than_raising's note;
    # MOP is now priced (PIB Release ID 2237470), SSP is the still-genuinely-TODO example.
    schedule = [
        *WHEAT_SCHEDULE,
        {"stage": "sowing", "fertilizer_type": "ssp", "quantity_kg_per_acre": 20.0, "apply_by": "2026-11-05", "timing_note": None},
    ]
    breakdown = cost_breakdown(schedule, PRODUCTS)
    assert {line["fertilizer_type"] for line in breakdown} == {"dap", "urea"}  # ssp excluded, not zero-priced


def test_prices_as_of_ignores_an_unpriced_product_in_the_schedule():
    # ssp has no price_date either (it's never been priced) -- if prices_as_of looked at it,
    # this would wrongly return None even though dap/urea both have a real price_date.
    schedule = [
        *WHEAT_SCHEDULE,
        {"stage": "sowing", "fertilizer_type": "ssp", "quantity_kg_per_acre": 20.0, "apply_by": "2026-11-05", "timing_note": None},
    ]
    assert prices_as_of(schedule, PRODUCTS) == date(2025, 1, 1)


# ---------- compare_to_history: case 1, no logged history -> nulls ----------


def test_no_prior_usage_gives_nulls_never_an_invented_baseline():
    result = compare_to_history(WHEAT_SCHEDULE, [], PRODUCTS, TODAY, TABLES, "wheat")
    assert result == {
        "previous_cost_inr_per_acre": None,
        "saving_inr_per_acre": None,
        "over_application_reduction_pct": None,
    }


def test_prior_usage_entirely_outside_the_season_window_also_gives_nulls():
    old_usage = [{"type": "urea", "quantity_kg_per_acre": 200.0, "applied_on": "2025-01-01"}]  # far outside credit_window_days
    result = compare_to_history(WHEAT_SCHEDULE, old_usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["previous_cost_inr_per_acre"] is None


def test_prior_usage_of_only_unknown_products_also_gives_nulls():
    usage = [{"type": "some-unlisted-product", "quantity_kg_per_acre": 100.0, "applied_on": "2026-11-10"}]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["previous_cost_inr_per_acre"] is None


# ---------- compare_to_history: case 2, over_application_reduction_pct formula ----------


def test_over_application_reduction_pct_matches_the_hand_computed_formula():
    # Previous: 200 kg/acre urea (46% N) = 92 kg N/acre total nutrient.
    # Recommended (WHEAT_SCHEDULE): dap 54.368*(18+46)/100 + urea (33.093+54.368)*46/100
    usage = [{"type": "urea", "quantity_kg_per_acre": 200.0, "applied_on": "2026-11-10"}]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    previous_n = 200.0 * 0.46
    recommended = 54.368 * 0.64 + (33.093 + 54.368) * 0.46
    expected = max(0.0, (previous_n - recommended) / previous_n * 100)
    assert result["over_application_reduction_pct"] == pytest.approx(expected, rel=1e-3)


def test_over_application_reduction_pct_clamps_to_zero_when_the_plan_recommends_more():
    usage = [{"type": "urea", "quantity_kg_per_acre": 5.0, "applied_on": "2026-11-10"}]  # far less than the plan needs
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["over_application_reduction_pct"] == 0.0


# ---------- compare_to_history: case 3, saving can be negative ----------


def test_saving_is_negative_when_the_plan_costs_more_than_the_farmer_used():
    usage = [{"type": "urea", "quantity_kg_per_acre": 5.0, "applied_on": "2026-11-10"}]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["saving_inr_per_acre"] < 0
    assert result["saving_inr_per_acre"] == pytest.approx(
        5.0 * float(urea_price()["price_inr_per_kg"]) - estimate_cost(WHEAT_SCHEDULE, PRODUCTS), rel=1e-6
    )


def test_saving_is_positive_when_the_farmer_used_much_more_than_the_plan():
    usage = [
        {"type": "urea", "quantity_kg_per_acre": 200.0, "applied_on": "2026-11-01"},
        {"type": "dap", "quantity_kg_per_acre": 80.0, "applied_on": "2026-11-01"},
    ]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["saving_inr_per_acre"] > 0


def test_no_saving_is_claimed_when_the_plan_uses_a_product_with_no_price():
    """An unpriced product counts as nothing in a cost, so comparing that cost with what the farmer spent
    would show a saving that is only the missing price. The saving and previous cost are unknown instead."""
    plan = [
        {"stage": "planting", "fertilizer_type": "ssp", "quantity_kg_per_acre": 75.0, "apply_by": None, "timing_note": None},
        {"stage": "planting", "fertilizer_type": "urea", "quantity_kg_per_acre": 130.0, "apply_by": None, "timing_note": None},
    ]
    usage = [{"type": "urea", "quantity_kg_per_acre": 200.0, "applied_on": "2026-11-01"}]
    result = compare_to_history(plan, usage, PRODUCTS, TODAY, TABLES, "sugarcane")
    assert result["saving_inr_per_acre"] is None and result["previous_cost_inr_per_acre"] is None
    assert result["over_application_reduction_pct"] is not None  # the nutrient comparison needs no price


def test_no_saving_is_claimed_when_the_earlier_application_used_a_product_with_no_price():
    usage = [{"type": "ssp", "quantity_kg_per_acre": 100.0, "applied_on": "2026-11-01"}]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["saving_inr_per_acre"] is None and result["previous_cost_inr_per_acre"] is None


# ---------- compare_to_history: case 4, prices/price_date traceable ----------


def test_previous_cost_uses_the_same_current_prices_as_the_recommendation_not_a_historical_price():
    usage = [{"type": "urea", "quantity_kg_per_acre": 100.0, "applied_on": "2026-11-10"}]
    result = compare_to_history(WHEAT_SCHEDULE, usage, PRODUCTS, TODAY, TABLES, "wheat")
    assert result["previous_cost_inr_per_acre"] == pytest.approx(100.0 * float(urea_price()["price_inr_per_kg"]), rel=1e-6)
    # The price used is traceable back to a dated source (prices_as_of), same one the recommendation uses.
    assert prices_as_of(WHEAT_SCHEDULE, PRODUCTS) is not None
