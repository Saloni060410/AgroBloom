"""Trains the rule-imitation classifier: a model taught to pick the same main product as the rule engine.

    python -m src.models.train_imitation --config configs/imitation.yaml

Why it exists. The first classifier was trained on a synthetic dataset whose labels come from a data
generator, not from the dose tables, so it disagreed with the rule-based plan about as often as it
agreed. The rule-based plan is the one the project trusts (published tables, shown working), so this
model is trained to follow it: random but realistic requests are drawn, the rule engine is asked what
its main product would be (the "teacher"), and the classifier learns that answer from the crop, the
irrigation, the growth stage and the soil's N, P and K.

What it is not. It adds no independent evidence: it reproduces the rules, and a high agreement score is
a measure of imitation, not of agronomic correctness. The rule-based plan decides the dose and the
product either way; the model's only visible effect is the side note when it disagrees, which now
points at an unusual request instead of at a systematic difference. See MODEL_CARD.md.

Method, in the order the leakage rules ask for: draw, de-duplicate, split BEFORE fitting (stratified,
seeded), cross-validate on the training part only, fit, evaluate once on the held-out part with a
bootstrap interval, compare with the always-urea baseline, record the run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import time
import warnings
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import yaml
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

from src.engine.npk_calculator import compute_balance, to_products
from src.engine.recommendation_engine import Engine, _pk_window_days, _primary_product
from src.models import (
    train as first_trainer,  # paths and small helpers shared with the first classifier
)
from src.models.imitation_features import FEATURE_SET, build_imitation_features
from src.models.seeding import seed_everything

# A fixed calendar anchor, so the draw is the same whatever day the model is trained.
TODAY = date(2026, 10, 22)
PRIOR_PRODUCTS = ("urea", "dap", "mop")

# Realistic ranges for a soil test (kg/ha for N, P, K), wide enough to cover every rating band.
SOIL_RANGES = {"n": (80, 700, 0), "p": (3, 60, 1), "k": (40, 520, 0), "ph": (5.0, 9.0, 1), "organic_carbon": (0.15, 1.3, 2), "moisture": (8, 85, 0)}


def _combos(tables) -> list[tuple[str, str]]:
    return sorted({(row["crop_id"], row["irrigation"]) for row in tables.reference_doses})


def _stages(tables) -> dict[str, list[tuple[int, str]]]:
    out: dict[str, list[tuple[int, str]]] = {}
    for row in tables.growth_stages:
        out.setdefault(row["crop_id"], []).append((int(row["order"]), row["stage_id"]))
    return {crop: sorted(rows) for crop, rows in out.items()}


def draw_requests(tables, n: int, seed: int) -> list[dict]:
    """n random, realistic requests: a crop and irrigation the dose tables cover, any stage of its
    season, a soil test anywhere in the plausible ranges, and (half the time) one or two applications
    in the last eight weeks that the engine will credit."""
    rng = random.Random(seed)
    combos, stages = _combos(tables), _stages(tables)
    requests = []
    for _ in range(n):
        crop, irrigation = rng.choice(combos)
        _, stage = rng.choice(stages[crop])
        soil = {key: round(rng.uniform(low, high), digits) for key, (low, high, digits) in SOIL_RANGES.items()}
        prior = []
        if rng.random() < 0.5:
            for _ in range(rng.choice([1, 2])):
                prior.append({
                    "type": rng.choice(PRIOR_PRODUCTS),
                    "quantity_kg_per_acre": round(rng.uniform(10, 80)),
                    "applied_on": (TODAY - timedelta(days=rng.randint(3, 55))).isoformat(),
                })
        weather = {"temperature_c": round(rng.uniform(8, 38)), "humidity_pct": round(rng.uniform(25, 95)), "rainfall_mm_forecast": 0, "source": "live"}
        requests.append({"crop_id": crop, "irrigation": irrigation, "stage_id": stage, "soil": soil, "prior": prior, "weather": weather})
    return requests


def teacher_product(engine: Engine, request: dict) -> str:
    """The rule engine's main product for this request. The same calls recommend() makes to decide it
    (nutrient balance, then the split into products, then the largest total), without the risk, cost
    and explanation layers that do not affect the choice. tests/test_imitation.py checks the two agree."""
    balance, _ = compute_balance(
        request["crop_id"], None, request["irrigation"], request["stage_id"], request["soil"], request["prior"],
        engine.tables, TODAY,
        credit_window_days=engine.rules["credit_window_days"],
        pk_window_days=_pk_window_days(engine, request["crop_id"]),
        rainfall_history=[], rain_rules=engine.rules, rules=engine.rules,
    )
    schedule = to_products(
        balance, request["crop_id"], request["stage_id"], None, request["weather"], engine.tables, TODAY,
        rain_hold_mm=engine.rules["rain_hold_mm"], rain_hold_days=engine.rules["rain_hold_days"], recent_rain_mm=0.0,
    )
    product, _ = _primary_product(schedule)
    return product


def build_frame(engine: Engine, n: int, seed: int) -> tuple[pd.DataFrame, pd.Series, int]:
    """(inputs, teacher labels, number of draws the engine could not answer and that were skipped)."""
    rows, labels, skipped = [], [], 0
    for request in draw_requests(engine.tables, n, seed):
        try:
            label = teacher_product(engine, request)
        except Exception:  # noqa: BLE001 -- a combination the tables do not cover; not a training row
            skipped += 1
            continue
        rows.append({"crop_id": request["crop_id"], "irrigation": request["irrigation"], "stage_id": request["stage_id"], **{k: request["soil"][k] for k in ("n", "p", "k")}})
        labels.append(label)
    X = build_imitation_features(rows, engine.tables)
    y = pd.Series(labels, name="product")
    keep = ~pd.concat([X, y], axis=1).duplicated()
    return X[keep].reset_index(drop=True), y[keep].reset_index(drop=True), skipped


def bootstrap_interval(correct: np.ndarray, seed: int, rounds: int = 1000) -> list[float]:
    rng = np.random.default_rng(seed)
    means = [correct[rng.integers(0, len(correct), len(correct))].mean() for _ in range(rounds)]
    return [round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4)]


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def train(config_path: Path, *, samples: int | None = None, artifact_dir: Path | None = None,
          registry_path: Path | None = None, runs_dir: Path | None = None) -> dict:
    started = time.monotonic()
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    seed = config["seed"]
    seed_everything(seed)
    artifact_dir = artifact_dir or first_trainer.ARTIFACT_DIR
    registry_path = registry_path or first_trainer.REGISTRY_PATH
    runs_dir = runs_dir or first_trainer.RUNS_DIR

    engine = Engine()
    engine._require_tables()
    X, y, skipped = build_frame(engine, samples or config["samples"], seed)

    # Split first, fit later: nothing below sees the held-out rows until the one final evaluation.
    stratify = y if y.value_counts().min() >= 2 else None
    X_train, X_held, y_train, y_held = train_test_split(X, y, test_size=config["held_out_fraction"], random_state=seed, stratify=stratify)

    def make_model() -> Pipeline:
        return Pipeline([("clf", RandomForestClassifier(random_state=seed, n_jobs=-1, **config["random_forest"]))])

    folds = min(config["folds"], int(y_train.value_counts().min()))
    cv = cross_val_score(make_model(), X_train, y_train, cv=StratifiedKFold(max(folds, 2), shuffle=True, random_state=seed), scoring="accuracy") if folds >= 2 else np.array([float("nan")])

    model = make_model().fit(X_train, y_train)
    predicted = model.predict(X_held)
    correct = (predicted == y_held.to_numpy()).astype(float)
    classes = [str(c) for c in model.named_steps["clf"].classes_]
    precision, recall, _f1, support = precision_recall_fscore_support(y_held, predicted, labels=classes, zero_division=0)
    crops = X_held[[c for c in X_held.columns if c.startswith("crop_id__")]].idxmax(axis=1).str.replace("crop_id__", "", regex=False)
    majority = y_train.value_counts().idxmax()
    test_metrics = {
        "agreement_with_rule_engine": round(float(correct.mean()), 4),
        "agreement_ci95": bootstrap_interval(correct, seed),
        "macro_f1": round(float(f1_score(y_held, predicted, average="macro", zero_division=0)), 4),
        "baseline_always_" + str(majority): round(float((y_held == majority).mean()), 4),
        "per_class": {c: {"precision": round(float(p), 4), "recall": round(float(r), 4), "support": int(s)} for c, p, r, s in zip(classes, precision, recall, support, strict=True)},
        "per_crop_agreement": {c: round(float(correct[(crops == c).to_numpy()].mean()), 4) for c in sorted(crops.unique())},
        "confusion_matrix": {"labels": classes, "rows_are_rule_engine": confusion_matrix(y_held, predicted, labels=classes).tolist()},
    }

    registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"models": []}
    model_name = config["model_name"]
    version = first_trainer._next_version(registry["models"], model_name)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{model_name}-{version}.joblib"
    labels_path = artifact_dir / f"{model_name}-{version}.labels.json"
    if artifact_path.exists():
        raise SystemExit(f"Refusing to overwrite an existing artifact: {artifact_path}")
    joblib.dump(model, artifact_path)
    labels_path.write_text(json.dumps(classes, indent=2) + "\n")

    project_root = artifact_dir.parent
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    frame_bytes = pd.concat([X, y], axis=1).to_csv(index=False).encode()
    entry = {
        "model_name": model_name,
        "version": version,
        "kind": "rule_imitation",
        "feature_set": FEATURE_SET,
        "artifact": str(artifact_path.relative_to(project_root)),
        "labels": str(labels_path.relative_to(project_root)),
        "labels_note": "predict_proba columns follow this list; decode with labels[index]",
        "teacher": "rule engine: compute_balance + to_products, main product = largest total across the schedule",
        "samples": {"drawn": int(samples or config["samples"]), "skipped": skipped, "unique_used": len(X), "train": len(X_train), "held_out": len(X_held), "class_counts": {str(k): int(v) for k, v in y.value_counts().items()}},
        "cv_metrics": {"accuracy": {"mean": round(float(np.nanmean(cv)), 4), "std": round(float(np.nanstd(cv)), 4), "folds": len(cv)}},
        "test_metrics": test_metrics,
        "dataset_source": "rule_engine_generated",
        "dataset_hash": _sha(frame_bytes),
        "config_hash": _sha(config_path.read_bytes()),
        "rules_hash": engine._rules_hash,
        "seed": seed,
        "git_sha": first_trainer._git_sha(),
        "date": datetime.now(UTC).isoformat(),
        "run_id": run_id,
    }
    registry["models"].append(entry)
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(json.dumps(registry, indent=2) + "\n")

    run_dir = runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.yaml").write_text(config_path.read_text())
    env = first_trainer.env_versions()
    env["wall_clock_seconds"] = round(time.monotonic() - started, 1)
    (run_dir / "metrics.json").write_text(json.dumps({"cv": entry["cv_metrics"], "test": test_metrics, "env": env}, indent=2, default=str))
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=Path("configs/imitation.yaml"))
    parser.add_argument("--samples", type=int, default=None, help="override the number of requests drawn")
    args = parser.parse_args()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)  # the engine warns about crops with no sourced season length
        entry = train(args.config, samples=args.samples)
    t = entry["test_metrics"]
    s = entry["samples"]
    print(f"{entry['model_name']} {entry['version']}: {s['unique_used']} unique requests ({s['train']} train, {s['held_out']} held out)")
    print(f"  agrees with the rule engine on {t['agreement_with_rule_engine'] * 100:.1f}% of held-out requests (95% CI {t['agreement_ci95'][0] * 100:.1f} to {t['agreement_ci95'][1] * 100:.1f})")
    baseline = next(v for k, v in t.items() if k.startswith("baseline_always_"))
    print(f"  always predicting the commonest product agrees on {baseline * 100:.1f}%  | cross-validated {entry['cv_metrics']['accuracy']['mean'] * 100:.1f}% (+/- {entry['cv_metrics']['accuracy']['std'] * 100:.1f})")
    print(f"  registered as the active classifier: {entry['artifact']}")


if __name__ == "__main__":
    main()
