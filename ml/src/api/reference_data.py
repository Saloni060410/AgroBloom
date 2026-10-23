"""Read the reference tables in data/external/ (contract C5) and shape them for /reference/*.

Every reader raises ReferenceUnavailable when a file or column is missing. The endpoints turn
that into a 503 with the reason. A cell that still says TODO(data) is treated as missing.
"""

import csv
import math
from pathlib import Path

from src.api.schemas import (
    FertilizerProduct,
    ReferenceCrop,
    ReferenceStage,
    ReferenceVariety,
    SeasonalWeather,
    SoilRating,
)

TODO = "TODO(data)"


class ReferenceUnavailable(Exception):
    """A reference table is missing, unreadable or incomplete."""


def _read(directory: Path, name: str, required: set[str]) -> list[dict[str, str]]:
    path = directory / name
    if not path.is_file():
        raise ReferenceUnavailable(f"Reference data is unavailable: {name} is missing")
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ReferenceUnavailable(f"Reference data is unavailable: {name} lacks column(s) {sorted(missing)}")
        return list(reader)


def _text(value: str | None) -> str | None:
    value = (value or "").strip()
    return None if not value or value == TODO else value


def _number(value: str | None) -> float | None:
    text = _text(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _ready_crop_ids(directory: Path) -> set[str]:
    """Which crop_ids have every cell a recommendation needs: a generic reference dose for
    all three nutrients, and at least one split_schedule row -- the same criteria
    src.data_pipeline.soil_data_loader.ready_crops() checks (its own docstring: "Saloni's
    /reference/crops lists only the ready ones"). Not a call to that function directly: it
    only reads from the fixed soil_data_loader.EXTERNAL_DIR, not the `directory` this module
    is parameterized by (real requests and this module's own tests can point at a different
    path), and it builds a full ReferenceTables object this module doesn't otherwise need.
    If load_reference_tables() ever takes a directory argument, switch to calling
    ready_crops() directly instead of keeping this in sync by hand."""
    doses = _read(directory, "reference_doses.csv", {"crop_id", "variety_id", "n_kg_ha", "p2o5_kg_ha", "k2o_kg_ha"})
    split_schedule = _read(directory, "split_schedule.csv", {"crop_id"})

    doses_by_crop_generic = {row["crop_id"]: row for row in doses if row["variety_id"] == "generic"}
    split_crops = {row["crop_id"] for row in split_schedule}

    ready = set()
    for crop_id, dose in doses_by_crop_generic.items():
        if crop_id not in split_crops:
            continue
        if any(str(dose[col]).startswith("TODO") for col in ("n_kg_ha", "p2o5_kg_ha", "k2o_kg_ha")):
            continue
        ready.add(crop_id)
    return ready


def load_crops(directory: Path) -> list[ReferenceCrop]:
    crops = _read(directory, "crops.csv", {"crop_id", "name_en", "name_hi"})
    stages = _read(directory, "growth_stages.csv", {"crop_id", "stage_id", "name_en", "name_hi", "order"})
    try:
        varieties = _read(directory, "crop_varieties.csv", {"crop_id", "variety_id", "name_en", "name_hi"})
    except ReferenceUnavailable:
        varieties = []
    ready_crop_ids = _ready_crop_ids(directory)

    result = []
    for crop in crops:
        if crop["crop_id"] not in ready_crop_ids:
            continue
        crop_stages = sorted(
            (
                ReferenceStage(
                    id=row["stage_id"], name_en=row["name_en"], name_hi=_text(row["name_hi"]), order=int(row["order"])
                )
                for row in stages
                if row["crop_id"] == crop["crop_id"]
            ),
            key=lambda stage: stage.order,
        )
        if not crop_stages:
            continue
        crop_varieties = [
            ReferenceVariety(id=row["variety_id"], name_en=row["name_en"], name_hi=_text(row["name_hi"]))
            for row in varieties
            if row["crop_id"] == crop["crop_id"] and row["variety_id"] != "generic"
        ]
        result.append(
            ReferenceCrop(
                id=crop["crop_id"],
                name_en=crop["name_en"],
                name_hi=_text(crop["name_hi"]),
                varieties=crop_varieties,
                stages=crop_stages,
            )
        )
    return result


def load_soil_ratings(directory: Path) -> list[SoilRating]:
    rows = _read(directory, "soil_test_ratings.csv", {"parameter", "unit", "low_below", "high_above"})
    ratings = []
    for row in rows:
        low, high = _number(row["low_below"]), _number(row["high_above"])
        if low is None or high is None:
            continue
        ratings.append(
            SoilRating(
                parameter=row["parameter"],
                unit=row["unit"],
                very_low_below=_number(row.get("very_low_below")),
                low_below=low,
                high_above=high,
            )
        )
    return ratings


def load_fertilizers(directory: Path) -> list[FertilizerProduct]:
    """Only products with a price are returned. The engine can plan a product with no price (single
    superphosphate for sugarcane), which therefore has no entry here: see docs/data-dictionary.md."""
    rows = _read(directory, "fertilizer_products.csv", {"product_id", "name", "n_pct", "p2o5_pct", "k2o_pct", "price_inr_per_kg"})
    products = []
    for row in rows:
        price = _number(row["price_inr_per_kg"])
        n, p, k = _number(row["n_pct"]), _number(row["p2o5_pct"]), _number(row["k2o_pct"])
        if price is None or n is None or p is None or k is None:
            continue
        products.append(
            FertilizerProduct(
                id=row["product_id"],
                name=row["name"],
                n_pct=n,
                p2o5_pct=p,
                k2o_pct=k,
                price_inr_per_kg=price,
                price_date=_text(row.get("price_date")),
                bag_size_kg=_number(row.get("bag_size_kg")),
            )
        )
    return products


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((phi2 - phi1) / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def load_seasonal_weather(directory: Path, lat: float, lng: float, month: int) -> SeasonalWeather:
    """Nearest region by coordinates. Needs latitude and longitude columns in the table, or a single region."""
    rows = _read(
        directory,
        "seasonal_weather.csv",
        {"region_key", "month", "temperature_c", "humidity_pct", "rainfall_mm_5day"},
    )
    this_month = [
        row
        for row in rows
        if _number(row["month"]) == month
        and _number(row["temperature_c"]) is not None
        and _number(row["humidity_pct"]) is not None
        and _number(row["rainfall_mm_5day"]) is not None
    ]
    if not this_month:
        raise ReferenceUnavailable(f"Reference data is unavailable: seasonal_weather.csv has no complete row for month {month}")

    with_coordinates = [
        row for row in this_month if _number(row.get("latitude")) is not None and _number(row.get("longitude")) is not None
    ]
    if with_coordinates:
        chosen = min(
            with_coordinates,
            key=lambda row: _distance_km(lat, lng, float(row["latitude"]), float(row["longitude"])),
        )
    elif len({row["region_key"] for row in this_month}) == 1:
        chosen = this_month[0]
    else:
        raise ReferenceUnavailable(
            "Reference data is unavailable: seasonal_weather.csv has several regions but no latitude and longitude columns"
        )
    return SeasonalWeather(
        temperature_c=float(chosen["temperature_c"]),
        humidity_pct=float(chosen["humidity_pct"]),
        rainfall_mm_forecast=float(chosen["rainfall_mm_5day"]),
    )
