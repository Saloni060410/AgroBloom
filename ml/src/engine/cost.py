"""Cost estimate and comparison to the farmer's logged fertilizer history (S5).

Both figures are priced at today's fertilizer_products.csv rates, never a historical price
the farmer may actually have paid (we don't have that), so the comparison is apples to
apples: what this plan costs today, versus what already-applied fertilizer would cost today.

A product with no verified price (currently `ssp`, `npk_14_35_14`, `npk_17_17_17`,
`np_20_20_0` -- `mop` was resolved 2026-09-27, PIB Release ID 2237470, see
`fertilizer_products.csv`) is never invented a price, but no longer blocks the whole
recommendation either (that was the pre-2026-09-27 behavior, before the unpriced-product
policy below existed at all). It is simply excluded from cost.breakdown/
estimated_cost_inr_per_acre -- its quantity and schedule still come back from
npk_calculator.to_products() as normal, and recommendation_engine.py's data_notes says its
cost is unavailable, once, per response. The same goes for a comparison with earlier applications: if
either side uses an unpriced product, compare_to_history gives no previous cost and no saving rather than
a saving that only exists because a product was counted as free.
A product with no ROW AT ALL in fertilizer_products.csv is a different, still-fatal problem
(estimate_cost still raises for that) -- an unknown product, not merely an unpriced one.
"""

from __future__ import annotations

import warnings
from datetime import date

import yaml

from src.data_pipeline.feature_engineering import season_length_days
from src.data_pipeline.soil_data_loader import EXTERNAL_DIR, ReferenceTables
from src.engine.npk_calculator import PCT_FIELD, ReferenceDataIncomplete, _parse_float


def _products_by_id(products_table: list[dict]) -> dict[str, dict]:
    return {row["product_id"]: row for row in products_table}


def _price_or_none(product: dict) -> float | None:
    """None, not a raise: an unpriced product (see module docstring) is skipped by every
    caller below, not treated as a fatal gap the way an unknown product id still is."""
    return _parse_float(product["price_inr_per_kg"])


def _season_window_days(tables: ReferenceTables, crop_id: str) -> int:
    """The window for 'the same crop season' in compare_to_history. Uses
    feature_engineering.season_length_days() (a real, sourced season length from
    growth_stages.csv's maturity/harvest stage) where one exists for crop_id. Falls back to
    agronomy_rules.yaml's credit_window_days explicitly, with a warning, when it doesn't --
    the same fallback risk_analyzer.assess_recommendation() uses, and the same reasoning:
    a season (100-150+ days) is longer than the 60-day credit window, so this fallback likely
    undercounts early-season applications until a sourced season length exists for the crop."""
    season_days = season_length_days(tables, crop_id)
    if season_days is not None:
        return season_days
    with (EXTERNAL_DIR / "agronomy_rules.yaml").open(encoding="utf-8") as handle:
        rules = yaml.safe_load(handle)
    window_days = int(rules["credit_window_days"])
    warnings.warn(
        f"compare_to_history: no sourced season length for crop_id={crop_id!r} "
        f"(growth_stages.csv has no maturity/harvest row) -- falling back to "
        f"credit_window_days ({window_days}) as a same-season proxy, which is NOT "
        "the same concept and may undercount early-season applications.",
        stacklevel=2,
    )
    return window_days


def estimate_cost(schedule: list[dict], products_table: list[dict]) -> float:
    """INR per acre: sum of quantity_kg_per_acre x price_inr_per_kg over the priced items in
    the schedule. An unpriced product (module docstring) contributes 0, not a raise -- it's
    simply not counted, the same way cost_breakdown excludes its line. Still raises
    ReferenceDataIncomplete for an unknown product id (no row at all), a different and still
    fatal problem."""
    products = _products_by_id(products_table)
    total = 0.0
    for item in schedule:
        product = products.get(item["fertilizer_type"])
        if product is None:
            raise ReferenceDataIncomplete(
                "cost", item["fertilizer_type"], f"fertilizer_products.csv: no row for {item['fertilizer_type']!r}"
            )
        price = _price_or_none(product)
        if price is not None:
            total += item["quantity_kg_per_acre"] * price
    return round(total, 3)


def cost_breakdown(schedule: list[dict], products_table: list[dict]) -> list[dict]:
    """Supports contract C1's cost.breakdown: one line per priced product actually used,
    quantities combined across stages. An unpriced product (module docstring) is left out of
    this list entirely -- its quantity/schedule still appear in recommendation.schedule, and
    recommendation_engine.py's data_notes says why its cost is missing here."""
    products = _products_by_id(products_table)
    totals: dict[str, float] = {}
    for item in schedule:
        totals[item["fertilizer_type"]] = totals.get(item["fertilizer_type"], 0.0) + item["quantity_kg_per_acre"]
    lines = []
    for fertilizer_type, quantity in totals.items():
        price = _price_or_none(products[fertilizer_type])
        if price is None:
            continue
        lines.append(
            {
                "fertilizer_type": fertilizer_type,
                "quantity_kg_per_acre": round(quantity, 3),
                "cost_inr_per_acre": round(quantity * price, 3),
            }
        )
    return lines


def prices_as_of(schedule: list[dict], products_table: list[dict]) -> date | None:
    """Contract C1's cost.prices_as_of: the oldest price_date among the *priced* products
    used (an unpriced product, module docstring, never contributed a cost figure, so its
    price_date -- if it even has one -- isn't relevant here). None if a priced product used
    has no price_date at all, or if nothing in the schedule was priced."""
    products = _products_by_id(products_table)
    dates = []
    for item in {line["fertilizer_type"] for line in schedule}:
        product = products[item]
        if _price_or_none(product) is None:
            continue
        text = _todo_or_none(product.get("price_date"))
        if text is None:
            return None
        dates.append(date.fromisoformat(text))
    return min(dates) if dates else None


def _todo_or_none(value: str | None) -> str | None:
    text = (value or "").strip()
    return None if not text or text.startswith("TODO") else text


def _usable_usage(
    prior_usage: list[dict], products_table: list[dict], today: date, tables: ReferenceTables, crop_id: str
) -> list[dict]:
    """Prior usage entries within the season window (contract: 'the same crop season') whose
    product is recognized. An entry for an unknown product is ignored here exactly as it is
    for credit in npk_calculator -- we cannot cost or nutrient-compare a product we don't
    recognize."""
    products = _products_by_id(products_table)
    window_days = _season_window_days(tables, crop_id)
    usable = []
    for usage in prior_usage:
        applied_on = usage["applied_on"]
        applied_on = applied_on if isinstance(applied_on, date) else date.fromisoformat(applied_on)
        age_days = (today - applied_on).days
        if age_days < 0 or age_days > window_days:
            continue
        if usage["type"] not in products:
            continue
        usable.append(usage)
    return usable


def _nutrient_total_kg_per_acre(items: list[dict], products_table: list[dict], quantity_key: str, type_key: str) -> float:
    """Total N + P2O5 + K2O, summed together on their own bases (contract: 'on total N +
    P2O5 + K2O') -- a common simplification in Indian fertilizer literature, not a claim that
    the three are on one physical basis."""
    products = _products_by_id(products_table)
    total = 0.0
    for item in items:
        product = products[item[type_key]]
        pct_sum = sum(float(product[PCT_FIELD[nutrient]]) for nutrient in ("n", "p", "k"))
        total += item[quantity_key] * pct_sum / 100
    return total


def compare_to_history(
    schedule: list[dict],
    prior_usage: list[dict],
    products_table: list[dict],
    today: date,
    tables: ReferenceTables,
    crop_id: str,
) -> dict:
    """{ previous_cost_inr_per_acre, saving_inr_per_acre, over_application_reduction_pct },
    all None if there is no usable logged history in the same-season window -- never an
    invented baseline. today, tables and crop_id are required (not in the prompt's literal
    3-name signature): today so the season window is deterministic and testable, matching
    every other engine function in this codebase, and tables/crop_id so the window can be a
    real, sourced season length (season_length_days()) rather than always reusing
    credit_window_days as a same-season proxy."""
    usable = _usable_usage(prior_usage, products_table, today, tables, crop_id)
    if not usable:
        return {"previous_cost_inr_per_acre": None, "saving_inr_per_acre": None, "over_application_reduction_pct": None}

    # A product with no price contributes 0 to a cost, which is fine for the breakdown but would turn
    # a cost COMPARISON into a false saving (a plan with an unpriced product looks cheaper than it is).
    # So when either side uses one, the costs and the saving are unknown (None); the nutrient reduction
    # below needs no price and is still given.
    products = _products_by_id(products_table)
    unpriced_involved = any(
        _price_or_none(products[item[key]]) is None
        for items, key in ((usable, "type"), (schedule, "fertilizer_type"))
        for item in items
    )
    previous_cost = round(
        sum(
            usage["quantity_kg_per_acre"] * price
            for usage in usable
            if (price := _price_or_none(products[usage["type"]])) is not None
        ),
        3,
    )
    recommended_cost = estimate_cost(schedule, products_table)
    saving = round(previous_cost - recommended_cost, 3)  # can be negative -- the UI explains it

    previous_nutrients = _nutrient_total_kg_per_acre(usable, products_table, "quantity_kg_per_acre", "type")
    recommended_nutrients = _nutrient_total_kg_per_acre(schedule, products_table, "quantity_kg_per_acre", "fertilizer_type")
    reduction_pct = (
        round(max(0.0, (previous_nutrients - recommended_nutrients) / previous_nutrients * 100), 3)
        if previous_nutrients > 0
        else None
    )

    return {
        "previous_cost_inr_per_acre": None if unpriced_involved else previous_cost,
        "saving_inr_per_acre": None if unpriced_involved else saving,
        "over_application_reduction_pct": reduction_pct,
    }
