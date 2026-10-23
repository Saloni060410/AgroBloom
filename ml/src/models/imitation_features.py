"""Inputs of the rule-imitation classifier.

The original classifier (src/data_pipeline/feature_engineering.FEATURE_COLUMNS) sees the crop, the
weather and the soil's N, P and K, but not the growth stage. The rule engine's main product depends
heavily on the stage (a phosphorus product at sowing, urea later), so a model without it can agree
with the rules at most about four times in five. This model sees the stage too. Nothing else the rules
look at moves the main product much. The labels are now every product in the plan, and then what the
farmer already applied matters: enough nitrogen from an earlier application removes the urea, enough
phosphorus removes the DAP. Measured on the same draws, a forest that cannot see earlier applications
agrees with the plan on about 96.2% of held-out requests, and one that sees them on about 99.2%. So the nitrogen,
phosphorus and potassium applied within the credit window are inputs, as plain kg/ha with no efficiency
or rain logic, which it has to learn. pH, organic carbon and moisture are not: they move no dose.

Kept separate from Richa's feature_engineering on purpose: that module's contract (C4) is shared with
the training data pipeline, and this model is trained from the rule engine, not from that dataset.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from src.engine.npk_calculator import ACRES_PER_HECTARE

# Written into the registry entry; the engine uses it to choose how to build a model's inputs.
FEATURE_SET = "rule_imitation_v2"  # v1 predicted one main product; v2 predicts every product in the plan ("dap+urea")

NUMERIC_COLUMNS = ["stage_order", "n", "p", "k", "prior_n", "prior_p", "prior_k"]


def crop_ids(tables) -> list[str]:
    return sorted(row["crop_id"] for row in tables.crops)


def stage_order(tables, crop_id: str, stage_id: str) -> int:
    """Position of the stage within its crop's season (growth_stages.csv `order`)."""
    for row in tables.growth_stages:
        if row["crop_id"] == crop_id and row["stage_id"] == stage_id:
            return int(row["order"])
    raise KeyError(f"unknown stage {stage_id!r} for crop {crop_id!r}")


def prior_supply(prior: list[dict], tables, today: date, n_window_days: int, pk_window_days: int) -> dict[str, float]:
    """N, P2O5 and K2O (kg/ha) in the earlier applications still inside the credit window: nitrogen inside
    the nitrogen window, phosphorus and potassium inside theirs. Gross amounts in the product, before any
    use-efficiency, so the model has to learn the credit the engine takes. An unrecognised product or a
    future date adds nothing, as in the engine."""
    products = {row["product_id"]: row for row in tables.fertilizer_products}
    supplied = {"prior_n": 0.0, "prior_p": 0.0, "prior_k": 0.0}
    for usage in prior:
        product = products.get(usage["type"])
        applied_on = usage["applied_on"] if isinstance(usage["applied_on"], date) else date.fromisoformat(usage["applied_on"])
        age = (today - applied_on).days
        if product is None or age < 0:
            continue
        kg_ha = usage["quantity_kg_per_acre"] * ACRES_PER_HECTARE
        if age <= n_window_days:
            supplied["prior_n"] += kg_ha * float(product["n_pct"]) / 100
        if age <= pk_window_days:
            supplied["prior_p"] += kg_ha * float(product["p2o5_pct"]) / 100
            supplied["prior_k"] += kg_ha * float(product["k2o_pct"]) / 100
    return supplied


def feature_columns(tables) -> list[str]:
    return [f"crop_id__{c}" for c in crop_ids(tables)] + ["irrigated"] + NUMERIC_COLUMNS


def build_imitation_features(rows: list[dict], tables) -> pd.DataFrame:
    """rows: dicts with crop_id, irrigation, stage_id, the soil's n, p, k and (optional, 0 if absent) the
    prior_n, prior_p, prior_k from prior_supply(). Fixed columns, same
    order, whatever the rows contain. Pure and deterministic, like the original feature builder."""
    crops = crop_ids(tables)
    out = []
    for row in rows:
        record = {f"crop_id__{c}": float(c == row["crop_id"]) for c in crops}
        # An unknown irrigation counts as not irrigated, the same as the dose tables fall back.
        record["irrigated"] = float(row.get("irrigation") == "irrigated")
        record["stage_order"] = float(stage_order(tables, row["crop_id"], row["stage_id"]))
        record["n"] = float(row["n"])
        record["p"] = float(row["p"])
        record["k"] = float(row["k"])
        for column in ("prior_n", "prior_p", "prior_k"):
            record[column] = float(row.get(column, 0.0))
        out.append(record)
    return pd.DataFrame(out, columns=feature_columns(tables))
