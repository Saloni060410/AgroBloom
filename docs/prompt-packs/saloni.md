# Saloni — KhetGPT Prompt Pack

**Role:** AI/ML core: models and serving  
**Branch:** `feature/saloni-ml-core`  
**Repo:** https://github.com/Saloni060410/AgroBloom.git

Smart India Hackathon, PSAI01: Sustainable Fertilizer Usage Optimizer. This pack is generated from one shared plan, so the four packs always agree on steps, contracts and integration points.

## 1. Your role

You turn Richa's reference tables and data into a recommendation: the nutrient dose for the field, the fertilizer products, a dated split schedule, cost and saving. You serve it through a stable /recommend API.

Your core is a transparent soil-test-based dose: fertilizer needed = standard dose for the crop + soil-test adjustment - credit from recent applications. The standard dose and the adjustment are published numbers Richa sources, or an STCR equation where one exists. A trained model refines the product choice on top. Everything is versioned, seeded and explainable, and the contract with Josh is the one thing you must never let drift. Risk scoring is Richa's module, which your engine calls.

**You own**

- `ml/src/api/` (main.py, schemas.py, endpoints/)
- `ml/src/engine/` (npk_calculator.py, recommendation_engine.py, cost.py)
- `ml/src/models/` (train.py, fertilizer_model.py, model_registry/)
- `ml/Dockerfile, ml/configs/, ml/tests/ for your modules`
- `ml/MODEL_CARD.md`

**Hands off (owned by someone else)**

- `ml/data/**, ml/src/data_pipeline/, ml/src/weather/, ml/src/degradation/, ml/src/evaluation/` (Richa)
- `backend/** and docker-compose.yml` (Josh)
- `frontend/**` (Darsh)

## 2. Initialize your system

**1. Check your machine**

```bash
python3 --version   # 3.11 or newer
git --version
docker --version    # needed later for compose (S9, S11)
```

Expected: Python 3.11+. Docker only becomes necessary at Phase 4.

**2. Clone and switch to your branch**

```bash
git clone https://github.com/Saloni060410/AgroBloom.git
cd AgroBloom
git checkout feature/saloni-ml-core
git pull origin main --rebase
```

Expected: Branch feature/saloni-ml-core, rebased on the latest main. If you already cloned, skip the first two lines.

**3. Create the ML environment**

```bash
cd ml
python3.11 -m venv .venv
source .venv/bin/activate      # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

Expected: All pinned packages install (fastapi, xgboost, scikit-learn, pandas, pydantic).

**4. Verify the scaffold**

```bash
pytest -q
ruff check .
uvicorn src.api.main:app --reload --port 8001
# second terminal:
curl localhost:8001/health
```

Expected: 2 tests pass, ruff clean, /health returns {"status":"ok","model_version":"unloaded"}.

**5. Open Claude Code**

```bash
cd ..            # repo root
claude
```

Expected: Run every prompt below from the repo root. Each prompt tells Claude which folders it may touch.

## 3. Features you implement

| PRD reference | Feature | Steps |
|---|---|---|
| FR7 / Must-have 4, 5 | Fertilizer type and quantity from the standard dose plus soil-test adjustment, with a dated split schedule | S3, S4, S6 |
| FR8 / Must-have 6 | Risk warning: your engine calls Richa's risk analyzer and returns it with the plan | S6 |
| FR10 / Should-have 8 | Estimated cost and saving vs the farmer's logged previous usage | S5, S6 |
| Should-have 10 / NFR7 | Dose inputs (standard dose, soil adjustment, credit, method) and top factors in every response | S4, S6 |
| FR12 / Should-have 12 | POST /risk-score for a farmer's own planned dose | S6 |
| NFR1 | ML call under 3 s (p95) | S6, S11 |
| NFR3 | Versioned model and rule tables so results are auditable | S3, S6, S10 |
| Standards | Seeds, baselines, confidence intervals, one-time test split, model card | S3, S8, S10 |

## 4. Who you depend on, and who depends on you

Hard need = you cannot finish the step without it. Integrates with = you can start on a mock or fixture, but the step is only complete once the other person's work is merged and you have tested against it. Pairs with = you finish it together.

| Step | Blocked by (hard) | Pairs with | Integrates with | Unblocks | Gate |
|---|---|---|---|---|---|
| **S0** Verify your ML environment | none | none | none | none |  |
| **S1** Review and lock the ML contract | none | J1 | none | S2, S4 | G0 |
| **S2** Mock mode and reference endpoints | S1 | none | R1 | J4, J6, D4 | G1 |
| **S3** Product classifier: training harness, baselines and first model | R4, R6 | none | R5, R9 | S6, R12, R9 | G2 |
| **S4** NPK dose calculator | R3, S1 | none | R6, R10 | S5, S6, R8, R10 | G2 |
| **S5** Cost and saving estimate | S4, R3 | none | none | S6 | G3 |
| **S6** Recommendation engine and real API mode | S3, S4, S5, R6, R8, R10 | none | J8, J9 | S7, S8, S9, J8, J9, R8, R11, D7, D8 | G3 |
| **S7** API hardening and contract tests | S6 | none | J8 | none | G3 |
| **S8** Formula sanity gate and final test evaluation | S6, R9 | none | R11 | S10, S12, R12 | G4 |
| **S9** Package the ML service for compose | S6 | J10 | none | S11, J10 | G4 |
| **S10** Model card | S8, R12 | none | none | none | G5 |
| **S11** Demo readiness for the ML service | S9, J10 | none | R11 | none | G5 |
| **S12** Stretch: learned quantity refinement against the formula | S8 | none | none | none |  |

## 5. Team timeline and integration gates

- **Phase 0: Kickoff and contracts.** Everyone sets up, and the shared contracts are agreed and merged before anyone builds against them.
- **Phase 1: Foundations in parallel.** Each person builds their base layer against contracts and fixtures. Nobody waits for anybody.
- **Phase 2: Real data and real CRUD.** Real datasets and tables land, the model trains, the API stores real farm data, forms save it.
- **Phase 3: Real recommendation.** Mock mode is switched off. Data, model, backend and UI produce one real recommendation.
- **Phase 4: Packaging and standout.** One-command stack, CI green, the 3D feature, Hindi toggle, evaluation evidence.
- **Phase 5: Demo hardening.** Rehearse, freeze, write the model card, prepare fallbacks.

### G0 — Contracts locked (end of Phase 0)

C1 (ML API), C3 (backend REST API), the fixtures and the crop vocabulary are merged to main. Nobody changes them without the change process.

**Your steps at this gate:** S1 (Review and lock the ML contract)

**Who delivers what**

- Saloni + Josh: review and lock docs/api-contract.md and docs/contract-fixtures/ (S1, J1)
- Josh + Darsh: docs/backend-api.md merged (J1)
- Richa: crops, varieties, stages and header-only reference tables merged (R1)
- Everyone: dev environment running on their own branch (S0, R0, J0, D0)

**Acceptance test:** Every teammate can read the fixtures and say what each endpoint returns. Josh, Saloni and Darsh have approved the contract PRs.

**If it slips:** Do not start Phase 1 code that depends on an unmerged contract. Build only environment and non-contract work until it merges.

### G1 — Mock vertical slice (end of Phase 1)

One request travels the whole chain with fake numbers: frontend, backend, database and the ML service in mock mode.

**Your steps at this gate:** S2 (Mock mode and reference endpoints)

**Who delivers what**

- Saloni: ML mock mode plus reference endpoints on main (S2)
- Josh: seeded database, real auth and the thin recommendation route (J2, J3, J4)
- Darsh: shell, auth pages and a first recommendation screen (D2, D3, D4)
- Richa: datasets chosen, reference tables v0, cleaning pipeline (R2, R3, R4)

**Acceptance test:** Log in as the seeded farmer, open the seeded field, press Get recommendation, see a mocked plan on screen, and find the stored row in Postgres.

**If it slips:** Darsh runs with VITE_USE_MOCK=true. Josh stubs the ML call with the fixture. Neither blocks on the other.

### G2 — Data to engine handoff (end of Phase 2)

Richa's tables and feature module feed Saloni's dose engine and trainer, and the app stores real farm data.

**Your steps at this gate:** S3 (Product classifier: training harness, baselines and first model), S4 (NPK dose calculator)

**Who delivers what**

- Richa: feature module, dataset build, frozen test split, weather client and seasonal fallback on main (R6, R7)
- Saloni: first trained model v0.1.0 (S3) and a passing NPK dose calculator on Richa's tables (S4)
- Josh: CRUD, reference proxy, weather and geocoding on main (J5, J6, J7)
- Darsh: farm, field, soil, crop and fertilizer log screens saving real data (D5, D6)

**Acceptance test:** python -m src.models.train runs from a clean checkout and prints a comparison table. The engine's golden tests pass on the reference tables. Darsh creates a farm, field and soil test in the UI and Josh's database holds them.

**If it slips:** Saloni trains on sample_train.csv. Engine tests use the v0 tables. The UI keeps using the mock for anything unmerged.

### G3 — Real end to end (end of Phase 3)

Mock mode is off. A real engine, real weather and real stored data produce the recommendation the user sees, with the risk warning and the formula inputs.

**Your steps at this gate:** S5 (Cost and saving estimate), S6 (Recommendation engine and real API mode), S7 (API hardening and contract tests)

**Who delivers what**

- Saloni: cost, recommendation engine in real mode, contract tests (S5, S6, S7)
- Richa: risk analyzer, metrics, explanations, demo scenarios (R8, R9, R10, R11)
- Josh: full recommendation orchestration and history, risk check and trends (J8, J9)
- Darsh: full recommendation screen, schedule page, history and trends (D7, D8, D9)

**Acceptance test:** Signup, farm, field, soil test, crop and stage, Get recommendation. The result shows a real model_version, a dated schedule, the risk with its soil and yield impact, cost and the dose numbers. History and the schedule page show it afterwards.

**If it slips:** Ship G3 with mock mode and label it in the UI as sample output. Do not hide that it is a mock.

### G4 — One-command stack (end of Phase 4)

docker compose up brings up Postgres, ML and backend healthy from a clean clone. CI is green. The standout UI features work on the real stack.

**Your steps at this gate:** S8 (Formula sanity gate and final test evaluation), S9 (Package the ML service for compose)

**Who delivers what**

- Josh: compose and CI (J10), hardening (J11)
- Saloni: ML image, artifact strategy, formula sanity gate, final test evaluation (S8, S9)
- Richa: evaluation report with impact estimate (R12)
- Darsh: what-if dose check, 3D visualization, language toggle, landing (D10, D11, D12, D13)

**Acceptance test:** A teammate who has never run the project clones it, follows the README and reaches a working recommendation in under 15 minutes.

**If it slips:** Frontend runs from npm run dev against the compose stack. Ship the standout feature only if it meets the performance contract.

### G5 — Demo freeze (end of Phase 5)

Rehearsed on two machines. Fallbacks work. Model card and evaluation report are written. main is tagged.

**Your steps at this gate:** S10 (Model card), S11 (Demo readiness for the ML service)

**Who delivers what**

- Saloni: model card and demo readiness (S10, S11)
- Josh: demo seed and reset (J12)
- Darsh: launch pass and offline fallback build (D14)
- Richa: reproducible data commands and docs (R13)

**Acceptance test:** Full demo run on two laptops, once with internet and once with mock fallbacks. The three demo scenarios behave as documented in docs/demo-scenarios.md.

**If it slips:** Cut features, never the rehearsal. Anything unfinished is removed from the demo path, not left half-working.

## 6. Contracts you share with the team

| # | Contract | Where | Owners | Locks at |
|---|---|---|---|---|
| C1 | ML API: POST /recommend, POST /risk-score and GET /health between the backend and the ML service. Code sides: ml/src/api/schemas.py and backend/src/services/mlService.js. A pre-filled v1.0 draft is already in the repo. S1 and J1 review and lock it. | `docs/api-contract.md, docs/contract-fixtures/` | Saloni, Josh | G0 |
| C2 | Reference data API: Crops, varieties, growth stages, soil rating cut-offs, fertilizer products and the seasonal-weather fallback. Richa authors the files, Saloni serves them, Josh proxies them, Darsh reads them. Nothing is hardcoded in the UI or the backend. | `ml/data/external/*, ML /reference/*, backend /api/reference/*` | Richa, Saloni, Josh, Darsh | G0 (shape), G2 (real data) |
| C3 | Backend REST API: Every endpoint the frontend calls: auth, farms, fields, soil tests, fertilizer logs, weather, geocoding, recommendations, risk check, trends, reference. | `docs/backend-api.md` | Josh, Darsh | G0 |
| C4 | Feature module and loaders: The single feature code path used by training and serving, and the loader that reads the reference tables once. | `ml/src/data_pipeline/feature_engineering.py, soil_data_loader.py` | Richa, Saloni | G2 |
| C5 | Reference table schemas: Reference doses, soil adjustments, optional STCR equations, use efficiencies, split schedules, fertilizer products and prices, soil rating cut-offs, agronomy rules, seasonal weather. Column schemas are agreed in R1, values arrive in R3. A crop is ready only when every required cell for it is filled. The engine returns a clear error for a crop that is not ready, and /reference/crops lists only ready crops. | `ml/data/external/` | Richa, Saloni | G0 (schemas), G1 (v0 values) |
| C6 | Rule trace, risk and explanations: Saloni's engine emits a nutrient balance and a rule trace. Richa's risk analyzer and explain() turn them into a risk level, soil and yield impact text and reasons. | `ml/src/degradation/risk_analyzer.py, ml/src/evaluation/explainability.py` | Saloni, Richa | G2 |
| C7 | Evaluation and run records: Richa's metric functions, Saloni's run record format. Both feed the model card. | `ml/src/evaluation/metrics.py, models_artifacts/runs/` | Richa, Saloni | G3 |

**C1 decisions (pre-filled in docs/api-contract.md)**

1. Soil schema is fixed by the problem statement: n, p, k, ph, organic_carbon, moisture. It is not extended.
2. Request adds optional variety (only if Richa's data has varieties) and optional sowing_date. The backend stores them as Field.cropVariety and Field.sowingDate. They are already in the Prisma schema.
3. Endpoints: POST /recommend, POST /risk-score (score a planned dose), GET /health, GET /reference/*.
4. Core method: fertilizer needed = standard dose for the crop + soil-test adjustment - credit for recent applications. The standard dose is the published dose for the crop, the adjustment comes from published soil-test rules or an STCR equation (a x target yield - b x soil test) where one exists. The response returns the inputs per nutrient in explanation.nutrient_balance, with the method used.
5. Each schedule[] item carries fertilizer_type. Top-level fertilizer_type is the primary product and its quantity_kg_per_acre is that product's total across the schedule.
6. risk has level, reason, soil_health_impact and yield_impact. The impact texts state the consequence in plain language, as the problem statement asks.
7. weather.source is live, cached or seasonal_average. The backend sends it, the ML service echoes what it used.
8. cost and impact fields are null when the farmer logged no previous usage. Never invent a baseline.
9. Units: kg/acre in the API, soil N, P, K in kg/ha, organic_carbon and moisture in percent. Internal conversion 1 ha = 2.4711 acre.
10. Errors: 422 { detail: [...] } for invalid input, 503 { detail } when the model or reference data is unavailable.
11. model_version format: <model>-<semver>+rules-<hash8>.

**C3 Recommendation object and errors**

```text
Recommendation {
  id, fieldId, soilTestId, cropType, cropVariety | null, growthStage,
  fertilizerType, quantityKgPerAcre,
  schedule: [{ stage, fertilizerType, quantityKgPerAcre, applyBy }],
  risk: { level: "low" | "medium" | "high", reason, soilHealthImpact, yieldImpact, overApplicationPct | null },
  topFactors: [string],
  nutrientBalance: { n|p|k: { method: "reference_dose" | "stcr", soilRating, standardDoseKgHa, soilAdjustmentKgHa, priorCreditKgHa, fertilizerNeededKgHa } },
  formula: string,
  cost: { estimatedCostPerAcre, previousCostPerAcre | null, savingPerAcre | null, savingTotal | null },
  impact: { overApplicationReductionPct | null },
  weatherSource: "live" | "cached" | "seasonal_average", weatherStale: boolean,
  modelVersion, createdAt
}
Errors: { error: string, details?: [] }. Codes: 400 validation, 401, 403, 404 (also for other users' resources), 409 missing prerequisite, 502 ML unavailable, 503 weather unavailable.
```

**C4 Feature module and loaders**

```text
FEATURE_COLUMNS: list[str]            # classifier inputs, fixed order
CLASSIFIER_TARGET = "fertilizer_product_id"
request_to_record(req: dict) -> dict            # /recommend request -> one flat record
build_features(records) -> pd.DataFrame          # same code for training and serving
rule_inputs(req: dict) -> dict                    # soil ratings, prior-usage credit inputs, rain flags
load_training_frame(split: "train"|"val"|"test") -> pd.DataFrame
soil_data_loader.load_reference_tables() -> Tables   # reads ml/data/external once
soil_data_loader.validate_soil(soil: dict) -> dict   # bounds check on the fixed six soil fields
```

**C5 Reference table schemas**

```text
crops.csv                 crop_id,name_en,name_hi,dataset_label,season,source
crop_varieties.csv        crop_id,variety_id,name_en,name_hi,source   (header only if the data has no varieties)
growth_stages.csv         crop_id,stage_id,name_en,name_hi,order,das_start,das_end,source
reference_doses.csv        crop_id,variety_id,irrigation,region,n_kg_ha,p2o5_kg_ha,k2o_kg_ha,source,notes   (published standard dose; variety_id generic = fallback)
soil_adjustments.csv      crop_id,nutrient,soil_rating,adjustment_kg_ha,source,notes   (signed, from published soil-test rules)
stcr_equations.csv        crop_id,variety_id,region,applies_to,nutrient,a,b,target_yield_default_q_ha,source,notes   (optional: needed = a x target yield - b x soil test)
nutrient_efficiency.csv   crop_id,nutrient,fertilizer_use_efficiency,source,notes   (crop_id default = fallback; used only to credit recent applications)
split_schedule.csv        crop_id,stage_id,n_fraction,p_fraction,k_fraction   (fractions sum to 1 per crop)
fertilizer_products.csv   product_id,name,dataset_label,n_pct,p2o5_pct,k2o_pct,price_inr_per_kg,price_date,source   (the engine only selects priced products)
soil_test_ratings.csv     parameter,unit,very_low_below,low_below,high_above,source   (very_low_below optional)
seasonal_weather.csv      region_key,month,temperature_c,humidity_pct,rainfall_mm_5day,source
agronomy_rules.yaml       credit window days, rain_hold_mm / rain_hold_days, over_application_ratio_medium / _high,
                          under_application_ratio, formula tolerance. Every key has a source comment.
explanation_templates.yaml  template id -> en and hi sentence (rule sentences, risk reasons, soil and yield impacts)
```

**C6 Engine output, risk analyzer and explain()**

```text
# Saloni's engine returns:
nutrient_balance: { n|p|k: { method, soil_rating, standard_dose_kg_ha, soil_adjustment_kg_ha, prior_credit_kg_ha, fertilizer_needed_kg_ha } }   # P as P2O5, K as K2O
rule_trace item: { rule_id, nutrient: "n"|"p"|"k"|null, value, threshold, effect, params: {} }

# Richa's modules:
risk_analyzer.assess_recommendation(nutrient_balance, schedule, soil, weather, prior_usage, rules) -> Risk
risk_analyzer.score_planned(planned_application, nutrient_balance, soil, weather, prior_usage, rules) -> { risk, nutrient_balance }
   Risk = { level: "low"|"medium"|"high", reason, soil_health_impact, yield_impact, over_application_pct | None }
explain(features: dict, prediction: dict, rule_trace: list[dict], top_k: int = 3) -> list[str]
render_template(template_id: str, **params) -> str      # explanation_templates.yaml, en + hi
```

**C7 Evaluation functions and run record**

```text
evaluate_classifier(y_true, y_pred, y_proba=None, classes=None, groups=None, n_boot=1000, seed=42) -> dict
cv_summary(fold_scores: list[dict]) -> dict              # mean and std per metric
baseline_report(y_train, y_test) -> dict
formula_conformity(recs, tables, tol) -> dict            # share whose fertilizer_needed matches an independent recomputation of the dose formula, plus violators
per_slice(y_true, y_pred, slice_col) -> dict
run record (Saloni): { run_id, name, tags, git_sha, config_hash, dataset_hash, env, params, metrics, wall_clock_s }
```

**How to change a contract**

1. Propose the change in a docs-only PR to main titled docs: <contract> <change>.
2. Both owners of the contract approve it in the PR.
3. Merge to main, then both owners run git pull origin main --rebase on their branches the same day.
4. Update code, schemas and fixtures immediately. The contract tests fail if code and docs drift.

## 7. Step-by-step prompts

Run each prompt in Claude Code from the repo root, on your own branch, in order. Check the Done when line before you move on.

### Phase 0: Kickoff and contracts

#### S0. Verify your ML environment

**Done when:** pytest shows 5 passed, ruff is clean and curl /health returns ok.

````text
Read AGENTS.md (root) and ml/AGENTS.md. I am Saloni, owner of ml/src/models and ml/src/api on branch feature/saloni-ml-core. Work only inside ml/.

1. Confirm the current branch is feature/saloni-ml-core and that it is rebased on origin/main.
2. In ml/, activate .venv (Python 3.11), run pip install -r requirements.txt, pytest -q and ruff check .
3. Start uvicorn src.api.main:app --reload --port 8001, then curl GET /health, then POST /recommend and POST /risk-score with an empty JSON body (422 is expected).
4. Report anything that fails. Fix only environment problems, do not change application code.

Show me the outputs.
````

#### S1. Review and lock the ML contract

**Integration gate G0** · Pairs with J1 · Unblocks S2, S4

**Done when:** Josh has approved, the docs-only PR is merged to main, and you have read the fixtures and can explain every field.

> A complete v1.0 draft is already in the repo (docs/api-contract.md and docs/contract-fixtures/, plus matching ml/src/api/schemas.py). Your job is to review it critically, change what is wrong, and lock it. Do not treat it as final.

````text
Read docs/api-contract.md, docs/contract-fixtures/*.json, ml/src/api/schemas.py, docs/PRD.md sections 4 and 9, and ml/AGENTS.md. Josh (backend) and I must lock the backend-to-ML contract before either of us writes more code. A v1.0 draft is already in the repo. Review it as if you were going to build the engine against it.

Check and report:
1. Does every field in the fixtures map to a value the engine can really produce (nutrient_balance per nutrient with method, standard dose, soil adjustment, credit and fertilizer needed; schedule items with fertilizer_type; cost with nulls when there is no history; risk with soil_health_impact and yield_impact)?
2. Is the dose formula in docs/api-contract.md implementable with the tables Richa delivers (reference_doses, soil_adjustments, optional stcr_equations, nutrient_efficiency, split_schedule, fertilizer_products)? Which inputs are missing, and what should the engine do for a crop that is not fully sourced?
3. Are units unambiguous (kg/ha for soil, kg/acre for products, P as P2O5, K as K2O in nutrient_balance)?
4. The soil schema (n, p, k, ph, organic_carbon, moisture) must stay exactly as it is. Confirm nothing in the draft changes it.
5. Anything Darsh would need on screen that the response does not carry?

Make the changes you agree on on a docs-only branch off main called docs/contract-v1 (docs/api-contract.md, docs/contract-fixtures/, and ml/src/api/schemas.py plus ml/tests/test_api.py so the tests still pass). Keep the "How to change this contract" section. Do not touch backend/ or frontend/. Show me the diff, run pytest, and open a PR to main. I will ask Josh to review.
````

### Phase 1: Foundations in parallel

#### S2. Mock mode and reference endpoints

**Integration gate G1** · Needs S1 · Integrates with R1 · Unblocks J4, J6, D4

**Done when:** Josh's backend can call POST /recommend, POST /risk-score and GET /reference/crops on port 8001 and get contract-shaped answers. PR merged to main.

> Merge this to main quickly. Josh (J4, J6) and Darsh (D4) are waiting on it.

````text
Read docs/api-contract.md (v1.0) and docs/contract-fixtures/. The schemas in ml/src/api/schemas.py already follow the contract and /recommend and /risk-score currently return 501. In ml/, implement:

1. src/api/config.py: pydantic-settings Settings with PREDICT_MODE ("mock" or "real", default "mock" until the real engine exists), MODEL_ARTIFACT_DIR and DATA_EXTERNAL_DIR (default data/external). Add them to ml/.env.example.
2. Mock mode for POST /recommend: return a deterministic response built from docs/contract-fixtures/recommend_response.json that reflects the request's crop_type, variety, growth_stage and sowing_date (shift the dates), and scales the quantities with soil N so the frontend sees output change when inputs change. Mock responses carry model_version "mock-0.0.0+rules-mock". Real mode keeps returning 501 for now.
3. Mock mode for POST /risk-score: return a response from docs/contract-fixtures/risk_score_response.json whose level rises with the planned quantity.
4. src/api/endpoints/reference.py: GET /reference/crops (with varieties and stages), /reference/soil-ratings, /reference/fertilizers and /reference/seasonal-weather?lat=&lng=&month=, reading the tables in DATA_EXTERNAL_DIR (schemas in contract C5). If a file is missing return 503 { detail }. While Richa's files are not merged, mock mode serves small built-in JSON from src/api/mock_data/ so Josh and Darsh can integrate. The mock crop list may include one crop with two varieties and one without, so the UI can test both cases.
5. tests/: every fixture still validates, mock endpoints return 200 and validate against the response schemas, reference endpoints return 200 in mock mode and 503 when files are missing in real mode, and the fixed six soil fields are unchanged.

Run pytest and ruff, start uvicorn on 8001, and show me curl output for /health, POST /recommend and POST /risk-score with the fixtures, and GET /reference/crops.
````

### Phase 2: Real data and real CRUD

#### S3. Product classifier: training harness, baselines and first model

**Integration gate G2** · Needs R4, R6 · Integrates with R5, R9 · Unblocks S6, R12, R9

**Done when:** python -m src.models.train prints a fold-by-fold comparison table with mean and std, and registry.json has model v0.1.0 with the dataset hash.

> The classifier only refines which product is chosen. Quantity comes from the dose calculator (S4). The public fertilizer datasets are small, so expect noisy scores and report them with the spread. If the model does not beat the baseline by more than the fold noise, say so plainly.

````text
Read ml/AGENTS.md, docs/data-dictionary.md and ml/data/EDA_FINDINGS.md. If you have them, load the skills model-experiment-tracker, hyperparameter-search-designer and model-evaluation-suite. Richa's modules are the inputs: src/data_pipeline/feature_engineering.py (contract C4: FEATURE_COLUMNS, CLASSIFIER_TARGET, load_training_frame) and src/evaluation/metrics.py (C7). If they are not merged yet, use ml/data/processed/sample_train.csv and write your trainer against the C4 signatures. Never write into Richa's folders.

Implement in ml/src/models/ (the module that wraps the trained classifier is fertilizer_model.py):
1. configs/train.yaml (seed, folds, xgboost and logistic regression params) and a central seed_everything(seed) covering random, numpy and PYTHONHASHSEED. Pass random_state to every estimator and splitter.
2. train.py and fertilizer_model.py, run as python -m src.models.train --config configs/train.yaml:
   - load train and val frames via load_training_frame, never the test split,
   - train baselines (majority class, stratified dummy, logistic regression) and XGBoost inside an sklearn Pipeline so nothing is fit outside a fold,
   - cross-validate (StratifiedGroupKFold if a group column exists, else StratifiedKFold) and report macro-F1, balanced accuracy, MCC and accuracy as mean and std per model,
   - print the comparison table and a leakage smell test (warn if any model is above 0.98 macro-F1 or one feature holds more than 60 percent of importance),
   - save the best model with joblib to models_artifacts/<name>-<semver>.joblib, append an entry to src/models/model_registry/registry.json (version, metrics, dataset hash, config hash, git sha, date) and never overwrite an existing version,
   - write a run record to models_artifacts/runs/<run_id>/ (config, metrics, env versions, wall clock).
3. A --final-test flag that evaluates on the test split once and refuses to run twice for the same version.

Run it on the current data. Show me the comparison table and the registry entry, and tell me whether the model beats the baseline by more than the fold noise.
````

#### S4. NPK dose calculator

**Integration gate G2** · Needs R3, S1 · Integrates with R6, R10 · Unblocks S5, S6, R8, R10

**Done when:** tests/test_npk_calculator.py golden tests pass and one full wheat plan prints as JSON with nutrient_balance and rule_trace.

> This is the explainable heart of the product. The method is fixed by what Richa can source: a published standard dose plus a published soil-test adjustment, or an STCR equation where one exists. No agronomy number may appear in the code. A missing value makes the crop not ready and the engine raises a clear error. It never substitutes 0 or a guess.

````text
Read the C5 reference tables in ml/data/external/ (reference_doses.csv, soil_adjustments.csv, stcr_equations.csv if present, nutrient_efficiency.csv, split_schedule.csv, fertilizer_products.csv, growth_stages.csv, soil_test_ratings.csv, agronomy_rules.yaml), Richa's ml/src/data_pipeline/soil_data_loader.py (load_reference_tables, validate_soil, ready_crops) and ml/AGENTS.md. Implement ml/src/engine/npk_calculator.py as pure functions. Per nutrient (N, P2O5, K2O):

  fertilizer needed = max(0, standard dose + soil adjustment - prior credit)

Method per nutrient, tried in this order:
1. stcr: if stcr_equations.csv has a row for the crop (variety first, then generic) and target_yield_default_q_ha is filled, then standard dose = a x target yield and soil adjustment = -b x the soil test value (kg/ha, the same test method Soil Health Cards use).
2. reference_dose: standard dose from reference_doses.csv for the crop, irrigation type and variety (exact variety first, then variety_id = generic). Soil adjustment from soil_adjustments.csv for that nutrient's soil rating (very_low, low, medium or high from soil_test_ratings.csv). A missing adjustment row means 0, because the source publishes no adjustment.
3. Otherwise raise ReferenceDataIncomplete(crop, nutrient, missing_cells). The API turns it into a 503. A TODO(data) cell counts as missing. Never substitute 0, a default or a guess.
Prior credit: the nutrient in previous_fertilizer_usage inside credit_window_days (agronomy_rules.yaml), converted with fertilizer_products.csv and 1 ha = 2.4711 acre, times fertilizer_use_efficiency from nutrient_efficiency.csv (the crop's row, else the default row). If neither row exists, skip the credit and add a rule_trace entry credit_skipped_no_efficiency.

Functions:
- compute_balance(crop_id, variety, irrigation, growth_stage, soil, prior_usage, tables, today) -> (nutrient_balance, rule_trace). nutrient_balance has, per nutrient, method, soil_rating, standard_dose_kg_ha, soil_adjustment_kg_ha, prior_credit_kg_ha and fertilizer_needed_kg_ha exactly as in contract C1 and C6.
- to_products(nutrient_balance, growth_stage, sowing_date, weather, tables, today) -> list of { stage, fertilizer_type, quantity_kg_per_acre, apply_by }: split by split_schedule.csv for stages not yet passed, date each stage from growth_stages.csv das_start counted from sowing_date (if missing, assume today is the midpoint of the current stage), map nutrients to products (P from DAP first and credit its N, K from MOP, remaining N from urea). Only products that have a price in fertilizer_products.csv are selectable, so cost is never computed with a missing price. If rainfall_mm_forecast is at or above rain_hold_mm, delay top-dress applications by rain_hold_days with a rule_trace entry.
Every decision appends a rule_trace item { rule_id, nutrient, value, threshold, effect, params } exactly as in contract C6 so Richa's explain() can turn it into sentences.

Write golden tests in tests/test_npk_calculator.py with small hand-computed cases: a reference dose of 123.6, 61.8 and 0 with a low-K soil adjustment of +29.7 gives 123.6, 61.8 and 29.7; an STCR case with a=5, b=1, target 40 and soil test 100 gives 100; a negative total clamps to 0; a recent urea application credits N and an old one outside the window does not; a missing efficiency skips the credit with a trace entry; a crop with a TODO in a required cell raises ReferenceDataIncomplete; an unpriced product is never selected; a rain forecast above the threshold delays the top-dress date; kg/acre conversion is right to 3 decimals.

Show me the golden test output and one full plan for the fixture in docs/contract-fixtures/recommend_request.json as JSON, which should be close to docs/contract-fixtures/recommend_response.json.
````

### Phase 3: Real recommendation

#### S5. Cost and saving estimate

**Integration gate G3** · Needs S4, R3 · Unblocks S6

**Done when:** Tests cover no history (nulls), history larger than plan (positive saving), history smaller (negative saving) and unit conversion.

````text
Implement ml/src/engine/cost.py:
estimate_cost(schedule, products_table) -> INR per acre (sum of quantity times price_inr_per_kg)
compare_to_history(schedule, prior_usage, products_table) -> { previous_cost_inr_per_acre, saving_inr_per_acre, over_application_reduction_pct }

Rules:
- previous cost is the cost of what the farmer logged for the same crop season (window from agronomy_rules.yaml), normalised per acre,
- if there is no logged history return nulls. Never invent a baseline,
- over_application_reduction_pct = max(0, (previous nutrient kg minus recommended nutrient kg) / previous nutrient kg times 100) on total N + P2O5 + K2O,
- saving can be negative when we recommend more than the farmer used. Return it as is, the UI explains it,
- prices come from fertilizer_products.csv and price_date is carried in the trace so we can say how old the price is.
Write tests for each of the four cases above.
````

#### S6. Recommendation engine and real API mode

**Integration gate G3** · Needs S3, S4, S5, R6, R8, R10 · Integrates with J8, J9 · Unblocks S7, S8, S9, J8, J9, R8, R11, D7, D8

**Done when:** The fixture request in real mode validates against RecommendResponse, the same input always gives the same output, /risk-score works, and p95 latency over 50 calls is under 3 s.

> This is the step that turns mock mode off. Tell Josh (J8, J9) and Darsh (D7) the moment it merges.

````text
Implement ml/src/engine/recommendation_engine.py and switch the API to real mode.

1. Load once at startup (FastAPI lifespan): the active classifier named in model_registry/registry.json, the reference tables (via Richa's soil_data_loader) and the rules. Compute rules_hash8 from the table files. MODEL_VERSION = f"{model_name}-{semver}+rules-{hash8}".
2. recommend(request: RecommendRequest) -> RecommendResponse:
   a. validate_soil, request_to_record and build_features from Richa's C4 module (the same function used in training),
   b. npk_calculator.compute_balance gives the dose inputs and rule trace, and raises ReferenceDataIncomplete for a crop that is not ready (return 503); to_products dates the schedule and picks products,
   c. the classifier predicts the primary fertilizer product (top 1, keep the top 3 probabilities for explain()). If its choice is inconsistent with the nutrient balance, the balance wins and the disagreement goes into the rule trace,
   d. cost.estimate_cost and compare_to_history,
   e. Richa's risk_analyzer.assess_recommendation (C6) returns level, reason, soil_health_impact and yield_impact,
   f. explain(...) returns top_factors; if it raises, fall back to the first two rule_trace effects,
   g. return exactly the contract shape, including explanation.nutrient_balance and the formula string.
3. score_planned: POST /risk-score calls risk_analyzer.score_planned with the engine's nutrient_balance and returns the C1 shape.
4. Real mode errors: unknown crop, variety or stage gives 422; missing model or tables gives 503 with a clear detail. /health returns { status: "ok"|"degraded", model_version }.
5. Measure latency for 50 sequential requests with the fixture payload and report p50 and p95 (target p95 under 3 s, NFR1).
6. Set PREDICT_MODE=real in .env.example once this works, and keep mock mode available for the frontend.
Tests: the fixture request in real mode validates against RecommendResponse, identical input returns identical output, and a planned dose of 2x the need scores higher risk than 1x.
````

#### S7. API hardening and contract tests

**Integration gate G3** · Needs S6 · Integrates with J8

**Done when:** tests/test_contract.py passes in both modes, /docs shows an example for every field, and docs/api-contract.md matches schemas.py.

````text
Harden the ML API and lock the contract with tests.
- tests/test_contract.py: round-trip docs/contract-fixtures/recommend_request.json through the app for /recommend and /risk-score in both modes and check the output against the shape of docs/contract-fixtures/recommend_response.json (types and required keys, not the numbers).
- Add a request-size limit, structured JSON logging (log field_id, crop_type, model_version and latency, never the full soil payload) and a global exception handler that returns the 422 and 503 shapes from the contract.
- Make sure /docs (OpenAPI) shows every field with an example.
- Re-read docs/api-contract.md and fix any drift between the doc and schemas.py in the same commit.
Tell Josh which fields changed, if any, so his mlService.js tests are updated the same day.
````

### Phase 4: Packaging and standout

#### S8. Formula sanity gate and final test evaluation

**Integration gate G4** · Needs S6, R9 · Integrates with R11 · Unblocks S10, S12, R12

**Done when:** tests/test_formula_sanity.py passes for every crop and soil combination, and the registry entry holds test-split metrics with confidence intervals.

````text
Using Richa's metrics.formula_conformity (C7) and her demo scenarios in docs/demo-scenarios.md, write tests/test_formula_sanity.py. For every crop and variety in crops.csv and for low, medium and high soil combinations, an independent recomputation of the dose formula (written from the tables, not by calling npk_calculator) must match the engine's fertilizer_needed_kg_ha within the tolerance in agronomy_rules.yaml. Only crops that ready_crops() reports are tested, and the test lists any crop that is not ready. Assert no negative quantities, that stage quantities sum to the top-level total for the primary product, and that an adjustment that would push the total below zero gives zero.

Then run python -m src.models.train --final-test once for the frozen version and paste the test-split metrics with confidence intervals (Richa's evaluate_classifier) into the registry entry. Do not run the test split again after this.
````

#### S9. Package the ML service for compose

**Integration gate G4** · Needs S6 · Pairs with J10 · Unblocks S11, J10

**Done when:** docker build and run of the ML image alone answers /recommend with the fixture, and /health says degraded (HTTP 200) when the artifact is missing.

> ml/Dockerfile currently copies only src/ and requirements. The rule tables in data/external/ and configs/ must be inside the image or /recommend cannot work.

````text
Package the ML service for docker-compose. Josh owns docker-compose.yml, you own ml/Dockerfile.
1. Update ml/Dockerfile: copy src/, configs/ and data/external/ (the tables are read at runtime), install the pinned requirements, run as a non-root user, add a HEALTHCHECK on /health, and CMD uvicorn on 0.0.0.0:8001.
2. Artifact strategy: models_artifacts/ is gitignored, so the container gets the model through a bind mount (./ml/models_artifacts:/app/models_artifacts:ro) and registry.json is copied into the image. Provide one command that recreates the artifact from a clean checkout (python -m src.models.train) and add it to the Commands list in ml/AGENTS.md.
3. /health returns "degraded" (HTTP 200) with the reason when the artifact is missing, so compose can show it.
4. Build and run the image alone (docker build ml/ then docker run with the volume) and prove /recommend and /risk-score work with the fixtures.
Tell Josh the exact mount path and healthcheck so his compose file matches.
````

#### S12. Stretch: learned quantity refinement against the formula (stretch)

Needs S8

**Done when:** A logged run compares MAE of the learned quantity model against the dose formula on the same crop, with intervals.

````text
Only if Richa has found a dataset with real applied-quantity labels for at least one crop. Train an XGBoost regressor for nutrient quantity on that data using the same harness as S3, and compare its MAE to the dose formula on the same held-out rows (paired comparison across folds). Keep the dose formula as the default. Only switch the default if the learned model wins by more than the noise. Log the runs and add a short paragraph to the model card.
````

### Phase 5: Demo hardening

#### S10. Model card

**Integration gate G5** · Needs S8, R12

**Done when:** ml/MODEL_CARD.md exists with every section filled, and every number traces to registry.json or Richa's report.

````text
Write ml/MODEL_CARD.md following the model-card requirements in the ML standards (section 5): intended use and out-of-scope uses; training data (source, versions and hash, dates, size, known biases, and say plainly that the classification data is small and may be synthetic); evaluation protocol; metrics with confidence intervals next to the baselines, overall and per crop; the decision policy (the dose formula sets quantity and timing, the classifier refines the product); how risk (Richa's analyzer) and cost are computed; limitations and failure modes from Richa's docs/evaluation-report.md; fairness and regional caveats; a reproducibility block (commit sha, config hash, dataset hash, python and library versions, train command, compute time); ownership and retraining plan. Pull every number from registry.json and Richa's reports. Write TODO(metric) instead of guessing.
````

#### S11. Demo readiness for the ML service

**Integration gate G5** · Needs S9, J10 · Integrates with R11

**Done when:** ml/DEMO_NOTES.md exists, the three scenarios return sensible output through the full compose stack, and the model version is tagged demo.

````text
Prepare the ML service for the demo.
1. Run docker compose up --build from the repo root (Josh's compose) and time a cold start.
2. Send the three scenarios from docs/demo-scenarios.md to /recommend and check /risk-score with an over-application dose for scenario 1 and check the outputs read sensibly to an agronomist (Richa reviews).
3. Write ml/DEMO_NOTES.md: the model_version being demoed, the three scenario outputs, what to say when a judge asks whether this is just a tabular model (the standard dose plus soil-test adjustment on ICAR and PAU-based tables for quantity and timing, a classifier for the product, explanations from the rule trace), and the known limitations.
4. Keep PREDICT_MODE=mock working as the offline fallback.
5. Mark the demo model version in registry.json.
````

## 8. Definition of done

- [ ] Same input always produces the same output. Seeds are set and recorded.
- [ ] Every recommendation returns its dose inputs per nutrient: method, standard dose, soil adjustment, credit and fertilizer needed.
- [ ] Every reported number sits next to a baseline and a spread. The test split was used once.
- [ ] docs/api-contract.md, schemas.py and the fixtures agree, and contract tests pass. The soil schema is untouched.
- [ ] p95 latency of /recommend is under 3 s.
- [ ] No agronomy number appears in code. Every one traces to a C5 table with a source.
- [ ] Model card is complete and honest about the data.
- [ ] ml/ lint, tests and the Docker image pass in CI.

## 9. Daily sync questions

- Richa: is the next table or module ready? Do the C4, C5 and C6 names still match what I use? Does the rule_trace give you what risk_analyzer and explain() need?
- Josh: did any field in C1 change on either side? Is the mock still enough for you, or is real mode next?
- Darsh: does the recommendation object carry everything the screens need?

## 10. Ground rules for everyone

- The soil schema is fixed by the problem statement: n, p, k, ph, organic_carbon, moisture. Never add, remove or rename soil fields.
- Work on your own branch. Never commit to main directly, except docs-only contract PRs that both owners have approved.
- Stay inside your folders (root AGENTS.md). If you need a change in someone else's folder, ask them or record it in the contract doc.
- Commit messages use the form <area>: <what changed>, for example ml: add NPK dose calculator. No AI co-author trailers and no "Generated with" lines in commits or PR descriptions.
- Never commit .env, raw datasets, models_artifacts/, node_modules or .venv. Add new variables to that service's .env.example.
- Before a PR: git pull origin main --rebase, lint and tests pass, and the PR description states the change, the reason and how to test it. UI PRs include screenshots. One teammate reviews before merge.
- Open a PR only when a feature works end to end. Small, focused commits, one logical change each.
- Run every prompt in Claude Code from the repo root on your own branch. Each prompt begins by reading the project context files.
- Reference numbers (reference doses, adjustments, efficiencies, prices, thresholds) live in data or config files, never in application code, and every value has a source.
- No cloud deployment is in scope. The demo runs locally with docker-compose.
