# Model card: `rule-imitation-classifier`

A small classifier taught to name the same set of fertilizer products as the rule engine. It replaces the
original `fertilizer-classifier-0.1.1` (see `MODEL_CARD.md`) as the active model. Every number below comes
from the registry entry for this model in `src/models/model_registry/registry.json` (version 0.1.4) and its
run record in `models_artifacts/runs/<run_id>/metrics.json`, except the "end-to-end" figures, which were
measured separately and are described where they appear.

## What it is, in one paragraph

The rule engine turns a soil test, crop, stage and earlier applications into a nutrient balance and then
into a schedule of products. This model is trained to predict **which products are in that schedule**, as one
label such as `urea`, `dap+urea`, `dap+mop+urea`, `ssp+urea` or `none` (nothing to apply), from the crop,
irrigation, growth stage, the soil's N, P and K, and the nitrogen, phosphorus and potassium the farmer
applied recently. It was built because the original classifier, trained on a synthetic dataset, disagreed
with the rule-based plan about as often as it agreed (54.5% agreement on 3,000 realistic requests), which
made the "the classifier's top guess differed" note more noise than signal. **It adds no independent
evidence.** It reproduces the rules, so its agreement score measures imitation, not agronomic correctness,
and the rule engine decides the dose and the product either way.

## Which products it can name

Only the products the rule engine plans: urea (nitrogen), muriate of potash `mop` (potassium), and for
phosphorus DAP `dap` or single superphosphate `ssp`. Single superphosphate is the phosphorus source for
sugarcane and gram, which is how PAU's tables list it. The NPK and NP blends in `fertilizer_products.csv` are never
planned, because PAU's recommendations for these crops are given as urea, DAP or superphosphate, and
potash; a blend would add phosphorus or potassium the soil test did not call for. For wheat and maize the
plan's note offers NP 20-20-0 as an equal alternative (PAU's "nitrophosphate"), but that is a note, not the
planned product, so the classifier does not predict it. The earlier one-product version (urea, DAP, none)
could not show potash or superphosphate at all, because neither is ever the largest product in a plan.

## Intended use

- Show, next to the plan, whether a second model that has learned the rules would name the same products.
  The only visible effect is the note "The product classifier's top guess (X) differed from the rule-based
  plan (Y); the rule-based plan was kept", which appears rarely and so points at an unusual request.
- Stay out of the dose. It never changes a quantity, a date, a risk score or a product.

## Out-of-scope uses

- As evidence that a plan is right. Agreement with the rules says nothing about whether the rules are.
- For any crop, region or product the rule engine does not cover (seven Punjab crops; see
  `data/external/crops.csv`).
- As a stand-in for the rule engine if the reference tables change: it must be retrained (below).

## Training data

Generated, not collected. `src/models/train_imitation.py` draws random requests and asks the rule engine
which products its plan uses ("teacher"):

| | |
|---|---|
| Draws | 12,000, none skipped, none duplicated |
| Crop and irrigation | any combination `reference_doses.csv` covers, chosen uniformly |
| Growth stage | any stage of that crop's season, uniformly |
| Soil | N 80 to 700, P 3 to 60, K 40 to 520 kg/ha (pH, organic carbon, moisture also drawn; the model does not use them) |
| Earlier applications | half the draws have one or two (urea, DAP or MOP, 10 to 80 kg/acre, 3 to 55 days ago) |
| Labels | urea 6,433; none 2,186; dap+urea 2,057; ssp+urea 761; dap+mop+urea 264; ssp 136; mop+urea 134; mop+ssp+urea 14; dap 12; dap+mop 3 |
| Draw anchor date | fixed (2026-10-22), so the data does not depend on the day it is trained |

The sampling is uniform, not drawn from real farms, so the model is accurate on the kinds of requests the
tables cover and says nothing about how often farmers hit each case. Plans with superphosphate come from
sugarcane (when low in phosphorus) and gram, 911 of 12,000.

## Inputs

`rule_imitation_v2` (`src/models/imitation_features.py`): one-hot crop, irrigated (0 or 1), stage order
within the season, the soil's N, P, K, and the N, P2O5 and K2O (kg/ha) in earlier applications still inside
the credit window, as gross amounts with no efficiency or rain logic. Two measurements shaped this:

- The growth stage matters most: with only the original classifier's inputs (crop, weather, N, P, K) the
  best a model reached was 81.6% agreement on the old one-product label.
- Earlier applications matter for the product-set label: enough nitrogen from an earlier application
  removes the urea from the plan, enough phosphorus removes the DAP. A forest that could not see them
  agreed with the plan on about 96.2% of held-out requests; with them as inputs it agrees on 99.3%. pH,
  organic carbon, moisture and weather are not inputs: they move no dose.

## Evaluation protocol

- The 20% held-out part (2,400 requests) is split off, stratified and seeded, **before** any fitting.
- Cross-validation runs on the 9,600 training requests only. It uses 2 folds, not 5, because the rarest
  label has only 2 members in the training part and a stratified split cannot have more folds than that.
- The model is fitted once, with no hyperparameter search, and the held-out part is evaluated once.
- The interval is a 1,000-draw bootstrap over the held-out requests.

## Metrics

| Held-out agreement with the rule engine | |
|---|---|
| Agreement | **99.3%** (95% CI 99.0 to 99.6) |
| Macro F1 | 0.789 (see the note below) |
| Cross-validated (training part, 2 folds) | 99.2% (+/- 0.1) |
| Baseline: always predict the commonest label (urea) | 53.6% |
| End-to-end: fresh 500 requests through the full recommendation | 99.0% (5 differences, seed 99) and 99.8% (1 difference, seed 2024) |

| Label | Precision | Recall | Held-out count |
|---|---|---|---|
| urea | 0.995 | 0.997 | 1,287 |
| none (nothing to apply) | 1.000 | 0.993 | 437 |
| dap+urea | 0.990 | 0.993 | 411 |
| ssp+urea | 0.968 | 1.000 | 152 |
| dap+mop+urea | 0.980 | 0.943 | 53 |
| ssp | 1.000 | 0.963 | 27 |
| mop+urea | 0.964 | 1.000 | 27 |
| mop+ssp+urea | 1.000 | 1.000 | 3 |
| dap | 0.000 | 0.000 | 2 |
| dap+mop | 0.000 | 0.000 | 1 |

**Macro F1 is pulled down by tiny classes.** It averages the ten labels equally, and `dap` and `dap+mop`
have two and one held-out examples, all missed; those two labels alone cost about 0.2. The always-urea
baseline scores 53.6% here because urea alone is only about half of the plans, unlike the one-product label
where it was 73.8%.

By crop: wheat 100%, maize 100%, sugarcane 100%, cotton 99.7%, barley 99.1%, rice 98.4%, chickpea 97.9%.

## Limitations and failure modes

- **Agreement is not correctness.** If a rule or a table value is wrong, this model learns the error. That
  includes the values marked "team assumption" in `agronomy_rules.yaml`.
- **Misses are at the edges of a rule.** The held-out errors are in the rare labels, such as `dap` alone
  (urea just not needed) predicted as `dap+urea`.
- It does not see weather, rainfall or the rain-reduced nitrogen credit, so a request where recent rain
  decides whether urea is needed can differ. It sees earlier applications only as amounts inside the credit
  window, not their age.
- Superphosphate and the potash combinations are rare in the training data (see the label counts), so its
  agreement there rests on few examples.
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
| Code | `git_sha` in the registry entry: the commit the model was trained at |
| Environment | Python 3.11, scikit-learn 1.9, pandas 3.0, numpy 2.4 (full list in the run record) |
| Cost | about 10 seconds on a laptop; the Docker image runs it on every build |
| Artifact | `models_artifacts/rule-imitation-classifier-<version>.joblib`, git-ignored; the registry entry is committed |

## Ownership and retraining

Saloni owns it (`ml/src/models`). Retrain whenever the reference tables, the rules or the engine's
product logic change. The Docker image does this on every build, so a deployed service is always in step
with its own rules; a local checkout runs the command above. `tests/test_imitation.py` checks that the
fast teacher names the same products as the full recommendation, that training is reproducible and
leak-free, that the engine disagrees with the trained model rarely (limit 4%, measured 1 to 2%), and that
an unknown model type cannot break a recommendation.
