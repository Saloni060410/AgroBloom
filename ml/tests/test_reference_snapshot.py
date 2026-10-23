"""The backend's bundled copy of the reference lists must match the data it was made from.

backend/src/data/reference.snapshot.json is what the API serves when the ML service is asleep and it has no
cached answer. If it fell behind (a new crop, variety or product), a farmer would be shown yesterday's lists
exactly when the service is slow. This fails the moment the data changes without the snapshot following."""

import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "scripts"))

from export_reference_snapshot import SNAPSHOT_PATH, build_snapshot


def test_the_backend_snapshot_matches_the_reference_data():
    committed = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    assert committed == build_snapshot(), (
        "backend/src/data/reference.snapshot.json is out of date. Run `python scripts/export_reference_snapshot.py` "
        "from ml/ and commit the result."
    )


def test_the_snapshot_covers_every_crop_and_the_products_a_plan_can_use():
    committed = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    assert {c["id"] for c in committed["crops"]} == {"wheat", "rice", "maize", "cotton", "sugarcane", "chickpea", "barley"}
    assert {"urea", "dap", "mop", "ssp"} <= {f["id"] for f in committed["fertilizers"]}
    assert committed["soilRatings"]
