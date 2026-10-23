"""The NPK dose calculator (S4): standard dose + soil-test adjustment - prior credit, per
nutrient, on an N / P2O5 / K2O basis. Pure functions only -- no I/O beyond the ReferenceTables
object the caller already loaded (Richa's soil_data_loader.load_reference_tables()).

    fertilizer needed = max(0, standard dose + soil adjustment - prior credit)

Method per nutrient, tried in this order (contract C1/C6):
  1. stcr           -- stcr_equations.csv has a usable row (variety first, then generic) with
                        target_yield_default_q_ha filled: standard dose = a * target yield,
                        soil adjustment = -b * the soil test value.
  2. reference_dose -- reference_doses.csv has a usable row (variety first, then generic) for
                        this crop/irrigation with this nutrient's dose cell filled;
                        soil_adjustments.csv adjusts it by soil rating (0 if no matching row --
                        the source publishes no adjustment for that rating).
  3. otherwise      -- ReferenceDataIncomplete. Never a default, a guess, or a silent 0.

Every decision appends a rule_trace item {rule_id, nutrient, value, threshold, effect, params}
so Richa's explain() (contract C6) can turn it into a sentence.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from src.data_pipeline.feature_engineering import soil_rating
from src.data_pipeline.soil_data_loader import ReferenceTables
from src.engine.stage_timing import window_or_estimate

ACRES_PER_HECTARE = 2.4711  # 1 ha = 2.4711 acre (contract C1)

NUTRIENTS = ("n", "p", "k")
DOSE_FIELD = {"n": "n_kg_ha", "p": "p2o5_kg_ha", "k": "k2o_kg_ha"}
PCT_FIELD = {"n": "n_pct", "p": "p2o5_pct", "k": "k2o_pct"}


class ReferenceDataIncomplete(Exception):
    """No usable dose/adjustment/product data exists for this crop/nutrient combination.
    The API turns this into a 503 -- never a default, a guess, or a silent 0 (contract C1's
    missing-data policy)."""

    def __init__(self, crop_id: str, nutrient: str, missing_cells: str):
        self.crop_id, self.nutrient, self.missing_cells = crop_id, nutrient, missing_cells
        super().__init__(f"{crop_id}/{nutrient}: {missing_cells}")


class UnknownStageError(Exception):
    """growth_stage is not one of this crop's growth_stages.csv stage_ids."""


def _todo_or_none(value: str | None) -> str | None:
    text = (value or "").strip()
    return None if not text or text.startswith("TODO") else text


def _parse_float(value: str | None) -> float | None:
    text = _todo_or_none(value)
    return None if text is None else float(text)


def _variety_candidates(variety: str | None) -> list[str]:
    """Exact variety first, then the generic fallback -- contract C1."""
    return ([variety] if variety else []) + ["generic"]


def _stage_row(tables: ReferenceTables, crop_id: str, stage_id: str) -> dict:
    for row in tables.growth_stages:
        if row["crop_id"] == crop_id and row["stage_id"] == stage_id:
            return row
    raise UnknownStageError(f"{stage_id!r} is not a growth stage of {crop_id!r}")


def _ordered_stages(tables: ReferenceTables, crop_id: str) -> list[dict]:
    return sorted((row for row in tables.growth_stages if row["crop_id"] == crop_id), key=lambda row: int(row["order"]))


def _stcr_dose(tables: ReferenceTables, crop_id: str, variety: str | None, nutrient: str) -> dict | None:
    # region is a real column in stcr_equations.csv but isn't part of this function's
    # lookup key (the request has no region field -- contract C1) and every crop/variety/
    # nutrient combination happens to have exactly one region today. That's silent luck, not
    # a guarantee: if a second region is ever added for the same combination, picking
    # "whichever row comes first" would be an unacknowledged guess. Raise instead.
    for candidate in _variety_candidates(variety):
        matches = [
            row
            for row in tables.stcr_equations
            if row["crop_id"] == crop_id and row["variety_id"] == candidate and row["nutrient"] == nutrient
        ]
        usable = [row for row in matches if _parse_float(row["target_yield_default_q_ha"]) is not None]
        if not usable:
            continue  # no usable row for this candidate -- the caller tries the next one
        if len(usable) > 1:
            regions = sorted({row["region"] for row in usable})
            raise ReferenceDataIncomplete(
                crop_id,
                nutrient,
                f"stcr_equations.csv has {len(usable)} usable rows for "
                f"(crop_id={crop_id!r}, variety_id={candidate!r}, nutrient={nutrient!r}) across regions "
                f"{regions} -- ambiguous without a region to disambiguate, not guessed",
            )
        row = usable[0]
        return {"a": float(row["a"]), "b": float(row["b"]), "target_yield": float(row["target_yield_default_q_ha"]), "row": row}
    return None


def _reference_dose_row(tables: ReferenceTables, crop_id: str, variety: str | None, irrigation: str) -> dict | None:
    # Same region caveat as _stcr_dose above.
    for candidate in _variety_candidates(variety):
        matches = [
            row
            for row in tables.reference_doses
            if row["crop_id"] == crop_id and row["variety_id"] == candidate and row["irrigation"] == irrigation
        ]
        if not matches:
            continue
        if len(matches) > 1:
            regions = sorted({row["region"] for row in matches})
            raise ReferenceDataIncomplete(
                crop_id,
                "reference_dose",
                f"reference_doses.csv has {len(matches)} rows for "
                f"(crop_id={crop_id!r}, variety_id={candidate!r}, irrigation={irrigation!r}) across regions "
                f"{regions} -- ambiguous without a region to disambiguate, not guessed",
            )
        return matches[0]
    return None


def _soil_adjustment(tables: ReferenceTables, crop_id: str, nutrient: str, rating: str) -> float:
    """0 when no row matches -- the source publishes no adjustment for that rating (contract
    C1). A row whose soil_rating cell is itself TODO(data) never matches a real rating, so it
    is correctly treated the same way: no usable adjustment."""
    for row in tables.soil_adjustments:
        if row["crop_id"] == crop_id and row["nutrient"] == nutrient and row["soil_rating"] == rating:
            value = _parse_float(row["adjustment_kg_ha"])
            if value is not None:
                return value
    return 0.0


def _has_published_adjustment(tables: ReferenceTables, crop_id: str, nutrient: str) -> bool:
    """True if the source publishes a soil-test adjustment for this crop and nutrient at any rating. A row
    whose cells are still TODO(data) does not count: it marks a table that was looked for and not found."""
    return any(
        row["crop_id"] == crop_id and row["nutrient"] == nutrient and _parse_float(row["adjustment_kg_ha"]) is not None
        for row in tables.soil_adjustments
    )


def _efficiency(tables: ReferenceTables, crop_id: str, nutrient: str) -> float | None:
    """The crop's own row if it has a usable value, else the default row. None if neither
    exists or both are TODO(data) -- the caller skips crediting in that case."""
    rows_by_crop = {row["crop_id"]: row for row in tables.nutrient_efficiency if row["nutrient"] == nutrient}
    for candidate in (crop_id, "default"):
        row = rows_by_crop.get(candidate)
        if row is not None:
            value = _parse_float(row["fertilizer_use_efficiency"])
            if value is not None:
                return value
    return None


def _fertilizer_products(tables: ReferenceTables) -> dict[str, dict]:
    return {row["product_id"]: row for row in tables.fertilizer_products}


def _prior_credit(
    tables: ReferenceTables,
    crop_id: str,
    nutrient: str,
    prior_usage: list[dict],
    today: date,
    credit_window_days: int,
    rainfall_history: list[dict] | None = None,
    rain_rules: dict | None = None,
) -> tuple[float, list[dict]]:
    """Credit for earlier applications of `nutrient`. credit_window_days is the window for THIS
    nutrient (the caller gives P and K the crop season when it can). For nitrogen only, an
    application followed by heavy rain (rain_rules, from agronomy_rules.yaml) counts for less,
    because part of that nitrogen is taken to have washed out; each reduction is traced so it can
    be shown to the farmer."""
    products = _fertilizer_products(tables)
    trace: list[dict] = []
    raw_kg_ha = 0.0
    ignored_products: set[str] = set()

    for usage in prior_usage:
        applied_on = usage["applied_on"]
        applied_on = applied_on if isinstance(applied_on, date) else date.fromisoformat(applied_on)
        age_days = (today - applied_on).days
        if age_days < 0 or age_days > credit_window_days:
            continue

        product = products.get(usage["type"])
        if product is None:
            ignored_products.add(usage["type"])
            continue

        pct = _parse_float(product[PCT_FIELD[nutrient]])
        if not pct:
            continue
        contribution = usage["quantity_kg_per_acre"] * (pct / 100) * ACRES_PER_HECTARE

        if nutrient == "n" and rainfall_history and rain_rules:
            from src.engine.history import rain_after  # local: history imports the data pipeline

            rain_mm, days_seen = rain_after(rainfall_history, applied_on, rain_rules["rain_loss_days"])
            if days_seen > 0 and rain_mm >= rain_rules["rain_loss_mm"]:
                contribution *= rain_rules["rain_loss_credit_factor"]
                trace.append(
                    {
                        "rule_id": "n_credit_reduced_after_rain",
                        "nutrient": "n",
                        "value": rain_mm,
                        "threshold": rain_rules["rain_loss_mm"],
                        "effect": f"credit x{rain_rules['rain_loss_credit_factor']}",
                        "params": {
                            "product": usage["type"],
                            "applied_on": applied_on.isoformat(),
                            "rain_mm": round(rain_mm, 1),
                            "days": rain_rules["rain_loss_days"],
                            "factor": rain_rules["rain_loss_credit_factor"],
                        },
                    }
                )

        raw_kg_ha += contribution

    if ignored_products:
        trace.append(
            {
                "rule_id": "credit_ignored_unknown_product",
                "nutrient": nutrient,
                "value": None,
                "threshold": None,
                "effect": "ignored for credit and cost",
                "params": {"unknown_product_ids": sorted(ignored_products)},
            }
        )

    if raw_kg_ha <= 0:
        return 0.0, trace

    efficiency = _efficiency(tables, crop_id, nutrient)
    if efficiency is None:
        trace.append(
            {
                "rule_id": "credit_skipped_no_efficiency",
                "nutrient": nutrient,
                "value": raw_kg_ha,
                "threshold": None,
                "effect": "no credit given",
                "params": {"reason": "no fertilizer_use_efficiency row for this crop or the default"},
            }
        )
        return 0.0, trace

    credit = raw_kg_ha * efficiency
    trace.append(
        {
            "rule_id": "prior_credit",
            "nutrient": nutrient,
            "value": credit,
            "threshold": credit_window_days,
            "effect": f"-{credit:.1f} kg/ha",
            "params": {"raw_kg_ha": raw_kg_ha, "efficiency": efficiency},
        }
    )
    return credit, trace


def compute_balance(
    crop_id: str,
    variety: str | None,
    irrigation: str | None,
    growth_stage: str,
    soil: dict,
    prior_usage: list[dict],
    tables: ReferenceTables,
    today: date,
    credit_window_days: int | None = None,
    pk_window_days: int | None = None,
    rainfall_history: list[dict] | None = None,
    rain_rules: dict | None = None,
    rules: dict | None = None,
) -> tuple[dict, list[dict]]:
    """Returns (nutrient_balance, rule_trace). pk_window_days, if given, replaces credit_window_days
    for phosphorus and potassium (they stay in the soil for the crop's season); rainfall_history and
    rain_rules, if given, let heavy rain after a nitrogen application reduce its credit. nutrient_balance has, per nutrient, method,
    soil_rating, standard_dose_kg_ha, soil_adjustment_kg_ha, prior_credit_kg_ha and
    fertilizer_needed_kg_ha (contract C1/C6). growth_stage is validated against the crop's
    growth_stages.csv (an unknown stage raises UnknownStageError) but does not otherwise enter
    the dose/adjustment/credit math, which is crop/variety/irrigation-level, not stage-level."""
    irrigation = irrigation or "irrigated"
    _stage_row(tables, crop_id, growth_stage)  # validate; raises UnknownStageError if not found
    credit_window_days = credit_window_days if credit_window_days is not None else 60

    balance: dict[str, dict] = {}
    trace: list[dict] = []

    for nutrient in NUTRIENTS:
        stcr = _stcr_dose(tables, crop_id, variety, nutrient)
        if stcr is not None:
            method = "stcr"
            standard_dose = stcr["a"] * stcr["target_yield"]
            adjustment = -stcr["b"] * soil[nutrient]
            rating = None
            trace.append(
                {
                    "rule_id": "dose_stcr",
                    "nutrient": nutrient,
                    "value": standard_dose,
                    "threshold": None,
                    "effect": f"+{standard_dose:.1f} kg/ha",
                    "params": {
                        "target_yield_q_ha": stcr["target_yield"],
                        "a": stcr["row"]["a"],
                        "variety_id": stcr["row"]["variety_id"],
                        "region": stcr["row"]["region"],
                    },
                }
            )
            trace.append(
                {
                    "rule_id": "stcr_soil_adjustment",
                    "nutrient": nutrient,
                    "value": soil[nutrient],
                    "threshold": None,
                    "effect": f"{adjustment:+.1f} kg/ha",
                    "params": {"b": stcr["row"]["b"]},
                }
            )
        else:
            dose_row = _reference_dose_row(tables, crop_id, variety, irrigation)
            dose_value = _parse_float(dose_row[DOSE_FIELD[nutrient]]) if dose_row else None
            if dose_value is None:
                raise ReferenceDataIncomplete(
                    crop_id,
                    nutrient,
                    f"no usable reference_doses.csv row for irrigation={irrigation!r} "
                    f"(tried variety {variety!r} then generic), and no usable stcr_equations.csv row",
                )
            method = "reference_dose"
            standard_dose = dose_value
            rating = soil_rating(tables, nutrient, soil[nutrient])
            adjustment = _soil_adjustment(tables, crop_id, nutrient, rating)
            trace.append(
                {
                    "rule_id": "dose_reference",
                    "nutrient": nutrient,
                    "value": standard_dose,
                    "threshold": None,
                    "effect": f"+{standard_dose:.1f} kg/ha",
                    "params": {"variety_id": dose_row["variety_id"], "irrigation": irrigation},
                }
            )
            if not _has_published_adjustment(tables, crop_id, nutrient):
                # No PAU adjustment for this crop and nutrient. With the band rule on (rules given), the dose
                # follows the soil's rating band: one dose inside a band, a different one in the next.
                band = (rules or {}).get("soil_rating_fallback") or {}
                factor = (band.get("factors") or {}).get(rating) if band.get("enabled") else None
                if factor is not None:
                    adjustment = (factor - 1.0) * standard_dose
                # Said once so the farmer is told which band the soil is in and what that did to the dose.
                trace.append(
                    {
                        "rule_id": "no_soil_adjustment_published",
                        "nutrient": nutrient,
                        "value": soil[nutrient],
                        "threshold": rating,
                        "effect": f"{adjustment:+.1f} kg/ha",
                        "params": {"soil_rating": rating, "crop_id": crop_id, "band_factor": factor, "adjustment_kg_ha": round(adjustment, 3)},
                    }
                )
            if adjustment != 0:
                trace.append(
                    {
                        "rule_id": "soil_adjustment",
                        "nutrient": nutrient,
                        "value": soil[nutrient],
                        "threshold": rating,
                        "effect": f"{adjustment:+.1f} kg/ha",
                        "params": {"soil_rating": rating},
                    }
                )

        window = credit_window_days if nutrient == "n" or pk_window_days is None else pk_window_days
        credit, credit_trace = _prior_credit(
            tables, crop_id, nutrient, prior_usage, today, window, rainfall_history, rain_rules
        )
        trace.extend(credit_trace)

        needed = max(0.0, standard_dose + adjustment - credit)
        balance[nutrient] = {
            "method": method,
            "soil_rating": rating,
            "standard_dose_kg_ha": round(standard_dose, 3),
            "soil_adjustment_kg_ha": round(adjustment, 3),
            "prior_credit_kg_ha": round(credit, 3),
            "fertilizer_needed_kg_ha": round(needed, 3),
        }

    return balance, trace


@dataclass
class _ScheduleLine:
    stage: str
    order: int
    nutrient: str
    fraction: float


def _schedule_lines(tables: ReferenceTables, crop_id: str, from_order: int) -> list[_ScheduleLine]:
    stage_orders = {row["stage_id"]: int(row["order"]) for row in tables.growth_stages if row["crop_id"] == crop_id}
    lines = []
    for row in tables.split_schedule:
        if row["crop_id"] != crop_id:
            continue
        order = stage_orders.get(row["stage_id"])
        if order is None or order < from_order:
            continue
        for nutrient, field in (("n", "n_fraction"), ("p", "p_fraction"), ("k", "k_fraction")):
            fraction = float(row[field])
            if fraction > 0:
                lines.append(_ScheduleLine(row["stage_id"], order, nutrient, fraction))
    return sorted(lines, key=lambda line: line.order)


def _day_label(day: date) -> str:
    return f"{day.day} {day.strftime('%b')}"


def _stage_apply_by(
    tables: ReferenceTables, crop_id: str, stage_id: str, sowing_date: date, *, basal: bool = False
) -> tuple[date | None, str | None]:
    """(best-before date, timing note) for an application at this stage.

    The date is the last sourced day of the stage's window for a nitrogen top-dressing, and the first day
    for a basal dose (phosphorus and potash go on before or at the stage, never after it). The note is
    PAU's own instruction for the stage (growth_stages.csv timing_hint) plus the date window when the
    stage has one. A stage whose days are not sourced has no date, only the instruction."""
    row = _stage_row(tables, crop_id, stage_id)
    label = row["name_en"]
    hint = (row.get("timing_hint") or "").strip()
    found = window_or_estimate(tables, row)
    if found is None:
        return None, hint or f"At {label}"
    window, estimated = found
    first, last = (sowing_date + timedelta(days=round(day)) for day in window)
    apply_by = first if basal else last
    note = hint
    if last > first:
        note = f"{hint} Best between {_day_label(first)} and {_day_label(last)}.".strip()
    elif hint and (row.get("counted_from") or "sowing").strip() == "transplanting":
        note = f"{hint} About {_day_label(first)}."
    if estimated:
        note = f"{note} The dates are an estimate: PAU gives no day count for this stage.".strip()
    return apply_by, note or f"At {label}"


def _effective_sowing_date(tables: ReferenceTables, crop_id: str, growth_stage: str, today: date) -> date | None:
    """No sowing_date given: assume today is the midpoint of the current stage's DAS window,
    and back-derive the sowing date that implies -- contract C1. None if the current stage's
    own timing isn't sourced either, in which case nothing downstream can be dated."""
    row = _stage_row(tables, crop_id, growth_stage)
    found = window_or_estimate(tables, row)
    if found is None:
        return None
    midpoint = sum(found[0]) / 2
    return today - timedelta(days=round(midpoint))


def phosphorus_sources(tables: ReferenceTables, crop_id: str) -> tuple[str, list[str]]:
    """The phosphorus product PAU lists first for the crop, and the others it lists as equal alternatives
    (phosphorus_sources.csv). DAP for a crop with no row: the product the engine used before the table existed."""
    for row in tables.phosphorus_sources:
        if row["crop_id"] == crop_id:
            alternatives = [item for item in row["alternative_products"].split("|") if item]
            return row["primary_product"], alternatives
    return "dap", []


def alternative_timing(tables: ReferenceTables, crop_id: str, product_id: str) -> str | None:
    """What PAU says about timing when this alternative supplies the phosphorus (phosphorus_sources.csv
    `alternative_timing`, written as product=text joined with |), or None."""
    for row in tables.phosphorus_sources:
        if row["crop_id"] == crop_id:
            for item in (row.get("alternative_timing") or "").split("|"):
                product, _, text = item.partition("=")
                if product.strip() == product_id and text.strip():
                    return text.strip()
    return None


def phosphorus_alternatives(schedule: list[dict], crop_id: str, tables: ReferenceTables, plan_with) -> dict | None:
    """The same phosphorus supplied by each alternative product, for the farmer who cannot get the first one.
    `plan_with(product_id)` is the plan rebuilt with that phosphorus product (to_products with the same
    inputs), so the quantity and the change in urea are exactly what that plan would say: they account for
    the nitrogen the product carries, for nitrogen already credited from earlier applications, and for urea
    that was never needed. Quantities are kg per acre. None when the plan has no phosphorus product or the
    crop lists no alternatives."""
    primary_id, alternative_ids = phosphorus_sources(tables, crop_id)
    products = _fertilizer_products(tables)
    line = next((item for item in schedule if item["fertilizer_type"] == primary_id), None)
    if line is None or not alternative_ids or primary_id not in products:
        return None

    def urea_of(plan: list[dict]) -> float:
        return sum(item["quantity_kg_per_acre"] for item in plan if item["fertilizer_type"] == "urea")

    primary = products[primary_id]
    p2o5_kg = line["quantity_kg_per_acre"] * float(primary["p2o5_pct"]) / 100
    options = []
    for product_id in alternative_ids:
        product = products.get(product_id)
        if product is None or float(product["p2o5_pct"]) <= 0:
            continue
        plan = plan_with(product_id)
        alt_line = next((item for item in plan if item["fertilizer_type"] == product_id), None)
        if alt_line is None:
            continue
        options.append(
            {
                "product_id": product_id,
                "name": product["name"],
                "quantity_kg_per_acre": round(alt_line["quantity_kg_per_acre"], 1),
                # more urea (+) when the alternative carries less nitrogen than the first product, less (-) when more
                "urea_change_kg_per_acre": round(urea_of(plan) - urea_of(schedule), 1),
                "timing": alternative_timing(tables, crop_id, product_id),
            }
        )
    if not options:
        return None
    return {"primary_id": primary_id, "primary_name": primary["name"], "p2o5_kg_per_acre": round(p2o5_kg, 1), "options": options}


def to_products(
    nutrient_balance: dict,
    crop_id: str,
    growth_stage: str,
    sowing_date: date | None,
    weather: dict,
    tables: ReferenceTables,
    today: date,
    rain_hold_mm: float | None = None,
    rain_hold_days: int | None = None,
    recent_rain_mm: float = 0.0,
    p_product: str | None = None,
) -> list[dict]:
    """Splits nutrient_balance's fertilizer_needed_kg_ha across the stages not yet passed
    (split_schedule.csv), dates each stage from growth_stages.csv das_start counted from
    sowing_date (or an effective one derived from today and the current stage's midpoint --
    contract C1), and maps nutrients to products: DAP for P (crediting its N against the
    first nitrogen-bearing stage), MOP for K, remaining N from urea. The phosphorus product is the one PAU lists
    first for the crop (phosphorus_sources.csv): DAP, or single superphosphate for sugarcane.

    A needed product is selected and dosed even if it has no verified price yet (currently
    `ssp`, `npk_14_35_14`, `npk_17_17_17`, `np_20_20_0` -- `mop` was resolved 2026-09-27, PIB
    Release ID 2237470, see fertilizer_products.csv). Pricing is cost.py's job, not this
    function's: an unpriced product still gets a real quantity_kg_per_acre and schedule entry
    here, and cost.py excludes it from cost.breakdown rather than failing the whole
    recommendation (see cost.py's module docstring and recommendation_engine.py's data_notes).
    A needed product with no ROW AT ALL in fertilizer_products.csv (so not even its nutrient
    percentages are known, meaning quantity itself can't be computed) still raises
    ReferenceDataIncomplete -- that gap is structural, not a pricing gap.

    Nitrogen top-dressing (urea) is delayed by rain_hold_days when rainfall_mm_forecast is at
    or above rain_hold_mm, or when recent_rain_mm (rain that actually fell in the last few days)
    is: saturated soil loses nitrogen the same way a coming downpour would make it.

    p_product replaces the crop's usual phosphorus product (used to price out the alternatives)."""
    rain_hold_mm = 20.0 if rain_hold_mm is None else rain_hold_mm
    rain_hold_days = 2 if rain_hold_days is None else rain_hold_days
    products = _fertilizer_products(tables)

    # A crop with zero split_schedule rows at all (not just none left for this stage -- that's
    # the legitimate "later stage, basal split already passed" case _schedule_lines handles on
    # its own) means every nutrient's need is genuinely unattributable to any product/stage.
    # Without this check, p_lines/k_lines/n_lines all come back empty below and every branch
    # is skipped silently, returning schedule=[] -- exactly the missing-data condition
    # ready_crops() defines as "not ready" ("no split_schedule rows"), but reaching /recommend
    # as a fake, confident "nothing needed" plan instead of the 503 every other missing-data
    # gap in this function raises.
    if not any(row["crop_id"] == crop_id for row in tables.split_schedule):
        raise ReferenceDataIncomplete(crop_id, "schedule", "split_schedule.csv has no rows for this crop")

    current_order = int(_stage_row(tables, crop_id, growth_stage)["order"])
    lines = _schedule_lines(tables, crop_id, current_order)
    effective_sowing = sowing_date or _effective_sowing_date(tables, crop_id, growth_stage, today)

    def product_row(product_id: str, nutrient: str) -> dict:
        # No longer requires a price (see this function's docstring) -- only that the row
        # exists at all, since n_pct/p2o5_pct/k2o_pct (used below to convert kg/ha to a
        # product quantity) come from this row, not from price_inr_per_kg.
        product = products.get(product_id)
        if product is None:
            raise ReferenceDataIncomplete(crop_id, nutrient, f"fertilizer_products.csv: no row for {product_id!r}")
        return product

    schedule: list[dict] = []
    n_credit_remaining = 0.0

    # P and K are basal (never split across stages in the current data): one line each, at
    # whichever stage has a nonzero fraction. Their totals are the full fertilizer_needed_kg_ha.
    p_lines = [line for line in lines if line.nutrient == "p"]
    k_lines = [line for line in lines if line.nutrient == "k"]
    n_lines = sorted((line for line in lines if line.nutrient == "n"), key=lambda line: line.order)

    # Only p_lines[0]/k_lines[0] are ever used below -- correct today because every crop's
    # split_schedule.csv gives P and K a single basal stage, but nothing enforced that
    # assumption. If a future data change ever split P or K across stages, this would
    # silently apply only the first stage's fraction and drop the rest of the dose --
    # exactly the kind of silent gap this codebase doesn't allow elsewhere. Raise instead.
    if len(p_lines) > 1:
        raise ReferenceDataIncomplete(
            crop_id, "p", f"split_schedule.csv has {len(p_lines)} P rows for this crop -- P is assumed basal (one stage only)"
        )
    if len(k_lines) > 1:
        raise ReferenceDataIncomplete(
            crop_id, "k", f"split_schedule.csv has {len(k_lines)} K rows for this crop -- K is assumed basal (one stage only)"
        )

    if p_lines and nutrient_balance["p"]["fertilizer_needed_kg_ha"] > 0:
        line = p_lines[0]
        p_product_id = p_product or phosphorus_sources(tables, crop_id)[0]
        product = product_row(p_product_id, "p")
        p_needed = nutrient_balance["p"]["fertilizer_needed_kg_ha"] * line.fraction
        quantity = round(p_needed / ACRES_PER_HECTARE / (float(product["p2o5_pct"]) / 100), 3)
        n_credit_remaining += quantity * float(product["n_pct"]) / 100 * ACRES_PER_HECTARE
        apply_by, note = _stage_apply_by(tables, crop_id, line.stage, effective_sowing, basal=True) if effective_sowing else (None, "At " + line.stage.replace("_", " "))
        schedule.append(_schedule_item(line.stage, p_product_id, quantity, apply_by, note))

    if k_lines and nutrient_balance["k"]["fertilizer_needed_kg_ha"] > 0:
        line = k_lines[0]
        product = product_row("mop", "k")
        k_needed = nutrient_balance["k"]["fertilizer_needed_kg_ha"] * line.fraction
        quantity = round(k_needed / ACRES_PER_HECTARE / (float(product["k2o_pct"]) / 100), 3)
        apply_by, note = _stage_apply_by(tables, crop_id, line.stage, effective_sowing, basal=True) if effective_sowing else (None, "At " + line.stage.replace("_", " "))
        schedule.append(_schedule_item(line.stage, "mop", quantity, apply_by, note))

    n_total_needed = nutrient_balance["n"]["fertilizer_needed_kg_ha"]
    if n_lines and n_total_needed > 0:
        urea_product = None
        for line in n_lines:
            n_needed = n_total_needed * line.fraction
            credited = min(n_credit_remaining, n_needed)
            n_credit_remaining -= credited
            n_needed -= credited
            if n_needed <= 0:
                continue
            urea_product = urea_product or product_row("urea", "n")
            quantity = round(n_needed / ACRES_PER_HECTARE / (float(urea_product["n_pct"]) / 100), 3)
            apply_by, note = _stage_apply_by(tables, crop_id, line.stage, effective_sowing) if effective_sowing else (None, "At " + line.stage.replace("_", " "))
            forecast_hold = weather.get("rainfall_mm_forecast") is not None and weather["rainfall_mm_forecast"] >= rain_hold_mm
            recent_hold = recent_rain_mm >= rain_hold_mm
            if forecast_hold or recent_hold:
                reason = "forecast rain" if forecast_hold else "heavy rain in the last few days"
                if apply_by is not None:
                    apply_by = apply_by + timedelta(days=rain_hold_days)
                note = f"{note} Delayed {rain_hold_days} days for {reason}." if note else (
                    f"Delayed {rain_hold_days} days for {reason}."
                )
            schedule.append(_schedule_item(line.stage, "urea", quantity, apply_by, note))

    return schedule


def _schedule_item(stage: str, fertilizer_type: str, quantity_kg_per_acre: float, apply_by: date | None, timing_note: str | None) -> dict:
    return {
        "stage": stage,
        "fertilizer_type": fertilizer_type,
        "quantity_kg_per_acre": quantity_kg_per_acre,
        "apply_by": apply_by.isoformat() if apply_by else None,
        "timing_note": timing_note,
    }
