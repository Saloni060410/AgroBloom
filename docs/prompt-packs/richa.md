# Richa — KhetGPT Prompt Pack

**Role:** AI/ML data: datasets, reference tables, weather, risk, evaluation  
**Branch:** `feature/richa-ml-data`  
**Repo:** https://github.com/Saloni060410/AgroBloom.git

Smart India Hackathon, PSAI01: Sustainable Fertilizer Usage Optimizer. This pack is generated from one shared plan, so the four packs always agree on steps, contracts and integration points.

## 1. Your role

You own the truth the engine stands on: which data we use, the sourced ICAR-based reference tables, the feature and loader code, weather, the risk analyzer, and the evidence that the results are trustworthy.

Saloni's dose engine is only as good as the tables you hand her. Three things everyone waits on: the vocabulary and table schemas in the first phase, the reference tables in the second, and the feature module and risk analyzer in the third. Which datasets we use is your decision. The risk analyzer, which warns about over- and under-application and its impact on soil health and yield, is yours.

**You own**

- `ml/data/**` (raw, processed, external, README.md)
- `ml/src/data_pipeline/` (ingest.py, clean.py, feature_engineering.py, build_dataset.py, soil_data_loader.py)
- `ml/src/weather/` (weather_client.py)
- `ml/src/degradation/` (risk_analyzer.py)
- `ml/src/evaluation/` (metrics.py, explainability.py)
- `ml/notebooks/`
- `docs/data-dictionary.md, docs/evaluation-report.md, docs/demo-scenarios.md`

**Hands off (owned by someone else)**

- `ml/src/api/, ml/src/engine/, ml/src/models/` (Saloni)
- `backend/** and docker-compose.yml` (Josh)
- `frontend/**` (Darsh)

### Your call, and what is fixed

**You decide**

- Which datasets we use, and how many. Search the net yourself, combine sources if it helps, and reject anything that is not good enough.
- Which 4 to 6 crops and which demo region (confirm with the team in R1, then it is fixed).
- How you clean, encode and split the data, as long as the outputs match C4 and C5.
- Which sources you cite for norms, prices and cut-offs, as long as every value has one.
- Notebook style, charts and how you present findings.

**Non-negotiable**

- Every dataset has documented provenance: URL, licence, date retrieved, sha256, rows, columns, units.
- Anything paid, unlicensed or of unclear origin is out. Synthetic data is allowed only if it is labelled as synthetic everywhere it is used.
- The interfaces other people code against exist on time: C5 schemas in R1, C5 v0 values in R3, C4 in R6.
- The data has to be able to answer the product question: soil N, P, K, pH, organic carbon, moisture, crop, growth stage and weather in, fertilizer product and, ideally, applied quantity out. Say clearly what each dataset can and cannot support.
- No raw data or secrets in git. Reproducible from one command.

**How to judge a dataset**

- Relevance: Indian crops and conditions, our 4 to 6 crops covered.
- Labels: does it give a fertilizer product, a quantity, or only a crop? Quantity labels are rare and valuable.
- Units: N, P, K in kg/ha, or clearly convertible. Say so if not.
- Size and honesty: row count, duplicates, and whether it looks real or synthetic.
- Licence: can we use it in a hackathon project and cite it?
- Independence: rows that are not near-copies of each other, so the test set means something.
- Varieties: does it name crop varieties? If it does, we expose them as an optional field. If it does not, the field stays hidden.

## 2. Initialize your system

**1. Check your machine**

```bash
python3 --version   # 3.11 or newer
git --version
```

Expected: Python 3.11+. No API keys are needed: weather comes from Open-Meteo.

**2. Clone and switch to your branch**

```bash
git clone https://github.com/Saloni060410/AgroBloom.git
cd AgroBloom
git checkout feature/richa-ml-data
git pull origin main --rebase
```

Expected: Branch feature/richa-ml-data, rebased on the latest main.

**3. Create the environment**

```bash
cd ml
python3.11 -m venv .venv
source .venv/bin/activate      # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m ipykernel install --user --name khetgpt
```

Expected: Jupyter, pandas, scikit-learn, xgboost and httpx are installed. The khetgpt kernel appears in VS Code and Jupyter.

**4. Verify the scaffold**

```bash
pytest -q
ruff check .
ls data/raw data/processed data/external
```

Expected: 2 tests pass, ruff clean. data/raw and data/processed are empty apart from .gitkeep. They are gitignored, so raw files never enter git.

**5. Optional: dataset download tools**

```bash
pip install kaggle      # dev tool, do not add to requirements.txt
# put your token in ~/.kaggle/kaggle.json (Kaggle account settings)
```

Expected: Only needed if you pick Kaggle datasets. Manual download works too.

**6. Open Claude Code**

```bash
cd ..            # repo root
claude
```

Expected: Run every prompt below from the repo root.

## 3. Features you implement

| PRD reference | Feature | Steps |
|---|---|---|
| Data 6 / PRD section 6 | Dataset selection, cleaning, validation gates, provenance | R2, R4, R5 |
| NFR5 | Crop, variety, requirement and price data in files, not code | R1, R3 |
| FR2 | Crop variety vocabulary from the chosen data (optional) | R1, R4 |
| FR6 / Must-have 3 / NFR8 | Weather features from Open-Meteo, plus a seasonal-average fallback | R7 |
| FR8 / Must-have 6 | Risk analyzer: over- and under-application risk with soil-health and yield impact | R8 |
| FR12 | Scoring a farmer's own planned dose | R8 |
| Should-have 10 / NFR7 | Plain-language reasons from the rule trace | R10 |
| Success metrics | Metrics, formula conformity, error analysis, impact estimate for the judges | R9, R12 |
| Should-have 13 | Hindi names and template sentences the UI can translate | R1, R10 |
| Demo | Three realistic scenarios for ML, backend seed and frontend | R11 |
| Standards | Reproducibility, leakage checks, dataset versioning | R4, R6, R13 |

## 4. Who you depend on, and who depends on you

Hard need = you cannot finish the step without it. Integrates with = you can start on a mock or fixture, but the step is only complete once the other person's work is merged and you have tested against it. Pairs with = you finish it together.

| Step | Blocked by (hard) | Pairs with | Integrates with | Unblocks | Gate |
|---|---|---|---|---|---|
| **R0** Verify your ML environment | none | none | none | none |  |
| **R1** Decide crops and region, publish vocabularies and table schemas | none | none | none | R2, R3, R4, S2, J6, D6, D12 | G0 |
| **R2** Find, judge and choose your datasets | R1 | none | none | R4 | G1 |
| **R3** Sourced reference tables for the dose formula | R1 | none | none | S4, S5, R6, R8, R10, R11 | G1 |
| **R4** Cleaning pipeline with validation gates | R2, R1 | none | none | S3, R5, R6 | G1 |
| **R5** EDA and leakage review | R4 | none | none | S3 |  |
| **R6** Shared feature module, loaders and dataset build | R4, R3 | none | none | S3, S6, R7, R8, R9, R13, R14, S4 | G2 |
| **R7** Open-Meteo client, weather features and seasonal fallback | R6 | none | J7 | J7 | G2 |
| **R8** Risk analyzer: over- and under-application with soil and yield impact | R3, R6 | none | S4, S6 | S6, J9, D10 | G3 |
| **R9** Evaluation metrics module | R6 | none | S3 | S8, R12, S3 | G3 |
| **R10** Explanation templates and explain() | R3 | none | S4 | S6, S4 | G3 |
| **R11** Three demo scenarios | R3 | none | S6 | J12, S8, S11, D7, D14 | G3 |
| **R12** Error analysis and impact estimate for the judges | S3, R9, S8 | none | none | S10 | G4 |
| **R13** Reproducible data commands and final docs | R6 | none | none | none | G5 |
| **R14** Stretch: satellite soil reference for fields without a soil test | R6 | none | none | none |  |

## 5. Team timeline and integration gates

- **Phase 0: Kickoff and contracts.** Everyone sets up, and the shared contracts are agreed and merged before anyone builds against them.
- **Phase 1: Foundations in parallel.** Each person builds their base layer against contracts and fixtures. Nobody waits for anybody.
- **Phase 2: Real data and real CRUD.** Real datasets and tables land, the model trains, the API stores real farm data, forms save it.
- **Phase 3: Real recommendation.** Mock mode is switched off. Data, model, backend and UI produce one real recommendation.
- **Phase 4: Packaging and standout.** One-command stack, CI green, the 3D feature, Hindi toggle, evaluation evidence.
- **Phase 5: Demo hardening.** Rehearse, freeze, write the model card, prepare fallbacks.

### G0 — Contracts locked (end of Phase 0)

C1 (ML API), C3 (backend REST API), the fixtures and the crop vocabulary are merged to main. Nobody changes them without the change process.

**Your steps at this gate:** R1 (Decide crops and region, publish vocabularies and table schemas)

**Who delivers what**

- Saloni + Josh: review and lock docs/api-contract.md and docs/contract-fixtures/ (S1, J1)
- Josh + Darsh: docs/backend-api.md merged (J1)
- Richa: crops, varieties, stages and header-only reference tables merged (R1)
- Everyone: dev environment running on their own branch (S0, R0, J0, D0)

**Acceptance test:** Every teammate can read the fixtures and say what each endpoint returns. Josh, Saloni and Darsh have approved the contract PRs.

**If it slips:** Do not start Phase 1 code that depends on an unmerged contract. Build only environment and non-contract work until it merges.

### G1 — Mock vertical slice (end of Phase 1)

One request travels the whole chain with fake numbers: frontend, backend, database and the ML service in mock mode.

**Your steps at this gate:** R2 (Find, judge and choose your datasets), R3 (Sourced reference tables for the dose formula), R4 (Cleaning pipeline with validation gates)

**Who delivers what**

- Saloni: ML mock mode plus reference endpoints on main (S2)
- Josh: seeded database, real auth and the thin recommendation route (J2, J3, J4)
- Darsh: shell, auth pages and a first recommendation screen (D2, D3, D4)
- Richa: datasets chosen, reference tables v0, cleaning pipeline (R2, R3, R4)

**Acceptance test:** Log in as the seeded farmer, open the seeded field, press Get recommendation, see a mocked plan on screen, and find the stored row in Postgres.

**If it slips:** Darsh runs with VITE_USE_MOCK=true. Josh stubs the ML call with the fixture. Neither blocks on the other.

### G2 — Data to engine handoff (end of Phase 2)

Richa's tables and feature module feed Saloni's dose engine and trainer, and the app stores real farm data.

**Your steps at this gate:** R6 (Shared feature module, loaders and dataset build), R7 (Open-Meteo client, weather features and seasonal fallback)

**Who delivers what**

- Richa: feature module, dataset build, frozen test split, weather client and seasonal fallback on main (R6, R7)
- Saloni: first trained model v0.1.0 (S3) and a passing NPK dose calculator on Richa's tables (S4)
- Josh: CRUD, reference proxy, weather and geocoding on main (J5, J6, J7)
- Darsh: farm, field, soil, crop and fertilizer log screens saving real data (D5, D6)

**Acceptance test:** python -m src.models.train runs from a clean checkout and prints a comparison table. The engine's golden tests pass on the reference tables. Darsh creates a farm, field and soil test in the UI and Josh's database holds them.

**If it slips:** Saloni trains on sample_train.csv. Engine tests use the v0 tables. The UI keeps using the mock for anything unmerged.

### G3 — Real end to end (end of Phase 3)

Mock mode is off. A real engine, real weather and real stored data produce the recommendation the user sees, with the risk warning and the formula inputs.

**Your steps at this gate:** R8 (Risk analyzer: over- and under-application with soil and yield impact), R9 (Evaluation metrics module), R10 (Explanation templates and explain()), R11 (Three demo scenarios)

**Who delivers what**

- Saloni: cost, recommendation engine in real mode, contract tests (S5, S6, S7)
- Richa: risk analyzer, metrics, explanations, demo scenarios (R8, R9, R10, R11)
- Josh: full recommendation orchestration and history, risk check and trends (J8, J9)
- Darsh: full recommendation screen, schedule page, history and trends (D7, D8, D9)

**Acceptance test:** Signup, farm, field, soil test, crop and stage, Get recommendation. The result shows a real model_version, a dated schedule, the risk with its soil and yield impact, cost and the dose numbers. History and the schedule page show it afterwards.

**If it slips:** Ship G3 with mock mode and label it in the UI as sample output. Do not hide that it is a mock.

### G4 — One-command stack (end of Phase 4)

docker compose up brings up Postgres, ML and backend healthy from a clean clone. CI is green. The standout UI features work on the real stack.

**Your steps at this gate:** R12 (Error analysis and impact estimate for the judges)

**Who delivers what**

- Josh: compose and CI (J10), hardening (J11)
- Saloni: ML image, artifact strategy, formula sanity gate, final test evaluation (S8, S9)
- Richa: evaluation report with impact estimate (R12)
- Darsh: what-if dose check, 3D visualization, language toggle, landing (D10, D11, D12, D13)

**Acceptance test:** A teammate who has never run the project clones it, follows the README and reaches a working recommendation in under 15 minutes.

**If it slips:** Frontend runs from npm run dev against the compose stack. Ship the standout feature only if it meets the performance contract.

### G5 — Demo freeze (end of Phase 5)

Rehearsed on two machines. Fallbacks work. Model card and evaluation report are written. main is tagged.

**Your steps at this gate:** R13 (Reproducible data commands and final docs)

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

#### R0. Verify your ML environment

**Done when:** pytest shows 2 passed, ruff is clean and the khetgpt kernel opens a notebook.

````text
Read AGENTS.md (root), ml/AGENTS.md and docs/PRD.md sections 5, 6 and 11. I am Richa, owner of ml/data, ml/src/data_pipeline, ml/src/weather, ml/src/evaluation and ml/notebooks on branch feature/richa-ml-data. Work only inside those.

1. Confirm the branch and that it is rebased on origin/main.
2. In ml/, activate .venv (Python 3.11), pip install -r requirements.txt, run pytest -q and ruff check .
3. Confirm a Jupyter notebook can be created and the khetgpt kernel is available.
4. Summarise, in five lines, what ml/data/README.md and ml/AGENTS.md ask of me.
Fix only environment problems. Show me the outputs.
````

#### R1. Decide crops and region, publish vocabularies and table schemas

**Integration gate G0** · Unblocks R2, R3, R4, S2, J6, D6, D12

**Done when:** A PR to main is merged with crops.csv, crop_varieties.csv, growth_stages.csv and header-only versions of every other C5 table. Saloni, Josh and Darsh have all seen it.

> Everyone uses your crop, variety and stage ids: the API, the database, the UI. Do this first and merge it fast.

````text
Read docs/PRD.md sections 1, 5, 6 and 11, docs/ARCHITECTURE.md (decisions log), ml/AGENTS.md and docs/data-dictionary.md. The PRD leaves the target crops and region open. We decide now because every service uses these ids.

1. Ask me the two open questions first if I have not answered them: which 4 to 6 crops (a sensible starting proposal is wheat, rice, maize, cotton, sugarcane and one pulse) and which demo region (state and district).
2. Create ml/data/external/crops.csv (crop_id, name_en, name_hi, dataset_label, season, source) and growth_stages.csv (crop_id, stage_id, name_en, name_hi, order, das_start, das_end, source). Use snake_case ids. das_start and das_end are days after sowing. Fill values only from ICAR or state agriculture university material and cite it in source. Where you cannot find a value write TODO(data) in the cell instead of inventing it. Leave dataset_label empty until datasets are chosen in R2.
3. Create crop_varieties.csv (crop_id, variety_id, name_en, name_hi, source). Varieties come from the datasets you choose in R2. If they have none, keep the file header-only: the UI then hides the variety field.
4. In the same PR add header-only versions, plus one example row each, of the other C5 tables: reference_doses.csv, soil_adjustments.csv, stcr_equations.csv (optional), nutrient_efficiency.csv, split_schedule.csv, fertilizer_products.csv, soil_test_ratings.csv, seasonal_weather.csv, agronomy_rules.yaml and explanation_templates.yaml. Use the exact headers in the C5 schema of this pack. Variety ids use snake_case, and generic is the reserved fallback id that is never listed to users. Saloni codes against these headers, so they must match the C5 schema in the pack exactly.
5. Update docs/data-dictionary.md with the columns, units and allowed values of every file. The soil schema (n, p, k, ph, organic_carbon, moisture) is fixed by the problem statement and is not yours to change.
Open the PR against main (docs and data files only, no code).
````

### Phase 1: Foundations in parallel

#### R2. Find, judge and choose your datasets

**Integration gate G1** · Needs R1 · Unblocks R4

**Done when:** ml/data/README.md and ml/data/external/dataset_manifest.json describe every chosen dataset, and a short decision log explains what was rejected and why.

> Nobody hands you a dataset here. Finding good data is the job. Take the time to look properly, then commit to a choice.

````text
Read ml/data/README.md, docs/PRD.md section 6 and .gitignore (raw/ and processed/ are ignored). Help me find and judge datasets for this product. I make the decisions, you do the searching and the checking.

What the product needs: soil N, P, K, pH, organic carbon, moisture, crop, growth stage and weather in; fertilizer product and, ideally, applied quantity out, for Indian conditions and our chosen crops.

1. Search the web for candidate datasets. Look at more than one kind: labelled fertilizer recommendation tables, Soil Health Card style soil data, crop response or yield-with-fertilizer data, published research datasets with kg/ha quantities, and government open data. Combining several sources is fine.
2. For each candidate, fetch what you can and record: URL, licence and terms, date, rows, columns, units, crops covered, whether it names crop varieties, whether it has product labels, quantity labels, or neither, whether it looks real or synthetic, and how many rows are near-duplicates. If something needs a paid subscription or has no clear licence, reject it and say so.
3. Score each candidate against these criteria: relevance to our crops, label type, units, size and honesty, licence, and row independence. Give me a ranked shortlist and a recommendation, and wait for my choice before downloading anything.
4. After I choose: download to ml/data/raw/ (never commit raw files), write src/data_pipeline/ingest.py to verify each raw file against ml/data/external/dataset_manifest.json (sha256, row count, column names) and fail loudly if a file is missing or changed, and commit the manifest, not the data.
5. Update ml/data/README.md with, for every dataset, the exact URL, licence, date retrieved, sha256, rows, columns, units and what it is used for. State plainly which datasets are small or synthetic, and add a Decision log section listing what we rejected and why.
Show me the shortlist first, then the manifest and the ingest output.
````

#### R3. Sourced reference tables for the dose formula

**Integration gate G1** · Needs R1 · Unblocks S4, S5, R6, R8, R10, R11

**Done when:** tests/test_reference_tables.py passes, wheat and rice v0 is merged to main, and the values with their sources are reviewed by a teammate.

> Saloni's NPK dose calculator (S4) and your own risk analyzer (R8) are blocked on this. Push a v0 for two crops the same day, then complete the rest. Values you cannot source stay TODO(data), and a crop with a TODO in a required cell is simply not ready.

````text
Fill the C5 tables with sourced values. Priority: deliver a v0 for two crops first and push it to main the same day, because Saloni's NPK dose calculator (S4) is blocked on it. Then complete the remaining crops.

The engine computes, per nutrient: fertilizer needed = standard dose + soil-test adjustment - credit from recent applications. That is the shape published sources actually support (a recommended dose, and rules or STCR equations that adjust it for soil test values). So the tables must provide:
- reference_doses.csv: the published standard dose in kg/ha of N, P2O5 and K2O per crop, irrigation type and region. variety_id is generic for the fallback and a real id (for example pr_132) only where the source gives a different dose for that variety. Put soil conditions such as "medium fertility" in notes, never in the variety cell. Sources: ICAR crop production guides and institute bulletins, state agriculture university packages of practices (for example the PAU Package of Practices). Cite the exact document and page. Treat a number from a blog or a summary as unverified until you find the primary document.
- soil_adjustments.csv: signed adjustments to the dose by soil rating (very_low, low, medium, high), per crop and nutrient, in P2O5 or K2O terms, taken from the same package of practices (for example extra potash when soil K is low). If a source publishes no adjustment for a nutrient, add no row. Do not invent one.
- stcr_equations.csv (optional): STCR targeted-yield equations FN = a x T - b x SN per crop, nutrient and zone. Fill region (where the equation was developed), applies_to (where we use it, marked as a proxy if it differs) and target_yield_default_q_ha, which needs its own source (for example a regional average or PAU target yield). Leave the target TODO(data) until you find one. The engine only uses a row when the target is filled. Check that the soil test method matches the Soil Health Card units.
- nutrient_efficiency.csv: crop_id (default is the fallback row), nutrient, fertilizer_use_efficiency. It is only used to credit recent applications. Tag each figure with the crop it belongs to. Do not reuse a rice figure for wheat.
- split_schedule.csv: fractions per stage that sum to 1 per nutrient per crop (P and K are usually basal).
- fertilizer_products.csv: urea, DAP, MOP, SSP and every complex grade in your chosen datasets, with dataset_label (the exact label used in the dataset), N, P2O5 and K2O percentages and a current retail price in INR/kg with price_date and source. Never guess a price. Leave TODO(data). The engine only selects priced products, so get MOP first: rice needs it. A price that is old must say so in price_date.
- soil_test_ratings.csv: the low and high cut-offs Soil Health Cards use for available N, P and K (kg/ha), organic carbon (percent) and pH bands, plus very_low_below where a source uses that band.
- agronomy_rules.yaml: credit window days, rain_hold_mm and rain_hold_days, over_application_ratio_medium and _high, under_application_ratio, and the formula tolerance for the sanity test. Every key gets a comment with its source or the words "team assumption".

Add tests/test_reference_tables.py checking: every crop in crops.csv has a generic reference dose row, split fractions sum to 1, no negative doses, product percentages are at most 100, efficiencies are between 0 and 1, every source cell is non-empty, and headers match the C5 schema. Also print which crops are ready (every required cell filled) and which are not, and why. Show me the test output and a table of the values with their sources so a teammate can review them.
````

#### R4. Cleaning pipeline with validation gates

**Integration gate G1** · Needs R2, R1 · Unblocks S3, R5, R6

**Done when:** clean.csv and validation_report.json exist, a violation fails the run, and a sample_train.csv of at most 200 rows is on main.

````text
Read ml/AGENTS.md and the data validation gates in the ML standards (section 6). Implement src/data_pipeline/clean.py:

1. Load the raw files through ingest.py, harmonise column names to snake_case, map crop labels to our crop_id (fill the dataset_label column in crops.csv and add crop_aliases.csv if labels use different spellings) fertilizer labels to product ids from fertilizer_products.csv, and any variety names to variety_id in crop_varieties.csv. Log every dropped or renamed value.
2. Validate against a schema (add pandera to requirements.txt, pinned. That file is shared with Saloni, so append one line only): dtypes, allowed categories, ranges (pH 0 to 14, moisture 0 to 100, non-negative N, P and K), no duplicate rows, class balance report, missingness per column and row count against the manifest. Any violation must fail the run.
3. Unit reconciliation: write down in docs/data-dictionary.md the unit and scale of N, P and K in each chosen dataset and how, or whether, they map to the kg/ha used by the API and by Soil Health Card ratings. If a mapping is not defensible, do not fake one. Document the assumption and flag it as a limitation.
4. Write the validated table to ml/data/processed/clean.csv and a validation_report.json next to it (processed/ is gitignored). Also commit a sample of at most 200 rows as ml/data/processed/sample_train.csv by adding !ml/data/processed/sample_*.csv to .gitignore in the same PR, so Saloni can start without downloading anything.
Show me the validation report and the class balance.
````

### Phase 2: Real data and real CRUD

#### R5. EDA and leakage review

Needs R4 · Unblocks S3

**Done when:** notebooks/EDA.ipynb runs top to bottom and ml/data/EDA_FINDINGS.md (one page) tells Saloni what the data can support.

````text
Load the eda-autoprofiler skill if you have it. Create notebooks/EDA.ipynb on clean.csv: dtypes, cardinality, missingness, distributions per crop and per fertilizer, correlation and collinearity, target relationships, duplicates that would straddle the future train and test split, group structure (are rows independent?), and leakage red flags (features that nearly determine the label, anything that looks too good). Finish with a short section called "What this data can and cannot support": label balance, whether accuracy above the majority baseline is even plausible with this row count, and a recommendation for Saloni on model families, the CV scheme and whether to merge rare classes. Export the conclusions to ml/data/EDA_FINDINGS.md (one page at most). The notebook is exploration only: nothing under src/ may import from it. Clear notebook outputs before committing.
````

#### R6. Shared feature module, loaders and dataset build

**Integration gate G2** · Needs R4, R3 · Unblocks S3, S6, R7, R8, R9, R13, R14, S4

**Done when:** tests/test_feature_engineering.py parity test passes, train.csv has train, val and test splits, soil_data_loader loads every table, and dataset_manifest.json has the dataset version. PR is merged to main.

> Saloni's trainer (S3) and her NPK calculator and recommendation engine (S4, S6) import this. Open the PR into main as soon as the parity test passes.

````text
Implement the shared feature module and loaders, contract C4, in src/data_pipeline/feature_engineering.py, soil_data_loader.py and build_dataset.py.

- soil_data_loader.py: load_reference_tables() reads every C5 table in ml/data/external/ once and returns a typed object with clear errors for a missing file or column. validate_soil(soil: dict) checks the fixed six soil fields (n, p, k, ph, organic_carbon, moisture): presence, type and sane bounds. Never add other soil fields. ready_crops(tables) returns the crops whose required cells are all filled (a generic reference dose for each nutrient, and split rows), with the reason for every crop that is not ready. Saloni's /reference/crops lists only ready crops.
- feature_engineering.py: FEATURE_COLUMNS in a fixed order and CLASSIFIER_TARGET = "fertilizer_product_id". request_to_record(req) flattens a /recommend request (contract C1) into one record: soil values, weather, crop_id, variety_id, stage ordinal from growth_stages.csv and soil ratings via soil_test_ratings.csv. build_features(records) is pure and deterministic and uses fixed vocabularies from crops.csv so serving can never produce different columns than training. rule_inputs(req) returns soil ratings, prior-usage credit inputs and weather flags for the engine and the risk analyzer. Prior-usage features are not classifier inputs unless our chosen datasets contain them. load_training_frame(split) reads ml/data/processed/train.csv, which has a split column.
- build_dataset.py creates train.csv with seed 42: a stratified split by fertilizer label into train, val and test (70, 15, 15), group-aware if a group exists, de-duplicated across splits. The test row ids are frozen in ml/data/external/test_ids.json and never regenerated silently.
- Record the dataset version in ml/data/external/dataset_manifest.json: row counts per split, content hash and feature schema hash.

Tests in tests/test_feature_engineering.py: a parity test that feeds the same record through the training path and the request path and asserts identical features, an unknown crop raises a clear error, no NaNs, and validate_soil rejects a pH of 19. Show me the head of train.csv, the split sizes, the manifest and the loader output.
````

#### R7. Open-Meteo client, weather features and seasonal fallback

**Integration gate G2** · Needs R6 · Integrates with J7 · Unblocks J7

**Done when:** Mocked tests pass, one live call for the demo region matches the backend's keys and units, and seasonal_weather.csv covers the demo region for all months.

> At runtime the backend fetches weather and sends it in the /recommend request (contract C1). Your client serves notebooks, tests and enrichment. Your seasonal_weather.csv is the last-resort fallback the backend uses when Open-Meteo and its cache both fail.

````text
Implement src/weather/weather_client.py with Open-Meteo (no API key, use httpx):
- get_forecast(lat, lon, days=5) -> { temperature_c, humidity_pct, rainfall_mm_forecast }: same keys and meaning as the weather block in contract C1. Endpoint https://api.open-meteo.com/v1/forecast with current=temperature_2m,relative_humidity_2m and daily=precipitation_sum. Josh's backend/src/services/weatherService.js does the same at runtime.
- get_historical_climate(lat, lon, start, end) -> DataFrame of daily mean temperature, humidity and rainfall from https://archive-api.open-meteo.com/v1/archive.
- build_seasonal_fallback(points, years) -> writes ml/data/external/seasonal_weather.csv (region_key, month, temperature_c, humidity_pct, rainfall_mm_5day, source) averaged over several years of archive data for the demo region's points, so a farmer still gets a recommendation when live weather is down. Say in the source column that it is an average, not a forecast.
- File cache in ml/data/raw/weather_cache/ (gitignored), 5 second timeout, one retry, a typed WeatherError, and treat null rain values as 0.
- Add weather_features(weather, rules) to feature_engineering.py: a rain_hold flag from agronomy_rules.yaml.
Tests use a mocked httpx transport, no live calls in CI. Then make one live call for the demo region, compare it with the backend's output for the same coordinates, and tell Josh if keys or units differ. Tell Saloni when seasonal_weather.csv is merged so her /reference/seasonal-weather endpoint can serve it.
````

### Phase 3: Real recommendation

#### R8. Risk analyzer: over- and under-application with soil and yield impact

**Integration gate G3** · Needs R3, R6 · Integrates with S4, S6 · Unblocks S6, J9, D10

**Done when:** Tests pass for over-fertilized, healthy, under-fertilized and runoff cases, and every risk result carries readable soil_health_impact and yield_impact sentences.

> The problem statement asks us to highlight the impact of excessive fertilizer use on soil health and crop productivity. This module is where that happens. Saloni's engine (S6) and the /risk-score endpoint call it.

````text
Implement ml/src/degradation/risk_analyzer.py (contract C6). Two functions, both pure:
- assess_recommendation(nutrient_balance, schedule, soil, weather, prior_usage, rules) -> Risk
- score_planned(planned_application, nutrient_balance, soil, weather, prior_usage, rules) -> { risk, nutrient_balance } where nutrient_balance holds applied_kg_ha, recommended_kg_ha and ratio per nutrient, exactly as in docs/api-contract.md for /risk-score.
Risk = { level: "low"|"medium"|"high", reason, soil_health_impact, yield_impact, over_application_pct | None }.

Signals (thresholds only from agronomy_rules.yaml and soil_test_ratings.csv, none hardcoded):
- over-use: nutrient applied (previous usage inside the window, or the planned dose) divided by fertilizer_needed_kg_ha, above over_application_ratio_medium or _high,
- under-use: soil rating low and the applied or planned amount below under_application_ratio of what is needed,
- imbalance: one nutrient far above need while another is far below,
- soil health: organic carbon rating low, or pH outside the crop's band,
- runoff and leaching: rainfall_mm_forecast at or above rain_hold_mm near a nitrogen application.
Level is the highest signal level. reason, soil_health_impact and yield_impact are built with render_template() from ml/data/external/explanation_templates.yaml. Add the risk.* templates there in English and Hindi. The impact sentences must state the consequence in plain language, for example excess nitrogen acidifying soil and leaching, or extra fertilizer adding cost without adding yield. They must never blame the farmer and must include the numbers that drove the level. Sources for the consequences go in a comment next to each template.

Tests: an over-fertilized field returns high with an over-use reason and both impact sentences; a healthy field returns low; a soil-test-low field with nothing planned returns medium or high with an under-use reason; a heavy-rain forecast near a nitrogen application adds a runoff reason; score_planned with 200 kg urea per acre matches docs/contract-fixtures/risk_score_response.json in level and shape. Show me the outputs for the four cases as JSON.
````

#### R9. Evaluation metrics module

**Integration gate G3** · Needs R6 · Integrates with S3 · Unblocks S8, R12, S3

**Done when:** Tests on tiny synthetic arrays pass and the module's docstring documents every signature.

````text
Load the model-evaluation-suite skill if you have it. Implement src/evaluation/metrics.py, contract C7:
- evaluate_classifier(y_true, y_pred, y_proba=None, classes=None, groups=None, n_boot=1000, seed=42) -> dict with accuracy, balanced accuracy, macro-F1, MCC, per-class precision, recall and F1, the confusion matrix, bootstrap 95 percent intervals, and calibration (Brier score, ECE) when probabilities are given. JSON-serialisable.
- cv_summary(fold_scores) -> mean and std per metric.
- baseline_report(y_train, y_test) -> majority-class and stratified-random scores on the same split.
- formula_conformity(recs, tables, tol) -> share of recommendations whose fertilizer_needed_kg_ha matches an independent recomputation of the dose formula from the tables within tol, and the list of violators.
- per_slice(y_true, y_pred, slice_col) -> metrics by crop or soil rating.
Tests on tiny synthetic arrays with known answers. Document the function signatures at the top of the module because Saloni's trainer and formula sanity gate call them. Show me one evaluate_classifier output on a toy example.
````

#### R10. Explanation templates and explain()

**Integration gate G3** · Needs R3 · Integrates with S4 · Unblocks S6, S4

**Done when:** explain() returns exactly top_k readable sentences for a hand-written rule_trace, and every template renders with sample params.

> Pair with Saloni so the rule_trace format matches on both sides before either of you merges. The risk.* templates from R8 live in the same yaml file.

````text
Implement src/evaluation/explainability.py and complete ml/data/external/explanation_templates.yaml (contract C6; R8 already adds the risk.* keys).
- Templates: template id to English sentence with {placeholders}, for example "The standard dose for irrigated wheat is {dose} kg/ha of nitrogen. Your soil potassium is low ({value} kg/ha), so {adjustment} kg/ha of potash is added." Add an hi: key for each so Darsh's Hindi toggle can use them later. Cover every rule_id Saloni's NPK calculator emits (agree the list with her; start from standard_dose, soil_adjustment, stcr_equation, prior_credit, rain_hold, split_stage) and the product choice.
- render_template(template_id, **params) -> str; a missing id or param raises a clear error.
- explain(features, prediction, rule_trace, top_k=3) -> list[str]: rank rule_trace items by absolute effect on the fertilizer needed (largest first), turn the top_k into sentences with the templates, and add one sentence for the product choice using XGBoost's native pred_contribs (booster.predict(dmatrix, pred_contribs=True)) for the top feature. No SHAP dependency. Sentences are plain language a farmer can read, with units, and never blame the farmer.
Tests: given a hand-written rule_trace, explain() returns exactly top_k readable sentences, and every template renders with sample params.
````

#### R11. Three demo scenarios

**Integration gate G3** · Needs R3 · Integrates with S6 · Unblocks J12, S8, S11, D7, D14

**Done when:** docs/demo-scenarios.md and docs/contract-fixtures/demo_scenarios.json are merged, and Saloni has run all three through /recommend.

> Josh seeds these into the database (J12) and Darsh uses them for the demo and the fallback build (D14).

````text
Write docs/demo-scenarios.md: three realistic scenarios we will demo, each as a ready-to-use JSON payload for /recommend (fits contract C1) and as farm, field, soil and log rows Josh can seed.
1. A wheat field with a history of over-application (high risk, clear saving).
2. A rice field with low soil nitrogen and heavy rain forecast (rain hold visible in the schedule).
3. A healthy maize field (low risk, small change).
Give coordinates in the demo region, plausible soil values with units, previous fertilizer logs with dates, and the expected qualitative outcome (product, risk level, direction of saving) that you verified by hand against the norm tables. Export the same data as docs/contract-fixtures/demo_scenarios.json. Ask Saloni to run them through /recommend and reconcile any surprising output before the demo.
````

### Phase 4: Packaging and standout

#### R12. Error analysis and impact estimate for the judges

**Integration gate G4** · Needs S3, R9, S8 · Unblocks S10

**Done when:** docs/evaluation-report.md is written and Saloni has the numbers she needs for the model card.

````text
Write docs/evaluation-report.md, the judge-facing evidence (PRD section 10). Using Saloni's registry entries and your metrics module:
1. Model results: cross-validated and final-test metrics with 95 percent intervals next to the baselines, per crop; the confusion matrix; the worst errors inspected with a short explanation of why each happened; what the classifier cannot do (say so if the data is small or synthetic).
2. Formula check: formula_conformity over a grid of soil and crop combinations; list any violation. Include a short table of risk results for over-fertilized, healthy and under-fertilized examples.
3. Impact estimate: cost and over-application saving per acre for the three demo scenarios, with every assumption written out (which previous-usage pattern, prices with date and source, area). Find and cite your own source for what a typical farmer applies today. Never present a made-up percentage. Label estimates as estimates.
4. notebooks/model_experiments.ipynb reading the run records under models_artifacts/runs/ for the comparison table.
Give Saloni the numbers she needs for the model card (S10).
````

#### R14. Stretch: satellite soil reference for fields without a soil test (stretch)

Needs R6

**Done when:** A client returns soil property estimates for a coordinate, with the caveat about what they do and do not mean documented.

````text
Only after everything else is done (PRD feature 14). Find a free global soil property service (SoilGrids is one option, or another you judge better) and write src/data_pipeline/soil_reference.py that returns estimated soil properties for a latitude and longitude. Document honestly which properties map to our inputs (pH and organic carbon do, available N, P and K in kg/ha usually do not) and what the UI must say to the user. This needs an endpoint from Josh and a screen from Darsh, so raise it with them before you build more.
````

### Phase 5: Demo hardening

#### R13. Reproducible data commands and final docs

**Integration gate G5** · Needs R6

**Done when:** On a fresh clone and fresh venv, one command rebuilds the dataset and prints its version, with no manual step left undocumented.

````text
Make the data side reproducible from a clean checkout.
1. One command, python -m src.data_pipeline.build_dataset --config configs/data.yaml, runs ingest, clean, features and split, and prints the dataset version.
2. Update ml/data/README.md (fetch instructions, licences, hashes), docs/data-dictionary.md (every column, unit, source and allowed value, including the API fields) and ml/data/external/dataset_manifest.json.
3. Add the data steps to the Commands list in ml/AGENTS.md.
4. Delete unused files and clear notebook outputs before committing.
5. Run everything in a fresh venv on a fresh clone. Report the time taken and any manual step still left.
````

## 8. Definition of done

- [ ] Every dataset in use has provenance, licence and hash in the README and manifest, and the reasons for rejected ones are logged.
- [ ] Every value in the C5 tables has a source, and a teammate reviewed the values.
- [ ] Training and serving use the same feature function, proven by the parity test.
- [ ] The risk analyzer states the soil-health and yield impact in plain language for over-, under- and imbalanced use.
- [ ] The test split is frozen and was never used for choosing anything.
- [ ] Nothing in git that should not be: no raw data, no secrets, no notebook outputs. The soil schema is untouched.
- [ ] The evaluation report states what the data cannot support.
- [ ] One command rebuilds the dataset from a clean checkout.

## 9. Daily sync questions

- Saloni: what did you need from me that was missing or misnamed? Does the nutrient_balance and rule_trace give my risk analyzer and explain() what they need?
- Josh: does the weather output of my client match your service's keys and units? Is my seasonal fallback what your fallback reads?
- Darsh: are crop, variety and stage names, and the impact sentences, readable on screen? Are the Hindi names final?

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
