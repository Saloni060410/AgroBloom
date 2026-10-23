"""Writes backend/src/data/reference.snapshot.json from the ML service's own /reference endpoints.

    python scripts/export_reference_snapshot.py

The backend keeps this copy of the crop, soil-rating and fertilizer lists for the moments when the ML
service is asleep or restarting and it has no cached answer: the farmer sees the lists at once instead of an
error. tests/test_reference_snapshot.py fails if the committed file stops matching the data, so it cannot
quietly go stale: run this script after any change to data/external/ and commit the result.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT))

SNAPSHOT_PATH = ML_ROOT.parent / "backend" / "src" / "data" / "reference.snapshot.json"


def build_snapshot() -> dict:
    from fastapi.testclient import TestClient

    from src.api.config import Settings, get_settings
    from src.api.main import app

    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, predict_mode="real")
    try:
        client = TestClient(app)
        return {
            "crops": client.get("/reference/crops").json(),
            "soilRatings": client.get("/reference/soil-ratings").json(),
            "fertilizers": client.get("/reference/fertilizers").json(),
        }
    finally:
        app.dependency_overrides.pop(get_settings, None)


def render(snapshot: dict) -> str:
    return json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


if __name__ == "__main__":
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(render(build_snapshot()), encoding="utf-8")
    print(f"wrote {SNAPSHOT_PATH}")
