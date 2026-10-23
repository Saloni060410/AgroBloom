"""Assembles a full RecommendResponse / risk-score result (contract C1/C6) from Richa's
feature module and risk analyzer, and Saloni's dose calculator and cost module. Loaded once
at startup (FastAPI lifespan, see src/api/main.py) so the classifier, reference tables and
rules aren't re-read on every request.

Design decision, deliberately deviating from the literal S6 spec ("missing model ... gives
503"): the classifier is treated as an optional, secondary cross-check, not a hard
requirement. npk_calculator.to_products() already deterministically and transparently picks
every product (DAP for P, MOP for K, urea for remaining N) from sourced PAU tables --
ml/AGENTS.md's own words are "the model only refines the product choice". Making a missing
model a hard 503 would mean /recommend can never succeed until S3's classifier has real
training data (see ml/PROGRESS.md), which defeats the reason this step is being built now
while that data is still unavailable. /health still reports "degraded" with a clear reason
when no classifier is registered -- this is surfaced for monitoring, not hidden -- but
/recommend still returns a complete, correct answer built from the rule-based calculator
alone. Missing reference tables is a hard 503 either way: unlike the classifier, nothing here
can work without them.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

import joblib
import yaml

from src.api.schemas import (
    AppliedBalance,
    Cost,
    Explanation,
    NutrientBalance,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    Risk,
    RiskScoreRequest,
    RiskScoreResponse,
    ScheduleItem,
)
from src.data_pipeline.feature_engineering import (
    build_features,
    request_to_record,
    season_length_days,
)
from src.data_pipeline.soil_data_loader import (
    EXTERNAL_DIR,
    ReferenceDataError,
    ReferenceTables,
    load_reference_tables,
    validate_soil,
)
from src.degradation.risk_analyzer import assess_recommendation, score_planned
from src.engine.cost import compare_to_history, cost_breakdown, estimate_cost, prices_as_of
from src.engine.history import recent_rain, soil_history_insights, stage_from_sowing
from src.engine.npk_calculator import (
    _stage_row,
    compute_balance,
    phosphorus_alternatives,
    to_products,
)
from src.models.imitation_features import FEATURE_SET as IMITATION_FEATURE_SET
from src.models.imitation_features import build_imitation_features, prior_supply

try:  # R10 (explain, ranking rule_trace items with XGBoost pred_contribs) isn't built yet.
    from src.evaluation.explainability import explain as _richa_explain
except ImportError:
    _richa_explain = None

ML_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ML_ROOT / "src" / "models" / "model_registry" / "registry.json"
FORMULA = "fertilizer needed = standard dose for the crop + soil-test adjustment - credit for recent applications"


class EngineUnavailable(Exception):
    """Reference data (tables or rules) failed to load. A hard 503 -- unlike a missing
    classifier, nothing here can produce even a rule-based answer without this."""


@dataclass
class LoadedModel:
    name: str
    version: str
    pipeline: object
    labels: list[str]
    dataset_source: str  # "real" | "fallback" -- carried through so a caller can tell
    feature_set: str | None = None  # None: the original inputs (build_features); else see models/imitation_features
    rules_hash: str | None = None  # the rules the model was trained on; None for models that did not record it


# A loaded model per artifact file. The service builds its engine twice at start-up (once when the module
# loads, once in the lifespan) and each build used to unpickle the same file again.
_MODEL_CACHE: dict[tuple[str, int], object] = {}


def _rules_hash8() -> str:
    """Hash of every file in data/external/ together, so any change to any reference table
    or rule changes model_version -- a bad recommendation traces back to the exact tables
    that produced it (contract C1)."""
    digest = hashlib.sha256()
    for path in sorted(EXTERNAL_DIR.iterdir()):
        if path.is_file():
            digest.update(path.read_bytes())
    return digest.hexdigest()[:8]


def _load_active_model() -> LoadedModel | None:
    """None if no classifier is registered yet, its artifact/labels file is missing, or the
    registry is unreadable for any reason -- never an error. See the module docstring: this
    is not a hard requirement for /recommend, so a problem here degrades health, it never
    crashes startup or blocks a request."""
    try:
        if not REGISTRY_PATH.exists():
            return None
        registry = json.loads(REGISTRY_PATH.read_text())
        models = registry.get("models", [])
        if not models:
            return None
        entry = models[-1]  # train.py always appends a new version, never overwrites -- the last is active
        artifact_path = ML_ROOT / entry["artifact"]
        labels_path = ML_ROOT / entry["labels"]
        if not artifact_path.exists() or not labels_path.exists():
            return None
        cache_key = (str(artifact_path), artifact_path.stat().st_mtime_ns)
        if cache_key not in _MODEL_CACHE:
            _MODEL_CACHE[cache_key] = joblib.load(artifact_path)
        return LoadedModel(
            name=entry["model_name"],
            version=entry["version"],
            pipeline=_MODEL_CACHE[cache_key],
            labels=json.loads(labels_path.read_text()),
            dataset_source=entry.get("dataset_source", "unknown"),
            feature_set=entry.get("feature_set"),
            rules_hash=entry.get("rules_hash"),
        )
    except (OSError, json.JSONDecodeError, KeyError, IndexError):
        return None


class Engine:
    """Constructed once at FastAPI startup (see src/api/main.py's lifespan) and reused for
    every request. Nothing here is request-specific state."""

    def __init__(self) -> None:
        try:
            self.tables: ReferenceTables = load_reference_tables()
            with (EXTERNAL_DIR / "agronomy_rules.yaml").open(encoding="utf-8") as handle:
                self.rules: dict = yaml.safe_load(handle)
            self._startup_error: str | None = None
        except (ReferenceDataError, OSError, yaml.YAMLError) as error:
            self.tables = None
            self.rules = None
            self._startup_error = str(error)
        # Loading the classifier imports scikit-learn and scipy, most of the service's start-up time, and a plan
        # does not need it (it is an optional cross-check). With ML_LOAD_MODEL_IN_BACKGROUND=true, a host that
        # starts the service on demand can answer requests straight away while the model loads; until it has,
        # plans carry no classifier note and /health says so. Off by default, so tests and local runs are unchanged.
        self.model: LoadedModel | None = None
        self.model_loading = False
        self.model_stale = False
        if self._startup_error is None:
            if os.environ.get("ML_LOAD_MODEL_IN_BACKGROUND", "").lower() == "true":
                self.model_loading = True
                threading.Thread(target=self._load_model_in_background, name="load-classifier", daemon=True).start()
            else:
                self.model = self._load_current_model()
        self._rules_hash = _rules_hash8() if self._startup_error is None else None

    def _load_current_model(self) -> LoadedModel | None:
        """The active classifier, unless it was trained on other rules than the ones loaded now. It learns the
        rules, so after a change to data/external/ it would give an opinion about a plan the engine no longer
        makes; it is left out (and /health says why) until it is retrained. The plan never depends on it."""
        model = _load_active_model()
        self.model_stale = model is not None and model.rules_hash is not None and model.rules_hash != _rules_hash8()
        return None if self.model_stale else model

    def _load_model_in_background(self) -> None:
        try:
            self.model = self._load_current_model()
        finally:
            self.model_loading = False

    def refresh_model(self) -> None:
        """Re-checks the registry for a newer model without restarting the service. Not
        wired to an endpoint yet -- useful for tests and for a future admin/reload hook."""
        self.model = self._load_current_model()

    @property
    def status(self) -> Literal["ok", "degraded"]:
        return "degraded" if (self._startup_error is not None or self.model is None) else "ok"

    @property
    def status_detail(self) -> str | None:
        if self._startup_error is not None:
            return f"reference data unavailable: {self._startup_error}"
        if self.model is None and self.model_loading:
            return "the classifier model is still loading; plans are unaffected"
        if self.model_stale:
            return (
                "the classifier was trained on older rules than the ones loaded, so it is not used; "
                "retrain it with `python -m src.models.train_imitation --config configs/imitation.yaml`. Plans are unaffected"
            )
        if self.model is None:
            return "no classifier model is registered yet in model_registry/registry.json"
        return None

    @property
    def model_version(self) -> str:
        if self._startup_error is not None:
            return "unloaded"
        if self.model is None:
            return f"unloaded+rules-{self._rules_hash}"
        return f"{self.model.name}-{self.model.version}+rules-{self._rules_hash}"

    def _require_tables(self) -> None:
        if self._startup_error is not None:
            raise EngineUnavailable(self._startup_error)


def _primary_product(schedule: list[dict]) -> tuple[str, float]:
    """Contract C1: the primary product is the one with the largest total quantity across
    the schedule."""
    totals: dict[str, float] = {}
    for item in schedule:
        totals[item["fertilizer_type"]] = totals.get(item["fertilizer_type"], 0.0) + item["quantity_kg_per_acre"]
    if not totals:
        return "none", 0.0
    product = max(totals, key=totals.get)
    return product, round(totals[product], 3)


def plan_label(schedule: list[dict]) -> str:
    """Every product in the plan, as one label ("dap+urea"), or "none" for an empty plan. This is what the
    rule-imitation classifier predicts: not just the largest product, so a plan that adds potash or uses
    superphosphate for phosphorus is told apart from one that does not."""
    return "+".join(sorted({item["fertilizer_type"] for item in schedule})) or "none"


def _readable_label(label: str) -> str:
    return "no fertilizer" if label == "none" else " + ".join(label.split("+"))


def _classifier_opinion(engine: Engine, features, request: RecommendRequest, stage_id: str, today: date) -> list[dict] | None:
    """Top-3 classifier probabilities for explain(), and for the disagreement check in step
    (c). None if no classifier is registered -- the calculator's choice stands either way.
    Each model is fed the inputs it was trained on: the original classifier gets `features`; the
    rule-imitation model also needs the growth stage the plan was built for, which is why it is
    passed here rather than read from the request."""
    if engine.model is None:
        return None
    if engine.model.feature_set is None:
        inputs = features
    elif engine.model.feature_set == IMITATION_FEATURE_SET:
        soil = request.soil
        supplied = prior_supply(
            [usage.model_dump(mode="json") for usage in request.previous_fertilizer_usage], engine.tables, today,
            engine.rules["credit_window_days"], _pk_window_days(engine, request.crop_type) or engine.rules["credit_window_days"],
        )
        inputs = build_imitation_features(
            [{"crop_id": request.crop_type, "irrigation": request.irrigation, "stage_id": stage_id, "n": soil.n, "p": soil.p, "k": soil.k, **supplied}],
            engine.tables,
        )
    else:
        return None  # a model for inputs this engine does not know how to build: no opinion, plan unaffected
    proba = engine.model.pipeline.predict_proba(inputs)[0]
    order = proba.argsort()[::-1][:3]
    return [{"product": engine.model.labels[i], "probability": round(float(proba[i]), 4)} for i in order]


def _fallback_top_factors(rule_trace: list[dict]) -> list[str]:
    """Used only until Richa's R10 explain() exists (or if it raises): the first two
    rule_trace effects, as plain-as-possible sentences. A visibly lower-quality placeholder
    than the real explain(), not a permanent design."""
    factors = []
    for entry in rule_trace[:2]:
        nutrient = f" ({entry['nutrient'].upper()})" if entry.get("nutrient") else ""
        factors.append(f"{entry['rule_id']}{nutrient}: {entry['effect']}")
    return factors


def _unpriced_product_notes(schedule: list[dict], cost_breakdown_lines: list[dict], products_table: list[dict]) -> list[str]:
    """A product cost.py excluded from cost.breakdown because it has no verified price yet
    (npk_calculator.to_products()'s docstring, cost.py's module docstring) is still in the
    schedule with a real quantity -- this is the one place that gap surfaces to the caller,
    since cost.breakdown's own omission is silent by itself."""
    priced_ids = {line["fertilizer_type"] for line in cost_breakdown_lines}
    scheduled_ids = {line["fertilizer_type"] for line in schedule}
    names = {row["product_id"]: row["name"] for row in products_table}
    return [
        f"There is no verified price for {names.get(product_id, product_id)} yet, so the cost shown leaves "
        f"it out and the real cost is higher."
        for product_id in sorted(scheduled_ids - priced_ids)
    ]


def _pk_window_days(engine: Engine, crop_id: str) -> int | None:
    """Credit window for phosphorus and potassium: the crop's season where one is sourced (they stay
    in the soil), else the flat window. None when the rule is switched off."""
    if not engine.rules.get("credit_window_pk_uses_season"):
        return None
    return season_length_days(engine.tables, crop_id) or engine.rules["credit_window_days"]


def _effective_stage(engine: Engine, request: RecommendRequest, today: date) -> tuple[str, dict | None]:
    """The stage to plan for. The stage saved on the field is whatever the farmer last set, so it is
    usually behind; if the sowing date shows the crop has reached a LATER stage, that one is used.
    A stage the farmer advanced themselves is never moved backwards. Returns (stage_id, trace)."""
    _stage_row(engine.tables, request.crop_type, request.growth_stage)  # an unknown saved stage still raises -> 422
    derived = stage_from_sowing(engine.tables, request.crop_type, request.sowing_date, today)
    if derived is None:
        return request.growth_stage, None
    saved_order = int(_stage_row(engine.tables, request.crop_type, request.growth_stage)["order"])
    if int(derived["order"]) <= saved_order:
        return request.growth_stage, None
    das = (today - request.sowing_date).days
    return derived["stage_id"], {
        "rule_id": "stage_advanced_from_sowing_date",
        "nutrient": None,
        "value": das,
        "threshold": None,
        "effect": f"stage {request.growth_stage} -> {derived['stage_id']}",
        "params": {
            "days_after_sowing": das,
            "saved_stage": _stage_row(engine.tables, request.crop_type, request.growth_stage)["name_en"],
            "used_stage": derived["name_en"],
        },
    }


_NUTRIENT_NAMES = {"n": "nitrogen", "p": "phosphorus", "k": "potassium"}


def _data_notes(rule_trace: list[dict], weather_source: str) -> list[str]:
    notes = []
    unadjusted = [e for e in rule_trace if e["rule_id"] == "no_soil_adjustment_published"]
    if unadjusted:
        names = [_NUTRIENT_NAMES[e["nutrient"]] for e in unadjusted]
        names = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
        crop = unadjusted[0]["params"]["crop_id"]
        if all(e["params"]["band_factor"] is not None for e in unadjusted):
            bands = "; ".join(
                f"{_NUTRIENT_NAMES[e['nutrient']]} {e['value']:g} kg/ha is in the {e['params']['soil_rating'].replace('_', ' ')} band"
                + (
                    f", {e['params']['band_factor'] - 1:+.0%} ({e['params']['adjustment_kg_ha']:+.1f} kg/ha)"
                    if e["params"]["band_factor"] != 1.0
                    else ", so the standard dose"
                )
                for e in unadjusted
            )
            notes.append(
                f"For {crop}, the Punjab Agricultural University publishes no soil-test adjustment for {names}, so the "
                f"general ICAR rule for soil-test bands was used: a low band adds 25%, a high band takes off 25%, and "
                f"a medium band keeps the standard dose, the same inside a whole band. This is a general rule, not a PAU "
                f"figure, so check a dose that was cut with your local agriculture officer. Here: {bands}."
            )
        else:
            notes.append(
                f"For {crop}, the Punjab Agricultural University publishes no soil-test adjustment for {names}. "
                f"Those doses stay at the standard published dose whatever the soil test reads; "
                f"your soil values still set the soil ratings shown."
            )
    for entry in rule_trace:
        if entry["rule_id"] == "stage_advanced_from_sowing_date":
            p = entry["params"]
            notes.append(
                f"The crop is {p['days_after_sowing']} days after sowing, so this plan is built for the "
                f"{p['used_stage']} stage. The field was saved at {p['saved_stage']}."
            )
        elif entry["rule_id"] == "n_credit_reduced_after_rain":
            p = entry["params"]
            notes.append(
                f"Nitrogen from the {p['product']} applied on {p['applied_on']} was credited at x{p['factor']}: "
                f"{p['rain_mm']} mm of rain fell in the {p['days']} days after it, which can wash nitrogen out of the soil."
            )
        elif entry["rule_id"] == "credit_skipped_no_efficiency":
            notes.append(
                f"No credit was given for last season's fertilizer because no use-efficiency "
                f"figure is available for the {entry['nutrient'].upper()} nutrient."
            )
        elif entry["rule_id"] == "credit_ignored_unknown_product":
            products = ", ".join(entry["params"]["unknown_product_ids"])
            notes.append(f"Previous fertilizer use listed an unrecognised product ({products}), ignored.")
        elif entry["rule_id"] == "classifier_disagreement":
            notes.append(
                f"The product classifier's top guess ({_readable_label(entry['value'])}) differed from the "
                f"rule-based plan ({_readable_label(entry['params']['balance_choice'])}); the rule-based plan was kept."
            )
    if weather_source != "live":
        notes.append(f"Weather is a {weather_source.replace('_', ' ')} value, not a live forecast.")
    return notes


def _product_notes(schedule: list[dict], request: RecommendRequest, tables, plan_with) -> list[str]:
    """What the plan leaves the farmer to decide: the same phosphorus from another product (PAU lists
    DAP, single superphosphate and, for wheat and maize, nitrophosphate), and a variety with its own dose."""
    notes = []
    crop = request.crop_type.replace("_", " ")
    alternatives = phosphorus_alternatives(schedule, request.crop_type, tables, plan_with)
    if alternatives:
        parts = []
        for option in alternatives["options"]:
            urea = option["urea_change_kg_per_acre"]
            urea_text = (
                f", with about {abs(urea):g} kg/acre {'more' if urea > 0 else 'less'} urea" if urea is not None and abs(urea) >= 1 else ""
            )
            parts.append(f"{option['name']}: {option['quantity_kg_per_acre']:g} kg/acre{urea_text}")
        sulphur = " Single superphosphate also supplies sulphur." if "ssp" in {o["product_id"] for o in alternatives["options"]} | {alternatives["primary_id"]} else ""
        notes.append(
            f"{alternatives['primary_name']} is the phosphorus fertilizer in PAU's table for {crop}. The same "
            f"{alternatives['p2o5_kg_per_acre']:g} kg/acre of phosphorus (P2O5) can come from: " + "; ".join(parts) + f".{sulphur}"
        )
    if not request.variety:
        varieties = [row["name_en"] for row in tables.crop_varieties if row["crop_id"] == request.crop_type]
        if varieties:
            notes.append(
                f"PAU gives a different {crop} dose for {' and '.join(varieties)}. This plan uses the general "
                f"{crop} dose; choose the variety on the field to get the dose that matches it."
            )
    return notes


def recommend(request: RecommendRequest, engine: Engine, today: date | None = None) -> RecommendResponse:
    engine._require_tables()
    today = today or date.today()  # noqa: DTZ011 -- caller (the endpoint) always passes today explicitly in tests; the default only serves real traffic

    validate_soil(request.soil.model_dump())
    payload = request.model_dump(mode="json")
    record = request_to_record(payload, tables=engine.tables)  # raises UnknownCropError -> 422
    features = build_features([record], tables=engine.tables)

    previous_usage = payload["previous_fertilizer_usage"]
    rainfall = payload["rainfall_history"]
    stage_used, stage_trace = _effective_stage(engine, request, today)
    balance, rule_trace = compute_balance(
        request.crop_type,
        request.variety,
        request.irrigation,
        stage_used,
        payload["soil"],
        previous_usage,
        engine.tables,
        today,
        credit_window_days=engine.rules["credit_window_days"],
        pk_window_days=_pk_window_days(engine, request.crop_type),
        rainfall_history=rainfall,
        rain_rules=engine.rules,
        rules=engine.rules,
    )  # raises ReferenceDataIncomplete -> 503, UnknownStageError -> 422
    if stage_trace:
        rule_trace.append(stage_trace)

    def schedule_for(p_product: str | None = None) -> list[dict]:
        return to_products(
            balance,
            request.crop_type,
            stage_used,
            request.sowing_date,
            payload["weather"],
            engine.tables,
            today,
            rain_hold_mm=engine.rules["rain_hold_mm"],
            rain_hold_days=engine.rules["rain_hold_days"],
            recent_rain_mm=recent_rain(rainfall, today, engine.rules["recent_rain_hold_days"]) if rainfall else 0.0,
            p_product=p_product,
        )

    schedule = schedule_for()  # raises ReferenceDataIncomplete -> 503 only if a needed product has no ROW at all;
    # an unpriced-but-known product (e.g. SSP, see cost.py) is still scheduled here.

    primary_product, primary_quantity = _primary_product(schedule)
    classifier_opinion = _classifier_opinion(engine, features, request, stage_used, today)
    # The original classifier names one product; the rule-imitation one names the whole set in the plan.
    plan_choice = plan_label(schedule) if engine.model is not None and engine.model.feature_set == IMITATION_FEATURE_SET else primary_product
    if classifier_opinion and classifier_opinion[0]["product"] != plan_choice:
        rule_trace.append(
            {
                "rule_id": "classifier_disagreement",
                "nutrient": None,
                "value": classifier_opinion[0]["product"],
                "threshold": None,
                "effect": "balance kept, classifier opinion recorded",
                "params": {"classifier_top3": classifier_opinion, "balance_choice": plan_choice},
            }
        )

    try:
        if _richa_explain is None:
            raise NotImplementedError("explain() is not implemented yet (R10)")
        # explain() describes the original classifier through its input columns; the rule-imitation
        # model has different ones, and a sentence about its feature importances would be about the
        # rules, not about this field, so it gets none.
        explained = classifier_opinion if engine.model is None or engine.model.feature_set is None else None
        top_factors = _richa_explain(features=record, prediction=explained, rule_trace=rule_trace, top_k=3)
    except Exception:  # noqa: BLE001 -- explain() is unbuilt/untested (R10); anything it does must never break /recommend
        top_factors = _fallback_top_factors(rule_trace)

    products_table = engine.tables.fertilizer_products
    history = compare_to_history(schedule, previous_usage, products_table, today, engine.tables, request.crop_type)
    breakdown_lines = cost_breakdown(schedule, products_table)
    cost = Cost(
        estimated_cost_inr_per_acre=estimate_cost(schedule, products_table),
        previous_cost_inr_per_acre=history["previous_cost_inr_per_acre"],
        saving_inr_per_acre=history["saving_inr_per_acre"],
        prices_as_of=prices_as_of(schedule, products_table),
        breakdown=breakdown_lines,
    )

    risk = assess_recommendation(
        request.crop_type, balance, schedule, payload["soil"], payload["weather"], previous_usage,
        engine.rules, engine.tables, today=today,
    )

    insights = soil_history_insights(
        engine.tables, engine.rules, payload["soil"], request.soil_tested_on,
        payload["previous_soil_tests"], today,
    )

    return RecommendResponse(
        recommendation=Recommendation(
            fertilizer_type=primary_product,
            quantity_kg_per_acre=primary_quantity,
            schedule=[ScheduleItem(**item) for item in schedule],
        ),
        risk=Risk(**risk),
        explanation=Explanation(
            top_factors=top_factors,
            nutrient_balance=NutrientBalance(**balance),
            formula=FORMULA,
            # The existing screens already show data_notes, so the history observations ride along
            # there as well as in history_insights (no client change needed to see them).
            data_notes=_data_notes(rule_trace, payload["weather"]["source"])
            + [item["text"] for item in insights]
            + _product_notes(schedule, request, engine.tables, schedule_for)
            + _unpriced_product_notes(schedule, breakdown_lines, products_table),
            history_insights=insights,
            stage_used=stage_used,
        ),
        cost=cost,
        impact={"over_application_reduction_pct": history["over_application_reduction_pct"]},
        model_version=engine.model_version,
    )


def score_planned_risk(request: RiskScoreRequest, engine: Engine, today: date | None = None) -> RiskScoreResponse:
    engine._require_tables()
    today = today or date.today()  # noqa: DTZ011 -- see recommend()'s identical note

    validate_soil(request.soil.model_dump())
    payload = request.model_dump(mode="json")
    balance, _trace = compute_balance(
        request.crop_type,
        request.variety,
        request.irrigation,
        request.growth_stage,
        payload["soil"],
        payload["previous_fertilizer_usage"],
        engine.tables,
        today,
        credit_window_days=engine.rules["credit_window_days"],
        pk_window_days=_pk_window_days(engine, request.crop_type),
        rules=engine.rules,
    )
    result = score_planned(
        payload["planned_application"],
        balance,
        payload["soil"],
        payload["weather"],
        payload["previous_fertilizer_usage"],
        engine.rules,
        engine.tables,
    )
    return RiskScoreResponse(
        risk=Risk(**result["risk"]),
        nutrient_balance=AppliedBalance(**result["nutrient_balance"]),
        model_version=engine.model_version,
    )
