"""Load every C5 reference table once, and validate the fixed soil schema (contract C4/C5).

load_reference_tables() is the single place that reads ml/data/external/ -- both the
classifier (via feature_engineering.py) and Saloni's engine should go through this rather
than each reading files independently, so a missing file/column fails the same way everywhere.
"""

import csv
from dataclasses import dataclass, field
from pathlib import Path

EXTERNAL_DIR = Path(__file__).resolve().parents[2] / "data" / "external"

SOIL_FIELDS = ("n", "p", "k", "ph", "organic_carbon", "moisture")


class ReferenceDataError(Exception):
    """A C5 file is missing, or missing an expected column."""


class SoilValidationError(Exception):
    """A soil dict is missing a fixed field, has the wrong type, or is out of sane bounds."""


@dataclass(frozen=True)
class ReferenceTables:
    crops: list[dict] = field(default_factory=list)
    crop_varieties: list[dict] = field(default_factory=list)
    growth_stages: list[dict] = field(default_factory=list)
    reference_doses: list[dict] = field(default_factory=list)
    soil_adjustments: list[dict] = field(default_factory=list)
    stcr_equations: list[dict] = field(default_factory=list)
    split_schedule: list[dict] = field(default_factory=list)
    nutrient_efficiency: list[dict] = field(default_factory=list)
    phosphorus_sources: list[dict] = field(default_factory=list)
    stage_timing_estimates: list[dict] = field(default_factory=list)
    fertilizer_products: list[dict] = field(default_factory=list)
    soil_test_ratings: list[dict] = field(default_factory=list)
    seasonal_weather: list[dict] = field(default_factory=list)


# (attribute name, filename, required columns)
_TABLE_SPECS: list[tuple[str, str, tuple[str, ...]]] = [
    ("crops", "crops.csv", ("crop_id", "name_en", "name_hi", "dataset_label", "season", "source")),
    ("crop_varieties", "crop_varieties.csv", ("crop_id", "variety_id", "name_en", "name_hi", "source")),
    ("growth_stages", "growth_stages.csv",
     ("crop_id", "stage_id", "name_en", "name_hi", "order", "das_start", "das_end", "source")),
    ("reference_doses", "reference_doses.csv",
     ("crop_id", "variety_id", "irrigation", "region", "n_kg_ha", "p2o5_kg_ha", "k2o_kg_ha", "source", "notes")),
    ("soil_adjustments", "soil_adjustments.csv",
     ("crop_id", "nutrient", "soil_rating", "adjustment_kg_ha", "source", "notes")),
    ("stcr_equations", "stcr_equations.csv",
     ("crop_id", "variety_id", "region", "applies_to", "nutrient", "a", "b",
      "target_yield_default_q_ha", "source", "notes")),
    ("split_schedule", "split_schedule.csv", ("crop_id", "stage_id", "n_fraction", "p_fraction", "k_fraction")),
    ("nutrient_efficiency", "nutrient_efficiency.csv",
     ("crop_id", "nutrient", "fertilizer_use_efficiency", "source", "notes")),
    ("stage_timing_estimates", "stage_timing_estimates.csv",
     ("crop_id", "stage_id", "est_start", "est_end", "est_basis")),
    ("phosphorus_sources", "phosphorus_sources.csv",
     ("crop_id", "primary_product", "alternative_products", "source", "notes")),
    ("fertilizer_products", "fertilizer_products.csv",
     ("product_id", "name", "dataset_label", "n_pct", "p2o5_pct", "k2o_pct",
      "price_inr_per_kg", "price_date", "bag_size_kg", "source")),
    ("soil_test_ratings", "soil_test_ratings.csv",
     ("parameter", "unit", "very_low_below", "low_below", "high_above", "source")),
    ("seasonal_weather", "seasonal_weather.csv",
     ("region_key", "month", "temperature_c", "humidity_pct", "rainfall_mm_5day", "source")),
]


def _read_table(name: str, filename: str, required_columns: tuple[str, ...]) -> list[dict]:
    path = EXTERNAL_DIR / filename
    if not path.exists():
        raise ReferenceDataError(f"{name}: expected file not found at {path}")

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = set(reader.fieldnames or [])
        missing = set(required_columns) - header
        if missing:
            raise ReferenceDataError(f"{name} ({filename}): missing expected column(s) {sorted(missing)}")
        return list(reader)


def load_reference_tables() -> ReferenceTables:
    """Read every C5 table once. Raises ReferenceDataError with a clear message for a
    missing file or a missing expected column -- never returns a partially-loaded object."""
    kwargs = {}
    for attr, filename, required_columns in _TABLE_SPECS:
        kwargs[attr] = _read_table(attr, filename, required_columns)
    return ReferenceTables(**kwargs)


def validate_soil(soil: dict) -> None:
    """Check the fixed six soil fields: presence, type, sane bounds. Never add other soil
    fields -- this schema is fixed by the problem statement (ml/AGENTS.md)."""
    missing = [f for f in SOIL_FIELDS if f not in soil]
    if missing:
        raise SoilValidationError(f"soil is missing required field(s): {missing}")

    extra = set(soil) - set(SOIL_FIELDS)
    if extra:
        raise SoilValidationError(
            f"soil has field(s) outside the fixed schema {SOIL_FIELDS}: {sorted(extra)}"
        )

    for f in SOIL_FIELDS:
        value = soil[f]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise SoilValidationError(f"soil.{f} must be a number, got {type(value).__name__}")

    if not (0 <= soil["ph"] <= 14):
        raise SoilValidationError(f"soil.ph must be in [0, 14], got {soil['ph']}")
    if not (0 <= soil["organic_carbon"] <= 100):
        raise SoilValidationError(f"soil.organic_carbon must be in [0, 100] (percent), got {soil['organic_carbon']}")
    if not (0 <= soil["moisture"] <= 100):
        raise SoilValidationError(f"soil.moisture must be in [0, 100] (percent), got {soil['moisture']}")
    # Sane upper ceilings for n/p/k: 3x soil_test_ratings.csv's own "high" cutoff (280/25/280
    # kg/ha respectively) rather than an arbitrary round number -- a genuinely deficient or
    # over-fertilized field can exceed "high", but 3x it is implausible for any real sample.
    _NPK_CEILING = {"n": 560 * 3, "p": 25 * 3, "k": 280 * 3}
    for nutrient in ("n", "p", "k"):
        value = soil[nutrient]
        ceiling = _NPK_CEILING[nutrient]
        if not (0 <= value <= ceiling):
            raise SoilValidationError(f"soil.{nutrient} must be in [0, {ceiling}] kg/ha, got {value}")


def ready_crops(tables: ReferenceTables) -> dict[str, dict]:
    """Which crops have every cell needed for a recommendation: a generic reference dose for
    all three nutrients, and at least one split_schedule row. Saloni's /reference/crops lists
    only the ready ones. Returns {crop_id: {"ready": bool, "reason": str | None}}."""
    doses_by_crop_generic = {
        row["crop_id"]: row for row in tables.reference_doses if row["variety_id"] == "generic"
    }
    split_crops = {row["crop_id"] for row in tables.split_schedule}

    result: dict[str, dict] = {}
    for crop in tables.crops:
        crop_id = crop["crop_id"]
        dose = doses_by_crop_generic.get(crop_id)

        if dose is None:
            result[crop_id] = {"ready": False, "reason": "no generic reference dose"}
            continue

        todo_nutrients = [
            col for col in ("n_kg_ha", "p2o5_kg_ha", "k2o_kg_ha")
            if str(dose[col]).startswith("TODO")
        ]
        if todo_nutrients:
            result[crop_id] = {
                "ready": False,
                "reason": f"reference dose has TODO(data) cell(s): {todo_nutrients}",
            }
            continue

        if crop_id not in split_crops:
            result[crop_id] = {"ready": False, "reason": "no split_schedule rows"}
            continue

        result[crop_id] = {"ready": True, "reason": None}

    return result
