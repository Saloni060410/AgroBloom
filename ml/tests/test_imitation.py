"""The rule-imitation classifier: its inputs, the teacher it learns from, training, and the engine
feeding it. Everything runs on the real reference tables; models are trained into a temp folder so the
repository's registry is never touched."""

import json
from pathlib import Path

import pytest

from src.api.schemas import RecommendRequest
from src.data_pipeline.soil_data_loader import load_reference_tables
from src.engine import recommendation_engine as engine_module
from src.engine.recommendation_engine import Engine, recommend
from src.models.imitation_features import (
    FEATURE_SET,
    build_imitation_features,
    feature_columns,
    stage_order,
)
from src.models.train_imitation import TODAY, draw_requests, teacher_product, train

CONFIG = Path(__file__).resolve().parents[1] / "configs" / "imitation.yaml"


@pytest.fixture(scope="module")
def tables():
    return load_reference_tables()


@pytest.fixture(scope="module")
def engine():
    return Engine()


def as_request(sample: dict) -> RecommendRequest:
    return RecommendRequest(
        field_id="f", crop_type=sample["crop_id"], irrigation=sample["irrigation"], growth_stage=sample["stage_id"],
        sowing_date=None, soil=sample["soil"], weather=sample["weather"], previous_fertilizer_usage=sample["prior"],
    )


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    """One small training run shared by the tests below (about 1 s)."""
    root = tmp_path_factory.mktemp("imitation")
    entry = train(CONFIG, samples=1500, artifact_dir=root / "models_artifacts", registry_path=root / "registry.json", runs_dir=root / "runs")
    return root, entry


# ---- inputs ------------------------------------------------------------------------------------

def test_columns_are_fixed_and_follow_the_reference_tables(tables):
    columns = feature_columns(tables)
    assert columns[-5:] == ["irrigated", "stage_order", "n", "p", "k"]
    assert [c for c in columns if c.startswith("crop_id__")] == sorted(f"crop_id__{r['crop_id']}" for r in tables.crops)
    one = build_imitation_features([{"crop_id": "wheat", "irrigation": "irrigated", "stage_id": "sowing", "n": 300, "p": 15, "k": 150}], tables)
    rice_first = next(r["stage_id"] for r in tables.growth_stages if r["crop_id"] == "rice")  # transplanted: no "sowing"
    two = build_imitation_features([{"crop_id": "rice", "irrigation": "rainfed", "stage_id": rice_first, "n": 1, "p": 2, "k": 3}], tables)
    assert list(one.columns) == list(two.columns) == columns
    assert one.loc[0, "crop_id__wheat"] == 1.0 and one["crop_id__rice"].iloc[0] == 0.0
    assert one.loc[0, "irrigated"] == 1.0 and two.loc[0, "irrigated"] == 0.0


def test_the_stage_is_its_position_in_the_season(tables):
    assert stage_order(tables, "wheat", "sowing") == 1
    assert stage_order(tables, "wheat", "second_irrigation") > stage_order(tables, "wheat", "sowing")
    with pytest.raises(KeyError):
        stage_order(tables, "wheat", "no_such_stage")


# ---- the teacher -------------------------------------------------------------------------------

def test_the_draw_is_reproducible_and_covers_every_crop(tables):
    first, second = draw_requests(tables, 400, seed=7), draw_requests(tables, 400, seed=7)
    assert first == second
    assert draw_requests(tables, 400, seed=8) != first
    assert {r["crop_id"] for r in first} == {row["crop_id"] for row in tables.crops}


def test_the_fast_teacher_picks_the_same_product_as_the_full_recommendation(engine, tables):
    """The teacher skips the risk, cost and explanation layers for speed. It must still decide exactly
    as recommend() does, or the model would imitate something other than the plan people see."""
    samples = draw_requests(tables, 60, seed=11)
    disagreements = [
        (s["crop_id"], s["stage_id"], teacher_product(engine, s), recommend(as_request(s), engine, TODAY).recommendation.fertilizer_type)
        for s in samples
    ]
    assert all(teacher == full for _, _, teacher, full in disagreements), [d for d in disagreements if d[2] != d[3]]


# ---- training ----------------------------------------------------------------------------------

def test_training_agrees_with_the_rules_far_above_the_baseline_and_records_the_run(trained):
    root, entry = trained
    t, s = entry["test_metrics"], entry["samples"]
    baseline = next(v for k, v in t.items() if k.startswith("baseline_always_"))
    assert t["agreement_with_rule_engine"] >= 0.95
    assert t["agreement_with_rule_engine"] > baseline + 0.15
    low, high = t["agreement_ci95"]
    assert low <= t["agreement_with_rule_engine"] <= high
    assert s["train"] + s["held_out"] == s["unique_used"]
    assert entry["feature_set"] == FEATURE_SET and entry["seed"] == 42
    assert (root / entry["artifact"]).exists() and (root / entry["labels"]).exists()
    registry = json.loads((root / "registry.json").read_text())
    assert registry["models"][-1]["run_id"] == entry["run_id"]
    assert (root / "runs" / entry["run_id"] / "metrics.json").exists()


def test_the_same_seed_gives_the_same_data_and_the_same_result(trained, tmp_path):
    _, first = trained
    again = train(CONFIG, samples=1500, artifact_dir=tmp_path / "models_artifacts", registry_path=tmp_path / "registry.json", runs_dir=tmp_path / "runs")
    assert again["dataset_hash"] == first["dataset_hash"]
    assert again["test_metrics"]["agreement_with_rule_engine"] == first["test_metrics"]["agreement_with_rule_engine"]


def test_a_second_run_becomes_the_next_version_and_never_overwrites(trained, tmp_path):
    root, first = trained
    second = train(CONFIG, samples=600, artifact_dir=root / "models_artifacts", registry_path=root / "registry.json", runs_dir=root / "runs")
    assert first["version"] == "0.1.0" and second["version"] == "0.1.1"
    assert (root / first["artifact"]).exists()


# ---- the engine --------------------------------------------------------------------------------

@pytest.fixture
def engine_with_imitation_model(trained, monkeypatch):
    root, _ = trained
    monkeypatch.setattr(engine_module, "REGISTRY_PATH", root / "registry.json")
    monkeypatch.setattr(engine_module, "ML_ROOT", root)
    return Engine()


def test_the_engine_loads_the_model_and_names_it_in_the_version(engine_with_imitation_model):
    model = engine_with_imitation_model.model
    assert model is not None and model.feature_set == FEATURE_SET
    assert engine_with_imitation_model.status == "ok"
    assert engine_with_imitation_model.model_version.startswith("rule-imitation-classifier-0.1.")


def test_it_rarely_disagrees_with_the_plan_it_was_trained_on(engine_with_imitation_model, tables):
    samples = draw_requests(tables, 80, seed=99)  # different seed from training: unseen requests
    notes = [
        any("classifier" in n and "differed" in n for n in recommend(as_request(s), engine_with_imitation_model, TODAY).explanation.data_notes)
        for s in samples
    ]
    assert sum(notes) / len(notes) <= 0.06


def test_a_model_for_inputs_the_engine_cannot_build_gives_no_opinion_and_no_failure(engine_with_imitation_model, tables):
    engine = engine_with_imitation_model
    engine.model.feature_set = "some_future_feature_set"
    sample = draw_requests(tables, 1, seed=3)[0]
    response = recommend(as_request(sample), engine, TODAY)
    assert response.recommendation.fertilizer_type == teacher_product(engine, sample)
    assert not any("differed" in n for n in response.explanation.data_notes)


def test_the_model_can_load_in_the_background_while_plans_are_already_served(trained, monkeypatch, tables):
    """A host that starts the service on demand answers first and loads the classifier after. Until it is
    there, plans carry no classifier note and /health says why; once it is there, it is used as normal."""
    import time

    root, _ = trained
    monkeypatch.setattr(engine_module, "REGISTRY_PATH", root / "registry.json")
    monkeypatch.setattr(engine_module, "ML_ROOT", root)
    monkeypatch.setenv("ML_LOAD_MODEL_IN_BACKGROUND", "true")
    monkeypatch.setattr(engine_module, "_MODEL_CACHE", {})  # force a real load, not a cached one

    engine = Engine()
    assert engine.model_loading or engine.model is not None  # returned without waiting for the load
    sample = draw_requests(tables, 1, seed=5)[0]
    assert recommend(as_request(sample), engine, TODAY).recommendation.fertilizer_type == teacher_product(engine, sample)

    deadline = time.time() + 30
    while engine.model is None and time.time() < deadline:
        time.sleep(0.05)
    assert engine.model is not None and engine.model.feature_set == FEATURE_SET
    assert engine.status == "ok" and not engine.model_loading
