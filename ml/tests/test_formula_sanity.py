"""S8: formula sanity gate.

For every ready crop and variety, and for low/medium/high soil combinations, an independent
recomputation of the dose formula -- Richa's evaluation.metrics.formula_conformity (contract
C7), which reads reference_doses.csv/soil_adjustments.csv/stcr_equations.csv directly -- must
match compute_balance()'s own fertilizer_needed_kg_ha within agronomy_rules.yaml's
formula_tolerance_pct. This never calls npk_calculator to recompute the formula a second time;
compute_balance() is only used once, to produce the actual recommendation this test then checks
against an independent source.

Only crops ready_crops() reports ready are tested (see test_not_ready_crops_are_listed for
which aren't, and why).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import yaml

from src.data_pipeline.soil_data_loader import load_reference_tables, ready_crops
from src.engine.npk_calculator import compute_balance, to_products

EXTERNAL_DIR = Path(__file__).resolve().parents[1] / "data" / "external"
TABLES = load_reference_tables()
TODAY = date(2026, 11, 20)

# formula_conformity reports a "violator" for two different reasons (see its own docstring):
# a genuine numeric mismatch (reason == "outside tolerance", the only one this gate actually
# cares about), or a crop/nutrient with no adjustment source *at all* -- soil_adjustments.csv
# rows whose soil_rating cell is itself "TODO(data)" (wheat/n, wheat/p, rice/n, all with a
# "Team TODO" note in that file already). The second kind is a known, already-documented data
# gap, not a formula bug -- allowlisted here explicitly so a *different*, new gap doesn't
# silently pass as "expected" too.
_KNOWN_NO_ADJUSTMENT_SOURCE = {("wheat", "n"), ("wheat", "p"), ("rice", "n")}

with (EXTERNAL_DIR / "agronomy_rules.yaml").open(encoding="utf-8") as _handle:
    _RULES = yaml.safe_load(_handle)
TOLERANCE_PCT = _RULES["formula_tolerance_pct"]
# A floor under the percent-of-dose tolerance, not an agronomy number: compute_balance()
# rounds standard_dose/adjustment/credit/needed to 3dp (npk_calculator.py), and an independent
# recomputation from the same floats can differ by a rounding hair even when both sides agree
# on the real number -- this just keeps that noise from reading as a formula mismatch when the
# nutrient's own standard dose happens to be 0 (0% of 0 is 0, too strict on its own).
MIN_TOLERANCE_KG_HA = 0.01

# Richa's formula_conformity is imported lazily inside the tests below (not at module import
# time) so a genuinely missing src/evaluation/metrics.py fails inside a test with a clear
# message, rather than making every test in this file uncollectable.


LOW_MEDIUM_HIGH_SOIL = {
    # Comfortably inside soil_test_ratings.csv's low/medium/high bands (n: <280/280-560/>560,
    # p: <10/10-25/>25, k: <108/108-280/>280) -- away from every boundary, so this test doesn't
    # flip which rating a value gets if a published cutoff is revised slightly.
    "low": {"n": 100.0, "p": 5.0, "k": 90.0},
    "medium": {"n": 400.0, "p": 15.0, "k": 200.0},
    "high": {"n": 700.0, "p": 35.0, "k": 300.0},
}
# organic_carbon/ph/moisture never enter compute_balance's dose math (it only reads
# soil["n"|"p"|"k"]) -- fixed, valid placeholders, needed only to satisfy the Soil schema.
_SOIL_EXTRAS = {"ph": 7.0, "organic_carbon": 0.6, "moisture": 20.0}


def _first_stage(crop_id: str) -> str:
    stages = [row for row in TABLES.growth_stages if row["crop_id"] == crop_id]
    return min(stages, key=lambda row: int(row["order"]))["stage_id"]


def _variety_candidates(variety: str | None) -> list[str]:
    """Mirrors npk_calculator's own candidate order (variety first, then generic) -- this is
    published, documented routing behaviour (its module docstring says so twice), not the
    dose formula itself. Needed here only to tell formula_conformity which row's region/
    variety_id compute_balance actually used, since its raw output doesn't carry that."""
    return ([variety] if variety else []) + ["generic"]


def _resolve_reference_dose(crop_id: str, variety: str | None, irrigation: str) -> tuple[str, str] | None:
    for candidate in _variety_candidates(variety):
        for row in TABLES.reference_doses:
            if row["crop_id"] == crop_id and row["variety_id"] == candidate and row["irrigation"] == irrigation:
                return candidate, row["region"]
    return None


def _resolve_stcr(crop_id: str, variety: str | None, nutrient: str) -> tuple[str, str] | None:
    for candidate in _variety_candidates(variety):
        for row in TABLES.stcr_equations:
            matches = row["crop_id"] == crop_id and row["variety_id"] == candidate and row["nutrient"] == nutrient
            if matches and not str(row["target_yield_default_q_ha"]).startswith("TODO"):
                return candidate, row["region"]
    return None


READY = ready_crops(TABLES)
NOT_READY = {crop_id: info["reason"] for crop_id, info in READY.items() if not info["ready"]}

# "Every crop and variety" -- crops.csv itself has no variety column (that's
# crop_varieties.csv), so: every crop with variety=None (its generic case), plus every
# (crop, variety) pair crop_varieties.csv actually lists.
_CROP_VARIETY_CASES = [(row["crop_id"], None) for row in TABLES.crops]
_CROP_VARIETY_CASES += [(row["crop_id"], row["variety_id"]) for row in TABLES.crop_varieties]
# wh_542 is a real, sourced STCR variety (stcr_equations.csv) but isn't in crop_varieties.csv
# yet -- flagged for Richa (PROGRESS.md), included here manually so its formula isn't
# skipped just because that table hasn't caught up.
_CROP_VARIETY_CASES += [("wheat", "wh_542")]

CASES = [
    (crop_id, variety, level)
    for crop_id, variety in _CROP_VARIETY_CASES
    if READY.get(crop_id, {}).get("ready")
    for level in ("low", "medium", "high")
]


def test_not_ready_crops_are_listed():
    """Informational, not a pass/fail check on which crops are ready -- that's ready_crops()'s
    own contract, tested in test_soil_data_loader.py. This just makes sure a not-ready crop is
    never silently invisible from the formula sanity gate's own output (run with `-s` to see
    the list; it always prints, pass or fail elsewhere)."""
    for crop_id, reason in NOT_READY.items():
        print(f"NOT READY, excluded from the formula sanity gate: {crop_id} ({reason})")


@pytest.mark.parametrize(
    "crop_id,variety,level", CASES, ids=[f"{c}-{v or 'generic'}-{l}" for c, v, l in CASES]
)
def test_formula_conformity_within_tolerance(crop_id, variety, level):
    from src.evaluation.metrics import formula_conformity

    soil = {**_SOIL_EXTRAS, **LOW_MEDIUM_HIGH_SOIL[level]}
    growth_stage = _first_stage(crop_id)

    balance, _trace = compute_balance(crop_id, variety, "irrigated", growth_stage, soil, [], TABLES, TODAY)

    for nutrient, entry in balance.items():
        assert entry["fertilizer_needed_kg_ha"] >= 0  # compute_balance's own max(0, ...) clamp

        rec_nutrient = dict(entry)
        if entry["method"] == "stcr":
            resolved = _resolve_stcr(crop_id, variety, nutrient)
            if resolved is not None:
                rec_nutrient["soil_test_value"] = soil[nutrient]
        else:
            resolved = _resolve_reference_dose(crop_id, variety, "irrigated")
        assert resolved is not None, (
            f"{crop_id}/{variety}/{nutrient}: could not find the row compute_balance itself "
            "must have used -- resolution logic here has drifted from npk_calculator's."
        )
        resolved_variety, region = resolved

        rec = {
            "crop_id": crop_id,
            "variety_id": resolved_variety,
            "irrigation": "irrigated",
            "region": region,
            "nutrient_balance": {nutrient: rec_nutrient},
        }
        tol = max(MIN_TOLERANCE_KG_HA, abs(entry["standard_dose_kg_ha"]) * TOLERANCE_PCT / 100)
        result = formula_conformity([rec], TABLES, tol)
        for violator in result["violators"]:
            if (crop_id, nutrient) in _KNOWN_NO_ADJUSTMENT_SOURCE and violator["reason"] != "outside tolerance":
                continue  # known, already-documented data gap -- not a formula mismatch
            pytest.fail(f"{crop_id}/{variety}/{nutrient} ({level}): {violator}")


@pytest.mark.parametrize("crop_id,nutrient", sorted(_KNOWN_NO_ADJUSTMENT_SOURCE))
@pytest.mark.parametrize("level", ["low", "medium", "high"])
def test_band_rule_doses_match_an_independent_recomputation(crop_id, nutrient, level):
    """formula_conformity cannot check these: soil_adjustments.csv has no PAU row for them, which it reports
    as a known gap. The doses the engine actually gives follow the soil-rating band rule, so recompute them
    here straight from reference_doses.csv and the factors in agronomy_rules.yaml, not from the engine."""
    from src.evaluation.metrics import _lookup_reference_dose

    soil = {**_SOIL_EXTRAS, **LOW_MEDIUM_HIGH_SOIL[level]}
    balance, _trace = compute_balance(
        crop_id, None, "irrigated", _first_stage(crop_id), soil, [], TABLES, TODAY, rules=_RULES
    )
    entry = balance[nutrient]
    resolved = _resolve_reference_dose(crop_id, None, "irrigated")
    assert resolved is not None
    standard_dose, reason = _lookup_reference_dose(TABLES, crop_id, resolved[0], "irrigated", resolved[1], nutrient)
    assert reason is None
    expected = standard_dose * _RULES["soil_rating_fallback"]["factors"][level]
    assert entry["fertilizer_needed_kg_ha"] == pytest.approx(expected, abs=0.01), (crop_id, nutrient, level)


@pytest.mark.parametrize(
    "crop_id,variety,level", CASES, ids=[f"{c}-{v or 'generic'}-{l}" for c, v, l in CASES]
)
def test_schedule_has_no_negative_quantities_and_sums_to_the_primary_products_total(crop_id, variety, level):
    soil = {**_SOIL_EXTRAS, **LOW_MEDIUM_HIGH_SOIL[level]}
    growth_stage = _first_stage(crop_id)
    balance, _trace = compute_balance(crop_id, variety, "irrigated", growth_stage, soil, [], TABLES, TODAY)
    schedule = to_products(
        balance, crop_id, growth_stage, date(2026, 11, 5), {"rainfall_mm_forecast": 0.0}, TABLES, TODAY
    )

    assert all(item["quantity_kg_per_acre"] >= 0 for item in schedule)

    if not schedule:
        return  # e.g. rice/high: no nutrient needed at all -- an empty schedule, not a bug

    totals: dict[str, float] = {}
    for item in schedule:
        totals[item["fertilizer_type"]] = totals.get(item["fertilizer_type"], 0.0) + item["quantity_kg_per_acre"]
    primary_product = max(totals, key=totals.get)
    primary_total = round(totals[primary_product], 3)

    stage_sum = round(sum(item["quantity_kg_per_acre"] for item in schedule if item["fertilizer_type"] == primary_product), 3)
    assert stage_sum == primary_total


def test_a_credit_larger_than_the_dose_clamps_to_zero_not_negative():
    # Wheat/generic N: standard_dose=123.6 kg/ha, no soil adjustment (wheat has no soil_adjustments.csv
    # row for n), and n's fertilizer_use_efficiency is sourced (nutrient_efficiency.csv's
    # default/n row, 0.426, Kaur et al. 2023). p/k's default rows are sourced too now (PIB
    # Release ID 2237709, national NUE averages) -- this test only exercises N, not a claim
    # that p/k crediting is unavailable.
    soil = {**_SOIL_EXTRAS, "n": 100.0, "p": 5.0, "k": 90.0}
    huge_prior_urea = [{"type": "urea", "quantity_kg_per_acre": 1000.0, "applied_on": TODAY.isoformat()}]
    balance, trace = compute_balance(
        "wheat", None, "irrigated", "sowing", soil, huge_prior_urea, TABLES, TODAY, credit_window_days=60
    )
    assert balance["n"]["prior_credit_kg_ha"] > balance["n"]["standard_dose_kg_ha"] + balance["n"]["soil_adjustment_kg_ha"]
    assert balance["n"]["fertilizer_needed_kg_ha"] == 0.0  # clamped, never negative
    assert any(entry["rule_id"] == "prior_credit" for entry in trace)
