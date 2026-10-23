# Model card: `rule-imitation-classifier`

A small classifier taught to pick the same main product as the rule engine. It replaces the original
`fertilizer-classifier-0.1.1` (see `MODEL_CARD.md`) as the active model. Every number below comes from
the registry entry for this model in `src/models/model_registry/registry.json` and its run record in
`models_artifacts/runs/<run_id>/metrics.json`, except the two figures marked "end-to-end", which were
measured separately and are described where they appear.

## What it is, in one paragraph

The rule engine turns a soil test, crop, stage and earlier applications into a nutrient balance and then
into products; its main product is the one with the largest total in the schedule. This model is trained
to predict that main product from the crop, irrigation, growth stage and the soil's N, P and K. It was
built because the original classifier, trained on a synthetic dataset, disagreed with the rule-based plan
about as often as it agreed (it agreed on 54.5% of 3,000 realistic requests), which made the "the
classifier's top guess differed" note more noise than signal. **It adds no independent evidence.** It
reproduces the rules, so its agreement score measures imitation, not agronomic correctness, and the rule
engine decides the dose and the product either way.

## Intended use

- Show, next to the plan, whether a second model that has learned the rules would pick the same main
  product. The only visible effect is the note "The product classifier's top guess (X) differed from the
  rule-based plan; the rule-based plan was kept", which now appears rarely and so points at an unusual
  request.
- Stay out of the dose. It never changes a quantity, a date, a risk score or the chosen product.

## Out-of-scope uses

- As evidence that a plan is right. Agreement with the rules says nothing about whether the rules are.
- For any crop, region or product the rule engine does not cover (seven Punjab crops; see
  `data/external/crops.csv`).
- As a stand-in for the rule engine if the reference tables change: it must be retrained (below).

## Training data

Generated, not collected. `src/models/train_imitation.py` draws random requests and asks the rule engine
for its main product ("teacher"):

| | |
|---|---|
| Draws | 12,000, none skipped, none duplicated |
| Crop and irrigation | any combination `reference_doses.csv` covers, chosen uniformly |
| Growth stage | any stage of that crop's season, uniformly |
| Soil | N 80 to 700, P 3 to 60, K 40 to 520 kg/ha (pH, organic carbon, moisture also drawn; the model does not use them) |
| Earlier applications | half the draws have one or two (urea, DAP or MOP, 10 to 80 kg/acre, 3 to 55 days ago); the model does not see them |
| Labels | urea 8,850, none 2,186, dap 964 |
| Draw anchor date | fixed (2026-10-22), so the data does not depend on the day it is trained |

The sampling is uniform, not drawn from real farms, so the model is accurate on the kinds of requests the
tables cover and says nothing about how often farmers hit each case.

## Inputs

`rule_imitation_v1` (`src/models/imitation_features.py`): one-hot crop, irrigated (0 or 1), stage order
within the season, and the soil's N, P, K. The growth stage is the part that matters: with only the
original classifier's inputs (crop, weather, N, P, K) the best a model reached was 81.6% agreement,
against 98.4% with the stage added (99.1% before the soil-rating bands were added to the rules).
Adding pH, organic carbon, irrigation and earlier applications on top did not move it.

## Evaluation protocol

- The 20% held-out part (2,400 requests) is split off, stratified and seeded, **before** any fitting.
- Cross-validation (5 folds) runs on the 9,600 training requests only.
- The model is fitted once, with no hyperparameter search, and the held-out part is evaluated once.
- The interval is a 1,000-draw bootstrap over the held-out requests.

## Metrics

| Held-out agreement with the rule engine | |
|---|---|
| Agreement | **98.4%** (95% CI 97.9 to 98.9) |
| Macro F1 | 0.962 |
| Cross-validated (training part) | 98.5% (+/- 0.2 across 5 folds) |
| Baseline: always predict urea | 73.8% |
| Original classifier on a different, comparable sample (3,000 requests) | 54.5% |
| End-to-end: fresh 500 requests through the full recommendation, new seed | 99.0% (5 differences) |

| Product | Precision | Recall | Held-out count |
|---|---|---|---|
| urea | 0.988 | 0.993 | 1,770 |
| none (no fertilizer needed) | 1.000 | 0.991 | 437 |
| dap | 0.910 | 0.891 | 193 |

Confusion (rows are the rule engine): of 193 DAP cases, 172 were predicted DAP and 21 urea; of 437 "none",
433 were predicted "none" and 4 DAP; of 1,770 urea cases, 1,757 were predicted urea and 13 DAP.

By crop: cotton, rice, sugarcane 100%; maize 98.5%; wheat 98.9%; barley 96.1%; **chickpea 95.5%** (the
lowest).

## Limitations and failure modes

- **Agreement is not correctness.** If a rule or a table value is wrong, this model learns the error. That
  includes the values marked "team assumption" in `agronomy_rules.yaml`.
- **The misses cluster at the first stage**, where the rules sit on the line between a phosphorus product
  (DAP) and urea, and between "no fertilizer needed" and DAP. DAP recall is 89%. The soil-rating bands
  (`soil_rating_fallback` in `agronomy_rules.yaml`) put more of those lines inside the sampled range, which is why agreement fell from 99.1% to 98.4%.
- It does not see weather, rainfall or earlier applications, so a request where those decide the main
  product can differ. In the end-to-end check 5 of 500 requests differed (all at the first stage); I did
  not isolate whether those inputs were the cause.
- It is accurate only for the rules it was trained on. Any change to `data/external/` or to the engine
  changes the rules hash, and the model must be retrained (see below). The engine enforces this: at load
  it compares the model's recorded `rules_hash` with the current one, leaves a mismatched model out and
  reports `degraded` on `/health` with the retrain command. Plans are unaffected.
- The note it produces is no longer an independent check, so a reader should not treat "the classifier
  agreed" as a second opinion.

## Fairness and regional caveats

None of the model's inputs describe a person. Its coverage is the seven Punjab crops and the Punjab
tables in the repository, with the limits those carry (see `MODEL_CARD.md`, "Fairness and regional
caveats").

## Reproducibility block

| | |
|---|---|
| Command | `python -m src.models.train_imitation --config configs/imitation.yaml` |
| Seed | 42 (data draw, split, forest, bootstrap) |
| Config | `configs/imitation.yaml` (hash in the registry entry) |
| Data | regenerated from the seed; its hash is in the registry entry, and the same seed gives the same hash |
| Rules | `rules_hash` in the registry entry: a hash of every file in `data/external/` |
| Environment | Python 3.11, scikit-learn 1.9, pandas 3.0, numpy 2.4 (full list in the run record) |
| Cost | about 5 seconds on a laptop; the Docker image runs it on every build |
| Artifact | `models_artifacts/rule-imitation-classifier-<version>.joblib`, git-ignored; the registry entry is committed |

## Ownership and retraining

Saloni owns it (`ml/src/models`). Retrain whenever the reference tables, the rules or the engine's
product logic change. The Docker image does this on every build, so a deployed service is always in step
with its own rules; a local checkout runs the command above. `tests/test_imitation.py` checks that the
fast teacher picks the same product as the full recommendation, that training is reproducible and
leak-free, and that an unknown model type cannot break a recommendation.
