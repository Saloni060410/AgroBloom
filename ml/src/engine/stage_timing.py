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
