# Josh — KhetGPT Prompt Pack

**Role:** Backend: auth, database, REST API, infra  
**Branch:** `feature/josh-backend`  
**Repo:** https://github.com/Saloni060410/AgroBloom.git

Smart India Hackathon, PSAI01: Sustainable Fertilizer Usage Optimizer. This pack is generated from one shared plan, so the four packs always agree on steps, contracts and integration points.

## 1. Your role

You are the spine between the app and the engine: accounts, farms, fields, stored soil and usage data, weather with a fallback chain, place-name search, the call to the ML service, trends, and the compose stack and CI that hold it together.

Two contracts define your job: C1 with Saloni (what you send to and get from the ML service, already drafted in docs/api-contract.md) and C3 with Darsh (what the frontend can call, which you write in J1). Get both merged first, then build against fixtures. Weather is already switched to Open-Meteo in weatherService.js. There is no cloud deployment in scope: the stack runs locally with docker-compose.

**You own**

- `backend/**` (Express, Prisma, auth, routes, services)
- `docker-compose.yml`
- `.github/workflows/`
- `docs/backend-api.md` (with Darsh)
- `backend/DEMO.md`

**Hands off (owned by someone else)**

- `ml/**` (Saloni and Richa)
- `frontend/**` (Darsh)

## 2. Initialize your system

**1. Check your machine**

```bash
node -v            # 22 or newer (CI uses 22)
npm -v
docker --version
git --version
```

Expected: Node 22+, Docker Desktop running.

**2. Clone and switch to your branch**

```bash
git clone https://github.com/Saloni060410/AgroBloom.git
cd AgroBloom
git checkout feature/josh-backend
git pull origin main --rebase
```

Expected: Branch feature/josh-backend, rebased on the latest main (which includes the Open-Meteo weather switch once it is pushed).

**3. Configure the backend**

```bash
cd backend
cp .env.example .env
# generate two secrets and paste them into .env:
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
```

Expected: .env has DATABASE_URL, both JWT secrets, ML_SERVICE_URL=http://localhost:8001. No weather key is needed.

**4. Start Postgres and install**

```bash
cd ..                       # repo root
docker compose up -d postgres
cd backend
npm install
npx prisma generate
```

Expected: Postgres healthy on 5432. npm install works because package.json allows the install scripts of prisma and bcrypt (allowScripts).

**5. Run and verify**

```bash
npm run lint
npm run dev
# second terminal:
curl localhost:4000/api/health
```

Expected: {"status":"ok"}. Other routes answer 501 until you implement them.

**6. Open Claude Code**

```bash
cd ..            # repo root
claude
```

Expected: Run every prompt below from the repo root.

## 3. Features you implement

| PRD reference | Feature | Steps |
|---|---|---|
| FR1 / NFR4 | Register, login, refresh, logout with hashed passwords and expiring tokens | J3 |
| FR2 | Farms and fields | J5 |
| FR3, FR4, FR5 | Soil tests (fixed six fields), crop, variety, sowing date and stage on the field, previous fertilizer log | J5 |
| FR6 / NFR8 | Weather by field location (Open-Meteo), cached, with a seasonal-average fallback | J7 |
| FR13 | Place-name search that turns into coordinates (Open-Meteo geocoding) | J7 |
| FR7, FR8, FR10 | Assemble the ML payload, store the recommendation, expose risk, cost and formula inputs | J4, J8 |
| FR9 / Should-have 9 | Recommendation history and trend series per field | J8, J9 |
| FR12 | Risk check for a farmer's own planned dose | J9 |
| NFR3, NFR5, NFR6 | Reproducible results, reference data proxied not hardcoded, clean service split | J6, J8, J10 |
| Infra | docker-compose for backend, ML and Postgres, CI on pull requests | J10 |
| Could-have 19 | Agronomist regional summary (anonymised) | J13 |

## 4. Who you depend on, and who depends on you

Hard need = you cannot finish the step without it. Integrates with = you can start on a mock or fixture, but the step is only complete once the other person's work is merged and you have tested against it. Pairs with = you finish it together.

| Step | Blocked by (hard) | Pairs with | Integrates with | Unblocks | Gate |
|---|---|---|---|---|---|
| **J0** Verify your backend environment | none | none | none | none |  |
| **J1** Review the ML contract and write the backend API contract | none | S1 | none | J2, D2 | G0 |
| **J2** First migration and demo seed | J1 | none | none | J3 | G1 |
| **J3** Authentication with token rotation | J2 | none | none | J4, J5, D3 | G1 |
| **J4** Thin recommendation slice against the ML mock | J3, S2 | none | D4 | D4 | G1 |
| **J5** Farms, fields, soil tests and fertilizer logs | J3 | none | D5, D6 | J6, J7, J8, J13, D5, D6 | G2 |
| **J6** Reference data proxy | J5, S2 | none | R1 | J8, D6, D11 | G2 |
| **J7** Weather with fallback chain, and place-name geocoding | J5 | none | R7 | J8, R7, D5 | G2 |
| **J8** Full recommendation orchestration and history | J5, J6, J7, S6 | none | D7, D9 | J9, J10, J11, J12, S6, S7, D7, D8, D9 | G3 |
| **J9** Risk check and trends endpoints | J8, S6 | none | D9, D10, R8 | S6, D9, D10 | G3 |
| **J10** Compose stack and CI (local, no cloud deployment) | J8, S9 | S9 | none | S11 | G4 |
| **J11** Security and reliability pass | J8 | none | none | none | G4 |
| **J12** Demo seed and reset | J8, R11 | none | none | none | G5 |
| **J13** Stretch: agronomist regional summary | J5 | none | none | none |  |

## 5. Team timeline and integration gates

- **Phase 0: Kickoff and contracts.** Everyone sets up, and the shared contracts are agreed and merged before anyone builds against them.
- **Phase 1: Foundations in parallel.** Each person builds their base layer against contracts and fixtures. Nobody waits for anybody.
- **Phase 2: Real data and real CRUD.** Real datasets and tables land, the model trains, the API stores real farm data, forms save it.
- **Phase 3: Real recommendation.** Mock mode is switched off. Data, model, backend and UI produce one real recommendation.
- **Phase 4: Packaging and standout.** One-command stack, CI green, the 3D feature, Hindi toggle, evaluation evidence.
- **Phase 5: Demo hardening.** Rehearse, freeze, write the model card, prepare fallbacks.

### G0 — Contracts locked (end of Phase 0)

C1 (ML API), C3 (backend REST API), the fixtures and the crop vocabulary are merged to main. Nobody changes them without the change process.

**Your steps at this gate:** J1 (Review the ML contract and write the backend API contract)

**Who delivers what**

- Saloni + Josh: review and lock docs/api-contract.md and docs/contract-fixtures/ (S1, J1)
- Josh + Darsh: docs/backend-api.md merged (J1)
- Richa: crops, varieties, stages and header-only reference tables merged (R1)
- Everyone: dev environment running on their own branch (S0, R0, J0, D0)

**Acceptance test:** Every teammate can read the fixtures and say what each endpoint returns. Josh, Saloni and Darsh have approved the contract PRs.

**If it slips:** Do not start Phase 1 code that depends on an unmerged contract. Build only environment and non-contract work until it merges.

### G1 — Mock vertical slice (end of Phase 1)

One request travels the whole chain with fake numbers: frontend, backend, database and the ML service in mock mode.

**Your steps at this gate:** J2 (First migration and demo seed), J3 (Authentication with token rotation), J4 (Thin recommendation slice against the ML mock)

**Who delivers what**

- Saloni: ML mock mode plus reference endpoints on main (S2)
- Josh: seeded database, real auth and the thin recommendation route (J2, J3, J4)
- Darsh: shell, auth pages and a first recommendation screen (D2, D3, D4)
- Richa: datasets chosen, reference tables v0, cleaning pipeline (R2, R3, R4)

**Acceptance test:** Log in as the seeded farmer, open the seeded field, press Get recommendation, see a mocked plan on screen, and find the stored row in Postgres.

**If it slips:** Darsh runs with VITE_USE_MOCK=true. Josh stubs the ML call with the fixture. Neither blocks on the other.

### G2 — Data to engine handoff (end of Phase 2)

Richa's tables and feature module feed Saloni's dose engine and trainer, and the app stores real farm data.

**Your steps at this gate:** J5 (Farms, fields, soil tests and fertilizer logs), J6 (Reference data proxy), J7 (Weather with fallback chain, and place-name geocoding)

**Who delivers what**

- Richa: feature module, dataset build, frozen test split, weather client and seasonal fallback on main (R6, R7)
- Saloni: first trained model v0.1.0 (S3) and a passing NPK dose calculator on Richa's tables (S4)
- Josh: CRUD, reference proxy, weather and geocoding on main (J5, J6, J7)
- Darsh: farm, field, soil, crop and fertilizer log screens saving real data (D5, D6)

**Acceptance test:** python -m src.models.train runs from a clean checkout and prints a comparison table. The engine's golden tests pass on the reference tables. Darsh creates a farm, field and soil test in the UI and Josh's database holds them.

**If it slips:** Saloni trains on sample_train.csv. Engine tests use the v0 tables. The UI keeps using the mock for anything unmerged.

### G3 — Real end to end (end of Phase 3)

Mock mode is off. A real engine, real weather and real stored data produce the recommendation the user sees, with the risk warning and the formula inputs.

**Your steps at this gate:** J8 (Full recommendation orchestration and history), J9 (Risk check and trends endpoints)

**Who delivers what**

- Saloni: cost, recommendation engine in real mode, contract tests (S5, S6, S7)
- Richa: risk analyzer, metrics, explanations, demo scenarios (R8, R9, R10, R11)
- Josh: full recommendation orchestration and history, risk check and trends (J8, J9)
- Darsh: full recommendation screen, schedule page, history and trends (D7, D8, D9)

**Acceptance test:** Signup, farm, field, soil test, crop and stage, Get recommendation. The result shows a real model_version, a dated schedule, the risk with its soil and yield impact, cost and the dose numbers. History and the schedule page show it afterwards.

**If it slips:** Ship G3 with mock mode and label it in the UI as sample output. Do not hide that it is a mock.

### G4 — One-command stack (end of Phase 4)

docker compose up brings up Postgres, ML and backend healthy from a clean clone. CI is green. The standout UI features work on the real stack.

**Your steps at this gate:** J10 (Compose stack and CI (local, no cloud deployment)), J11 (Security and reliability pass)

**Who delivers what**

- Josh: compose and CI (J10), hardening (J11)
- Saloni: ML image, artifact strategy, formula sanity gate, final test evaluation (S8, S9)
- Richa: evaluation report with impact estimate (R12)
- Darsh: what-if dose check, 3D visualization, language toggle, landing (D10, D11, D12, D13)

**Acceptance test:** A teammate who has never run the project clones it, follows the README and reaches a working recommendation in under 15 minutes.

**If it slips:** Frontend runs from npm run dev against the compose stack. Ship the standout feature only if it meets the performance contract.

### G5 — Demo freeze (end of Phase 5)

Rehearsed on two machines. Fallbacks work. Model card and evaluation report are written. main is tagged.

**Your steps at this gate:** J12 (Demo seed and reset)

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

#### J0. Verify your backend environment

**Done when:** npm run lint is clean, /api/health returns ok and Postgres is healthy.

````text
Read AGENTS.md (root) and backend/AGENTS.md. I am Josh, owner of backend/**, docker-compose.yml and .github/workflows on branch feature/josh-backend. Work only inside those.

1. Confirm the branch and that it is rebased on origin/main.
2. Copy backend/.env.example to backend/.env and generate two 32-byte hex secrets for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (openssl rand -hex 32).
3. docker compose up -d postgres, then in backend/: npm install, npx prisma generate, npm run lint, npm run dev, and curl http://localhost:4000/api/health.
4. If bcrypt or the Prisma engines fail to install, check the allowScripts block in backend/package.json (npm blocks install scripts unless allowed).
Report the outputs. Fix only environment problems.
````

#### J1. Review the ML contract and write the backend API contract

**Integration gate G0** · Pairs with S1 · Unblocks J2, D2

**Done when:** docs/backend-api.md is merged, Saloni's contract PR is approved by you, and Darsh has approved backend-api.md.

> Darsh cannot build his API layer or his mock without this (D2). Do it first. The ML contract draft already exists in docs/api-contract.md, so your review is about whether it maps to your database and your orchestration.

````text
Read docs/api-contract.md (v1.0 draft), docs/contract-fixtures/, docs/PRD.md sections 4, 8 and 9, backend/AGENTS.md, frontend/AGENTS.md and backend/prisma/schema.prisma. Saloni and I lock the ML contract together. Review it against the schema and tell me what maps where: cost to Recommendation.estimatedCost and estimatedSaving, risk to riskLevel, riskReason, soilHealthImpact and yieldImpact, explanation.nutrient_balance and formula to the explanation Json, schedule to the Json column, weather.source to weatherSource, and the new optional variety and sowing_date to Field.cropVariety and Field.sowingDate (already in the schema). The soil schema (n, p, k, ph, organicCarbon, moisture) is fixed by the problem statement and must not change.

Then write docs/backend-api.md (contract C3, shared with Darsh) on a docs-only branch docs/backend-api-v1 off main. Base URL /api, JSON in camelCase, error shape { error, details? }, bearer access token, pagination ?page&limit returning { items, page, limit, total }. Document every endpoint with request and response examples:
 POST /auth/register, /auth/login, /auth/refresh, /auth/logout; GET /auth/me
 GET and POST /farms; GET and DELETE /farms/:id
 GET and POST /farms/:farmId/fields; GET and PATCH /fields/:id (cropType, cropVariety, growthStage, sowingDate, latitude, longitude, areaAcres)
 GET /geocode?q= -> [{ name, admin, latitude, longitude }] (proxies Open-Meteo geocoding)
 POST and GET /fields/:id/soil-tests
 POST and GET /fields/:id/fertilizer-logs
 GET /fields/:id/weather -> { temperatureC, humidityPct, rainfallMmForecast, source, fetchedAt, stale }
 POST /fields/:id/recommendations -> 201 Recommendation; GET /fields/:id/recommendations (paginated history); GET /recommendations/:id
 POST /fields/:id/risk-check { plannedApplication: [{ fertilizerType, quantityKgPerAcre }] } -> { risk, nutrientBalance }
 GET /fields/:id/trends -> { soilTests: [...], applied: [...], recommendations: [...] } as time series a chart can draw
 GET /reference/crops, /soil-ratings, /fertilizers (proxied from the ML service)
The Recommendation object is the one in docs/prompt-packs (contract C3): it carries risk with soilHealthImpact and yieldImpact, topFactors, nutrientBalance, formula, cost, impact, weatherSource, weatherStale, modelVersion.
Document status codes (400 validation, 401, 403, 404 also for other users' resources, 409 missing prerequisite, 502 ML unavailable, 503 weather unavailable) and the role rules (FARMER and AGRONOMIST).
Link both contract docs from the docs bullet in the root AGENTS.md if they are not there. Open the PR to main and ask Darsh and Saloni to approve. Do not edit frontend/ or ml/.
````

### Phase 1: Foundations in parallel

#### J2. First migration and demo seed

**Integration gate G1** · Needs J1 · Unblocks J3

**Done when:** The migration is committed and npm run db:seed prints the seeded users, farm, field, soil test and logs.

````text
Read backend/prisma/schema.prisma and backend/AGENTS.md. The schema already has Field.cropVariety, Field.sowingDate and the Recommendation columns for soilHealthImpact, yieldImpact, explanation, weatherSource and inputSnapshot. The SoilTest model (n, p, k, ph, organicCarbon, moisture) is fixed by the problem statement and must not change.
1. Add any @@index the query patterns need.
2. Run npx prisma migrate dev --name init and commit prisma/migrations/ (the repo has none yet).
3. Write prisma/seed.js (wired through package.json "prisma": { "seed": "node prisma/seed.js" }) that upserts a farmer user (password hashed with bcrypt), an agronomist user, one farm, one field with coordinates, sowingDate, cropType (cropVariety null) and growthStage, one soil test and two fertilizer logs. Use createMany or one transaction for batches, never an await inside a per-row loop. Take the values from docs/contract-fixtures/recommend_request.json so the seeded field can produce a recommendation.
4. Add npm scripts db:seed and db:reset (migrate reset --force then seed).
Show me a query printing the seeded rows.
````

#### J3. Authentication with token rotation

**Integration gate G1** · Needs J2 · Unblocks J4, J5, D3

**Done when:** npm test passes the auth tests and you have curl transcripts for register, login, me and refresh.

> Darsh's real login (D3) needs this. Tell him the moment it is on main.

````text
Implement auth per docs/backend-api.md (contract C3):
- controllers/auth.controller.js, routes/auth.routes.js, services/tokenService.js.
- register: zod body (email, password of at least 10 characters, name, role FARMER or AGRONOMIST), bcrypt cost 12, 409 on duplicate email, returns the user (no hash) plus accessToken and refreshToken.
- login: constant-time compare and a generic 401 message ("Invalid email or password").
- access token: JWT, 15 minutes, with sub and role. Refresh token: 48 random bytes stored only as a sha256 in RefreshToken with an expiry. /refresh rotates (deletes the old row, issues a new pair). Reuse of a rotated token deletes all of that user's refresh tokens. /logout deletes the token. GET /auth/me.
- Stricter rate limit on /auth/* (for example 10 per 15 minutes per IP), validate.middleware on every body, auth.middleware requireAuth and requireRole.
- middleware/ownership.js: assertFarmOwner and assertFieldOwner(userId, id) return 404 for other users' resources so existence is not leaked.
- tests/auth.test.js with node:test against a separate database (.env.test with khetgpt_test): register, login, me, refresh rotation, reuse detection, logout, wrong password and duplicate email.
Run npm test and lint. Show me curl transcripts for register, login, me and refresh.
````

#### J4. Thin recommendation slice against the ML mock

**Integration gate G1** · Needs J3, S2 · Integrates with D4 · Unblocks D4

**Done when:** A real curl from login to POST recommendation for the seeded field returns a plan and the row is in Postgres.

> This is the backend half of Gate G1. Announce to Darsh (D4) when it works.

````text
Implement the thin vertical slice for Gate G1. The ML service runs in PREDICT_MODE=mock (Saloni's S2).
1. services/mlService.js: build the request per contract C1 from a plain object, validate the response with zod (the schema mirrors docs/contract-fixtures/recommend_response.json), 5 second timeout, one retry on network errors and 5xx, typed errors (MlUnavailableError and MlInvalidResponseError, both mapped to 502).
2. POST /api/fields/:id/recommendations (auth and ownership): load the field, its latest SoilTest, FertilizerLogs of the last 12 months, weather via services/weatherService.getWeather (Open-Meteo, no key), assemble the C1 payload in snake_case (including variety, sowing_date and weather.source), call ML, persist a Recommendation row (schedule as Json, risk level mapped to the enum, riskReason, soilHealthImpact, yieldImpact, explanation Json, weatherSource, cost into estimatedCost and estimatedSaving, modelVersion, topFactors) and return the C3 Recommendation object in camelCase.
3. If the field has no soil test or no crop, return 409 saying which one is missing.
4. Tests: mlService against the fixtures with a mocked HTTP layer, and a route test with the ML call stubbed.
Run the ML mock locally (uvicorn on 8001 with PREDICT_MODE=mock). Show a real curl transcript from login to POST recommendation for the seeded field, and the row in Postgres.
````

### Phase 2: Real data and real CRUD

#### J5. Farms, fields, soil tests and fertilizer logs

**Integration gate G2** · Needs J3 · Integrates with D5, D6 · Unblocks J6, J7, J8, J13, D5, D6

**Done when:** The passing test list shows owner CRUD works and other users get 404 on every resource.

> Tell Darsh (D5, D6) when merged.

````text
Implement farms, fields, soil tests and fertilizer logs per docs/backend-api.md. For every route: requireAuth, an ownership check through middleware/ownership.js (owner only in v1), zod validation with bounds from one config file (src/config/validation.js: pH 0 to 14, moisture and organicCarbon 0 to 100, N, P and K at least 0. These are sanity limits, agronomy numbers stay in the ML data), pagination on every list (page, limit up to 50, total), and Prisma select or include so there are no N+1 queries.
- PATCH /fields/:id updates cropType, cropVariety, growthStage, sowingDate, coordinates and areaAcres. cropType, cropVariety and growthStage must exist in the reference lists when the ML service is reachable (skip the check, do not fail, when it is not).
- Soil tests: POST creates, GET returns newest first.
- Fertilizer logs: POST and GET; appliedOn cannot be in the future.
Tests: owner CRUD works, another user gets 404 on each resource, invalid bodies get 400 with details. Show me the passing test list.
````

#### J6. Reference data proxy

**Integration gate G2** · Needs J5, S2 · Integrates with R1 · Unblocks J8, D6, D11

**Done when:** GET /api/reference/crops, /soil-ratings and /fertilizers return the ML service's data, cached, with stale fallback.

````text
Implement GET /api/reference/crops (with varieties and stages), /soil-ratings and /fertilizers (contract C2), and an internal seasonalWeather(lat, lng, month) helper that calls the ML service's GET /reference/seasonal-weather for the weather fallback in J7. Call the ML service's GET /reference/*, cache each response in memory for 1 hour, return the stale copy for up to 24 hours if ML is down, and return 503 { error } when there is no copy at all. No crop or rating numbers live in this repo's code. Add a dev-only fallback file backend/config/reference.dev.json that is served only when ML_MODE=offline is set (document it in .env.example) so Darsh can work without the ML container. Tests with mocked ML responses. Tell Darsh and Saloni when merged. Saloni's S2 serves a mock list until Richa's tables (R1) are in.
````

#### J7. Weather with fallback chain, and place-name geocoding

**Integration gate G2** · Needs J5 · Integrates with R7 · Unblocks J8, R7, D5

**Done when:** Weather returns live, cached or seasonal_average with the right source flag when Open-Meteo is blocked, and GET /geocode returns coordinates for a place name.

````text
Read backend/src/services/weatherService.js (Open-Meteo, already switched).
1. GET /api/fields/:id/weather (auth and ownership). It uses the field's latitude and longitude (400 with a clear message if missing) and returns { temperatureC, humidityPct, rainfallMmForecast, source, fetchedAt, stale }. Fallback chain: live Open-Meteo (cache per field for 20 minutes) -> cached value up to 6 hours old (source "cached", stale true) -> seasonal average from J6's seasonalWeather helper (source "seasonal_average", stale true) -> 503 only if all three fail. Extract weather assembly into one function that the recommendation route reuses, so the payload's weather.source is always set.
2. services/geocodeService.js and GET /api/geocode?q=: call the Open-Meteo geocoding API (https://geocoding-api.open-meteo.com/v1/search, no key, count 5, country filter IN by default), require auth, rate limit it, cache results per query for a day, and return [{ name, admin, latitude, longitude }]. Return an empty list, not an error, when nothing matches. The field's pincode stays a plain label and is never used to look up coordinates.
3. Unit tests: the weather keys map one to one to the C1 weather block (temperature_c, humidity_pct, rainfall_mm_forecast, source), each step of the fallback chain, and the geocode mapping. Richa's R7 client produces the same keys, so compare with her. Mock the HTTP layer in tests and show one live call for each service.
````

### Phase 3: Real recommendation

#### J8. Full recommendation orchestration and history

**Integration gate G3** · Needs J5, J6, J7, S6 · Integrates with D7, D9 · Unblocks J9, J10, J11, J12, S6, S7, D7, D8, D9

**Done when:** A real transcript shows a real model_version, the formula inputs and impact texts stored and returned, history ordering, and ML failure mapping all working.

> This is the backend half of Gate G3. Tell Darsh (D7) when it merges.

````text
Complete the recommendation feature for Gate G3, replacing the thin slice from J4:
- The body is optional: { soilTestId?, cropType?, cropVariety?, growthStage? }. Default to the latest soil test and the field's crop, variety and stage.
- The payload includes variety, sowing_date and previous usage per contract v1.0. Weather comes from the fallback-chain function (J7), and weather.source is passed through. If the source is not live, still call ML and return weatherSource and weatherStale: true.
- Persist what is needed to reproduce the result: the request payload snapshot in Recommendation.inputSnapshot (the column exists), modelVersion, explanation (nutrient_balance and formula), soilHealthImpact, yieldImpact, weatherSource and the timestamp.
- Cost mapping: estimatedCost and estimatedSaving (nullable). savingTotal = savingPerAcre times field.areaAcres when both exist.
- History: GET /fields/:id/recommendations paginated newest first; GET /recommendations/:id with an ownership check.
- Double submit guard: return the previous recommendation with 200 if an identical inputSnapshot was stored in the last 30 seconds.
- Error mapping: ML 503 or timeouts give 502 { error: "Recommendation service is unavailable, try again" }; ML 422 gives 400 with the ML detail.
- Point the ML service at PREDICT_MODE=real (Saloni S6) and run the seeded scenario end to end.
Tests for history ordering, ownership, non-live weather, ML failure mapping and the idempotency window. Show me a real transcript with a real model_version.
````

#### J9. Risk check and trends endpoints

**Integration gate G3** · Needs J8, S6 · Integrates with D9, D10, R8 · Unblocks S6, D9, D10

**Done when:** A curl shows a 2x urea dose returning high risk with both impact sentences, and /trends returns three series a chart can draw.

> Two features the problem statement leans on: warning about excessive use before it happens, and showing how soil and usage change over seasons.

````text
Implement two endpoints per docs/backend-api.md, both with auth and ownership checks and zod validation.

1. POST /api/fields/:id/risk-check { plannedApplication: [{ fertilizerType, quantityKgPerAcre }] }: load the field, its latest soil test, weather (J7 chain), crop, variety, stage, sowing date and fertilizer logs, build the ML /risk-score payload (contract C1), call services/mlService.riskScore and return { risk: { level, reason, soilHealthImpact, yieldImpact, overApplicationPct }, nutrientBalance: { n|p|k: { appliedKgHa, recommendedKgHa, ratio } } } in camelCase. Do not store it. fertilizerType must exist in the /reference/fertilizers list. Return 409 if there is no soil test or crop yet.
2. GET /api/fields/:id/trends: return time series for charts: soilTests [{ testedOn, n, p, k, ph, organicCarbon, moisture }], applied [{ month, nitrogenKgAcre, p2o5KgAcre, k2oKgAcre, costInr }] computed from the fertilizer logs with the product nutrient percentages from /reference/fertilizers, and recommendations [{ createdAt, fertilizerType, quantityKgPerAcre, estimatedCost, riskLevel, fertilizerNeededN, fertilizerNeededP, fertilizerNeededK }]. Use one grouped query per series (no N+1), a default window of 24 months, and return empty arrays, not errors, for a new field.
Tests for ownership, validation, the mapping to the ML payload with a stubbed ML call, and the trend aggregation on seeded data. Show me curl transcripts for the 2x-dose risk check and for trends. Tell Darsh (D9, D10) when merged.
````

### Phase 4: Packaging and standout

#### J10. Compose stack and CI (local, no cloud deployment)

**Integration gate G4** · Needs J8, S9 · Pairs with S9 · Unblocks S11

**Done when:** docker compose ps shows every service healthy from a clean clone, and the CI run is green.

````text
Own docker-compose.yml and .github/workflows/ci.yml.
1. Compose: postgres (the healthcheck exists), ml (build ./ml, healthcheck on /health, bind mount ./ml/models_artifacts:/app/models_artifacts:ro to match Saloni's S9, PREDICT_MODE=real), backend (depends_on postgres healthy and ml healthy; runs prisma migrate deploy then node; env DATABASE_URL, ML_SERVICE_URL=http://ml:8001, secrets from backend/.env, CORS_ORIGIN), and an optional frontend service (nginx serving the built app) behind profiles: ["web"]. No secrets in the file. Cloud deployment is out of scope: everything runs locally.
2. docker compose up --build from a clean clone (no node_modules, .env copied from .env.example) must reach all healthy. Document the sequence in the Commands list of AGENTS.md and in .env.example comments.
3. CI: add a backend test job (postgres service, prisma migrate deploy, npm test), make the ml job also run the contract tests, and add a docker build job for backend and ml. Keep the workflow under about 10 minutes and cache npm and pip.
4. Verify with act or by pushing a draft PR and reading the result.
Show me docker compose ps output and the green CI run.
````

#### J11. Security and reliability pass

**Integration gate G4** · Needs J8

**Done when:** An automated ownership matrix test passes, every finding is listed and fixed, and docs/backend-api.md has real transcripts.

````text
Security and reliability pass on backend/**. Checklist: every route is behind requireAuth except /auth/register, /login, /refresh and /health; an automated ownership matrix test (user B against user A's farm, field, soil test, log, recommendation, weather, risk-check and trends) expects 404 everywhere; secrets only through env (grep for hard-coded ones); helmet defaults, a CORS allowlist from env, a body size limit, a request id and structured logs without tokens or passwords; error middleware maps zod to 400, Prisma P2002 to 409, P2025 to 404 and anything else to a generic 500; graceful shutdown (SIGTERM closes the server and Prisma); npm audit --omit=dev reviewed; .env.example complete; docs/backend-api.md re-synced with real curl transcripts for every endpoint. Report every finding and fix.
````

#### J13. Stretch: agronomist regional summary (stretch)

Needs J5

**Done when:** Role gate and k-anonymity tests pass.

````text
Stretch (PRD feature 17): GET /api/admin/regional-summary, AGRONOMIST role only. Return anonymised aggregates per crop and per pincode prefix: number of fields, median recommended versus previous nutrient totals, share at high risk and average estimated saving. Enforce k-anonymity (do not return groups with fewer than 5 fields) and never return user ids or coordinates. Tests for the role gate and the k-anonymity rule. Coordinate with Darsh for the view.
````

### Phase 5: Demo hardening

#### J12. Demo seed and reset

**Integration gate G5** · Needs J8, R11

**Done when:** npm run db:seed:demo and npm run demo:reset work repeatedly, and backend/DEMO.md lists the exact command sequence.

````text
Read docs/demo-scenarios.md and docs/contract-fixtures/demo_scenarios.json (Richa's R11). Extend prisma/seed.js with npm run db:seed:demo: it idempotently recreates the demo farmer, the three scenario fields with soil tests and fertilizer logs, and optionally pre-generates one recommendation for each through the running ML service so History is not empty. Add npm run demo:reset, which resets only the demo user's data. Write backend/DEMO.md: the exact command sequence to bring the stack up with demo data, where the demo credentials come from (.env, never committed), and what to do if the ML service or Open-Meteo is down (ML_MODE fallback and stale weather).
````

## 8. Definition of done

- [ ] Every route requires auth except register, login, refresh and health, and another user's resource always returns 404.
- [ ] The payload to ML and the ML response match docs/api-contract.md, checked by tests on the shared fixtures. The soil schema is untouched.
- [ ] docs/backend-api.md matches real behaviour, with real transcripts.
- [ ] Weather always resolves through live, cached or seasonal average, and says which.
- [ ] docker compose up --build reaches all healthy from a clean clone. CI is green.
- [ ] No secrets in git. .env.example is complete.
- [ ] Batch writes only: no await inside per-row loops. Every list is paginated.
- [ ] Weather and ML failures degrade with clear messages and never crash the process.

## 9. Daily sync questions

- Saloni: did C1 change? Is real mode ready, or do I stay on the mock?
- Darsh: which endpoint or field are you waiting on? Did any response shape surprise you?
- Richa: are the demo scenarios ready for seeding? Do your weather keys match mine?

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
