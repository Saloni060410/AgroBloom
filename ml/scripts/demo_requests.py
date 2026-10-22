"""S11: regenerate today-anchored request payloads for the three demo scenarios.

`docs/contract-fixtures/demo_scenarios.json`'s dates are fixed calendar dates (its
`recommend_response` was produced once, via a direct engine call with `demo_today` pinned --
see the fixture's own module docstring in docs/demo-scenarios.md). The live `/recommend` and
`/risk-score` endpoints always use the real server clock (`recommendation_engine.py`'s
`date.today()`), never a client-supplied "today" -- so POSTing the fixture's payloads as-is
only reproduces the documented numbers on the one day those fixed dates happen to line up with
`agronomy_rules.yaml`'s 60-day credit window. Any other day, `sowing_date`/`applied_on` fall
outside (or, for wheat, land in the future relative to) that window and every `prior_credit_kg_ha`
silently comes back 0 -- verified directly against the live compose stack on 2026-09-28, see
ml/PROGRESS.md.

This script re-anchors every date in each scenario by the same day-offset that already existed
between it and that scenario's own `demo_today`, so the *relative* timing (days since sowing,
days since the fertilizer was applied) is preserved exactly regardless of what day this is
actually run. Reproduces the documented outcome on any day, not just once.

Usage:
    python -m scripts.demo_requests                     # today's real date
    python -m scripts.demo_requests --today 2026-12-25   # pin a date, for testing
    python -m scripts.demo_requests --scenario wheat_over_application --risk-score
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "docs" / "contract-fixtures" / "demo_scenarios.json"

# Scenario 1's over-application check (S11 step 2): the SAME 150 kg/acre urea already logged
# as history, reframed as a *planned* dose for /risk-score -- checks the planned-dose path
# flags it independently of the logged-history path /recommend already exercises.
OVER_APPLICATION_SCENARIO_ID = "wheat_over_application"
OVER_APPLICATION_PLANNED = [{"fertilizer_type": "urea", "quantity_kg_per_acre": 150.0}]


def _shift(iso_date: str, days: int) -> str:
    return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()


def refreshed_recommend_request(scenario: dict, today: date) -> dict:
    shift_days = (today - date.fromisoformat(scenario["demo_today"])).days
    request = deepcopy(scenario["recommend_request"])
    if request.get("sowing_date"):
        request["sowing_date"] = _shift(request["sowing_date"], shift_days)
    for usage in request.get("previous_fertilizer_usage", []):
        usage["applied_on"] = _shift(usage["applied_on"], shift_days)
    return request


def refreshed_risk_score_request(scenario: dict, today: date, planned_application: list[dict]) -> dict:
    """Builds a /risk-score payload from the same field context as /recommend -- RiskScoreRequest
    (schemas.py) takes crop_type/variety/irrigation/growth_stage/sowing_date/soil/weather like
    RecommendRequest, plus `planned_application` in place of a fertilizer log."""
    recommend = refreshed_recommend_request(scenario, today)
    shared_fields = {"crop_type", "variety", "irrigation", "growth_stage", "sowing_date", "soil", "weather"}
    request = {k: v for k, v in recommend.items() if k in shared_fields}
    request["planned_application"] = planned_application
    return request


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=date.fromisoformat, default=None)
    parser.add_argument("--scenario", default=None, help="only this scenario id (default: all three)")
    parser.add_argument("--risk-score", action="store_true", help="print the scenario-1 over-application /risk-score payload instead of /recommend requests")
    args = parser.parse_args()

    today = args.today or date.today()
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    scenarios = fixture["scenarios"]
    if args.scenario:
        scenarios = [s for s in scenarios if s["id"] == args.scenario]

    if args.risk_score:
        scenario = next(s for s in fixture["scenarios"] if s["id"] == OVER_APPLICATION_SCENARIO_ID)
        print(json.dumps(refreshed_risk_score_request(scenario, today, OVER_APPLICATION_PLANNED), indent=2))
        return

    out = {s["id"]: refreshed_recommend_request(s, today) for s in scenarios}
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
