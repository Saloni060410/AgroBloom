"""What a field's history can add to a recommendation without inventing agronomy.

Three jobs, each a pure function of its inputs:

  stage_from_sowing   which growth stage the crop is really in, from the sowing date, because the
                      stage saved on the field goes stale as soon as nobody updates it;
  rain_after          daily rainfall that fell in a window, for judging how much of an earlier
                      nitrogen application is likely to have washed out;
  soil_history_insights
                      observations from the farmer's earlier soil tests: a reading that is
                      suspiciously far from the last one, a nutrient rating that moved, an
                      organic carbon level that keeps falling.

None of these changes a published dose. They change what is credited, what is held back, and what
the farmer is told. Every threshold is in agronomy_rules.yaml.
"""

from __future__ import annotations

from datetime import date, timedelta
from itertools import pairwise

from src.data_pipeline.feature_engineering import soil_rating
from src.data_pipeline.soil_data_loader import ReferenceTables
from src.engine.stage_timing import window_das
from src.evaluation.explainability import render_template

_PARAM_LABEL = {
    "n": ("Nitrogen (N)", "kg/ha"),
    "p": ("Phosphorus (P)", "kg/ha"),
    "k": ("Potassium (K)", "kg/ha"),
    "ph": ("Soil pH", ""),
    "organic_carbon": ("Organic carbon", "%"),
}
_RATING_WORD = {"very_low": "very low", "low": "low", "medium": "medium", "high": "high"}
_RATING_ORDER = {"very_low": 0, "low": 1, "medium": 2, "high": 3}


def _parse_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def stage_from_sowing(tables: ReferenceTables, crop_id: str, sowing_date: date | None, today: date) -> dict | None:
    """The latest stage whose das_start has already been reached, among the crop's stages that
    have a sourced das_start. None when the sowing date is unknown, the crop has no dated stage,
    or the crop has not yet reached its first dated stage."""
    if sowing_date is None:
        return None
    das = (today - _as_date(sowing_date)).days
    reached = None
    for row in sorted((r for r in tables.growth_stages if r["crop_id"] == crop_id), key=lambda r: int(r["order"])):
        window = window_das(tables, row, late_transplant=True)
        if window is not None and window[0] <= das:
            reached = row
    return reached


def rain_after(rainfall_history: list[dict], start: date, days: int) -> tuple[float, int]:
    """(mm, days_with_data) for the `days` days beginning on `start`, inclusive. Days with no entry
    are not counted as dry, which is why the number of days with data is returned too."""
    by_day = {_as_date(item["date"]): float(item["mm"]) for item in rainfall_history}
    window = [start + timedelta(days=offset) for offset in range(days)]
    seen = [by_day[d] for d in window if d in by_day]
    return sum(seen), len(seen)


def recent_rain(rainfall_history: list[dict], today: date, days: int) -> float:
    """mm that fell in the last `days` days up to and including today."""
    return rain_after(rainfall_history, today - timedelta(days=days - 1), days)[0]


def _fmt(value: float) -> str:
    return f"{value:g}" if abs(value) < 1000 else f"{value:.0f}"


def _date_label(value: date) -> str:
    return f"{value.day} {value.strftime('%b %Y')}"


def soil_history_insights(
    tables: ReferenceTables,
    rules: dict,
    latest: dict,
    latest_date: date | None,
    previous: list[dict],
    today: date,
) -> list[dict]:
    """Observations from earlier tests, newest first. Each item: {kind, severity, text} where
    severity is "warning" (check this), "watch" (worth acting on) or "good". `previous` holds the
    tests before `latest`, each with a `tested_on` date and the six soil values."""
    if not previous:
        return []
    earlier = sorted(previous, key=lambda t: _as_date(t["tested_on"]), reverse=True)
    last = earlier[0]
    last_date = _as_date(last["tested_on"])
    out: list[dict] = []

    # 1. A reading far from the previous test is more likely a misread than a real change.
    recent_enough = latest_date is None or (latest_date - last_date).days <= rules["soil_jump_days"]
    if recent_enough:
        ratio = rules["soil_jump_ratio"]
        for key in ("n", "p", "k"):
            before, now = float(last[key]), float(latest[key])
            if before > 0 and (now >= before * ratio or now <= before / ratio):
                label, unit = _PARAM_LABEL[key]
                out.append({"kind": "soil_jump", "severity": "warning", "nutrient": key, "text": render_template(
                    "history.soil_jump", label=label, now=_fmt(now), before=_fmt(before), unit=unit, date=_date_label(last_date))})
        for key, limit in (("ph", rules["soil_jump_ph"]), ("organic_carbon", rules["soil_jump_oc"])):
            before, now = float(last[key]), float(latest[key])
            if abs(now - before) >= limit:
                label, unit = _PARAM_LABEL[key]
                out.append({"kind": "soil_jump", "severity": "warning", "nutrient": key, "text": render_template(
                    "history.soil_jump", label=label, now=_fmt(now), before=_fmt(before), unit=unit, date=_date_label(last_date))})

    flagged = {item["nutrient"] for item in out}

    # 2. A rating that moved a class since the last test (not for a reading already flagged).
    for key in ("n", "p", "k"):
        if key in flagged:
            continue
        r_before, r_now = soil_rating(tables, key, float(last[key])), soil_rating(tables, key, float(latest[key]))
        if r_before not in _RATING_ORDER or r_now not in _RATING_ORDER or r_before == r_now:
            continue
        label, unit = _PARAM_LABEL[key]
        dropped = _RATING_ORDER[r_now] < _RATING_ORDER[r_before]
        out.append({
            "kind": "rating_dropped" if dropped else "rating_improved",
            "severity": "watch" if dropped else "good",
            "nutrient": key,
            "text": render_template(
                "history.rating_dropped" if dropped else "history.rating_improved",
                label=label, before_rating=_RATING_WORD[r_before], now_rating=_RATING_WORD[r_now],
                before=_fmt(float(last[key])), now=_fmt(float(latest[key])), unit=unit, date=_date_label(last_date)),
        })

    # 3. Organic carbon that keeps falling across several tests.
    series = sorted([*earlier, {"tested_on": (latest_date or today).isoformat(), **latest}], key=lambda t: _as_date(t["tested_on"]))
    if "organic_carbon" not in flagged and len(series) >= rules["oc_trend_min_tests"]:
        values = [float(t["organic_carbon"]) for t in series]
        never_rises = all(b <= a + 1e-9 for a, b in pairwise(values))
        if never_rises and values[0] - values[-1] >= rules["oc_trend_drop"]:
            out.append({"kind": "oc_falling", "severity": "watch", "nutrient": "organic_carbon", "text": render_template(
                "history.oc_falling", first=_fmt(values[0]), now=_fmt(values[-1]), n=len(values),
                date=_date_label(_as_date(series[0]["tested_on"])))})

    return out
