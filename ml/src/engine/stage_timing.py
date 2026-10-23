"""When a growth stage falls, in days after sowing, and what PAU says to do then.

growth_stages.csv gives each stage a day window. For most stages the days count from sowing (DAS). A
few stages count from transplanting instead (DAT): rice's three nitrogen splits are "within 7 days of
transplanting", "21 days after transplanting" and "42 days after transplanting". Such a row has
`counted_from = transplanting`, and its window is moved forward by the day the crop is transplanted
(the `transplanting` stage's window). Reading those days as DAS dated the second rice split before the
crop was in the field.

Two offsets are used because the transplanting day is a range (25 to 30 days after nursery sowing):
the early one for dates shown to the farmer, so a "best before" is never later than it should be, and
the late one when deciding which stage the crop has surely reached, so it is never advanced early.
"""

from __future__ import annotations


def _number(value) -> float | None:
    text = str(value if value is not None else "").strip()
    if not text or text.startswith("TODO"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def transplant_offset(tables, crop_id: str, *, late: bool = False) -> float | None:
    """Days after sowing at which the crop is transplanted (the early or late end of that stage's window)."""
    for row in tables.growth_stages:
        if row["crop_id"] == crop_id and row["stage_id"] == "transplanting":
            return _number(row["das_end"] if late else row["das_start"])
    return None


def window_das(tables, row: dict, *, late_transplant: bool = False) -> tuple[float, float] | None:
    """(first day, last day) after sowing for a stage, or None when its days are not sourced."""
    start, end = _number(row["das_start"]), _number(row["das_end"])
    if start is None or end is None:
        return None
    if (row.get("counted_from") or "sowing").strip() == "transplanting":
        offset = transplant_offset(tables, row["crop_id"], late=late_transplant)
        if offset is None:
            return None
        start, end = start + offset, end + offset
    return start, end


def estimated_window_das(tables, row: dict) -> tuple[float, float] | None:
    """(first day, last day) after sowing that is an ESTIMATE, for a stage whose real days PAU does not give
    (stage_timing_estimates.csv, with the reasoning in est_basis). Used only to give the farmer an approximate
    date; it never decides which stage a crop is in."""
    for estimate in tables.stage_timing_estimates:
        if estimate["crop_id"] == row["crop_id"] and estimate["stage_id"] == row["stage_id"]:
            start, end = _number(estimate["est_start"]), _number(estimate["est_end"])
            return (start, end) if start is not None and end is not None else None
    return None


def window_or_estimate(tables, row: dict) -> tuple[tuple[float, float], bool] | None:
    """((first, last) day, is_estimate): the sourced window when there is one, otherwise the estimate."""
    sourced = window_das(tables, row)
    if sourced is not None:
        return sourced, False
    estimate = estimated_window_das(tables, row)
    return (estimate, True) if estimate is not None else None
