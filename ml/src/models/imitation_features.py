"""Inputs of the rule-imitation classifier.

The original classifier (src/data_pipeline/feature_engineering.FEATURE_COLUMNS) sees the crop, the
weather and the soil's N, P and K, but not the growth stage. The rule engine's main product depends
heavily on the stage (a phosphorus product at sowing, urea later), so a model without it can agree
with the rules at most about four times in five. This model sees the stage too. Nothing else the rules
look at moves the main product much, so nothing else is included (measured: adding pH, organic carbon,
irrigation and earlier applications changed agreement from 99.1% to 99.1%).

Kept separate from Richa's feature_engineering on purpose: that module's contract (C4) is shared with
the training data pipeline, and this model is trained from the rule engine, not from that dataset.
"""

from __future__ import annotations

import pandas as pd

# Written into the registry entry; the engine uses it to choose how to build a model's inputs.
FEATURE_SET = "rule_imitation_v1"

NUMERIC_COLUMNS = ["stage_order", "n", "p", "k"]


def crop_ids(tables) -> list[str]:
    return sorted(row["crop_id"] for row in tables.crops)


def stage_order(tables, crop_id: str, stage_id: str) -> int:
    """Position of the stage within its crop's season (growth_stages.csv `order`)."""
    for row in tables.growth_stages:
        if row["crop_id"] == crop_id and row["stage_id"] == stage_id:
            return int(row["order"])
    raise KeyError(f"unknown stage {stage_id!r} for crop {crop_id!r}")


def feature_columns(tables) -> list[str]:
    return [f"crop_id__{c}" for c in crop_ids(tables)] + ["irrigated"] + NUMERIC_COLUMNS


def build_imitation_features(rows: list[dict], tables) -> pd.DataFrame:
    """rows: dicts with crop_id, irrigation, stage_id and the soil's n, p, k. Fixed columns, same
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
        out.append(record)
    return pd.DataFrame(out, columns=feature_columns(tables))
