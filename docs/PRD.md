# KhetGPT — Product Requirements Document

Smart India Hackathon · PSAI01 — Sustainable Fertilizer Usage Optimizer

Sep 26, 2026 · Owner: @saloni

## 1. Problem Statement & Objectives

**Background (from the PS)** Excessive and improper fertilizer use degrades soil health and depresses long-term yields, directly cutting farmer income. Most farmers apply fertilizer by habit or dealer advice rather than by what the soil and crop actually need.

**What we're building** KhetGPT is a data-driven fertilizer optimization app that recommends the right fertilizer type, quantity, and timing for a specific field, based on soil health, crop type, growth stage, prior fertilizer usage, and local weather. It surfaces a simple application schedule and flags the yield/soil-health risk of over- or under-application.

**Objectives**

- Cut unnecessary fertilizer spend for the farmer without hurting yield.
- Reduce nutrient runoff and long-term soil degradation.
- Make the recommendation legible to a non-technical user (schedule + plain-language reasoning), not just a number.
- Ship a working end-to-end demo (soil input → recommendation → schedule) for the hackathon evaluation.

**Non-goals (for this build)**

- Not a full farm-management ERP.
- Not a hardware/IoT soil-sensor product (manual/soil-health-card input for v1; sensor ingestion is a stretch goal).
- Not attempting nationwide crop coverage — pick 4–6 major crops (e.g. wheat, rice, cotton, sugarcane, maize, pulses) and do them well.

## 2. Scope

### Functional Requirements

- FR1: User can register/log in (farmer or agronomist role).
- FR2: User can create a Farm and one or more Fields under it.
- FR3: User can enter soil health parameters per field (N, P, K, pH, organic carbon, moisture). This soil schema is fixed by the problem statement and never changes. Manual entry only.
- FR4: User can select crop type, optional variety (only where our data has varieties), sowing date and current growth stage.
- FR5: User can log previous fertilizer usage for that field.
- FR6: System fetches current + short-range weather forecast for the field's location.
- FR7: System returns a fertilizer recommendation computed from the standard dose for the crop plus a soil-test adjustment: type(s), quantity (kg/acre), and a split-application schedule with dates.
- FR8: System shows an over- and under-application risk indicator with the plain-language impact on soil health and crop productivity.
- FR9: User can view recommendation history for a field.
- FR10: System shows the estimated cost and cost-saving vs. the farmer's logged previous usage.
- FR11: User can print the schedule or save it as PDF.
- FR12: User can enter a planned dose and get the risk warning before applying it.
- FR13: Location is set by browser location, place-name search or manual latitude and longitude.

### Non-Functional Requirements

- NFR1: Recommendation response time under 3s for the ML call (excluding cold weather-API calls).
- NFR2: Works on low-end Android devices / patchy connectivity (lightweight frontend bundle, graceful degradation).
- NFR3: Model and rule tables versioned so recommendations are reproducible and auditable.
- NFR7: Every recommendation shows its inputs (standard dose, soil adjustment, credit), not only a number.
- NFR8: Weather degrades gracefully: live, then cached, then a seasonal average.
- NFR4: Auth tokens (JWT) expire and refresh; passwords hashed (bcrypt/argon2).
- NFR5: Region/crop/fertilizer reference data kept in config/data files, not hardcoded, so the team can extend crop coverage without code changes.
- NFR6: Codebase split cleanly by service (frontend / backend / ml) so all 4 people can work in parallel without merge conflicts.

## 3. Tech Stack

### Frontend — owned by Darsh

| Layer | Choice |
| --- | --- |
| Build tool | Vite (React + JavaScript, no TS) |
| UI framework | React 18 |
| 3D / visualization | Three.js via `@react-three/fiber`, helpers via `@react-three/drei` |
| Animation | GSAP + `@gsap/react` (`useGSAP` hook) |
| Styling | Tailwind CSS |
| State management | Zustand |
| Icons | `lucide-react` |
| HTTP | `axios` |

### Backend — owned by Josh

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js + Express | Fast to stand up; team already knows JS from the frontend stack |
| Database | PostgreSQL | Relational data (users, farms, fields, soil tests, recommendation logs) benefits from real schema + relations |
| ORM | Prisma | Type-safe queries, easy migrations for a short build window |
| Auth | JWT (access + refresh) + bcrypt | Simple, no external dependency needed |
| Inter-service call | REST (JSON) to the ML service | Keeps ML swappable / independently deployable |

### AI/ML — owned by Saloni & Richa

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Python 3.11+ | Standard for the ML ecosystem |
| Data handling | pandas, numpy | Cleaning / feature engineering |
| Core engine | Rule-based NPK dose calculator (standard dose + soil-test adjustment, STCR where available) | Transparent, explainable, built on published doses the team can source |
| Modeling | scikit-learn + XGBoost | Refines the product choice on top of the engine; easy to explain via feature importance |
| Model serving | FastAPI | Async, typed request/response schemas (Pydantic), easy to containerize |
| Weather data | Open-Meteo API | Free, no API key, current + forecast (non-commercial use) |
| Model persistence | joblib | Simple artifact save/load |
| Notebooks | Jupyter | EDA and experiment tracking |

### Infra / cross-cutting

- Docker + docker-compose to run backend + ML service + Postgres together locally. Cloud deployment is out of scope.
- GitHub Actions for basic lint/test CI on PRs into main.
- `.env` files per service, never committed.

> This is the proposed stack — swap anything the team already has stronger footing in (e.g. Mongo instead of Postgres). The important constraint is the three-service boundary (frontend / backend / ml) so work doesn't collide.

## 4. System Architecture

```
┌──────────────────────┐  HTTPS  ┌───────────────────────┐  REST  ┌────────────────────────┐
│       FRONTEND        │────────▶│        BACKEND         │───────▶│      ML SERVICE         │
│  React + R3F + GSAP    │◀───────│  Node/Express + Auth   │◀──────│  FastAPI + XGBoost      │
│  Zustand + Tailwind    │         │  PostgreSQL (Prisma)   │        │  scikit-learn model     │
└──────────────────────┘         └───────────┬───────────┘        └───────────┬────────────┘
                                              │                                │
                                              ▼                                ▼
                                   Users / Farms / Fields /              Weather API
                                   SoilTests / Recommendations           (Open-Meteo)
                                   (Postgres)
```

**Flow:** Farmer enters soil, crop, stage, sowing date and previous usage in the frontend -> backend persists it, fetches weather for the field's coordinates and calls the ML service with the assembled payload -> ML service computes the nutrient dose from the soil test, picks products, dates a split schedule, scores risk and cost, and returns everything with the formula inputs and a model version -> backend stores the recommendation and returns it -> frontend renders the schedule, risk indicator, cost saving and reasons (and the 3D soil-health visualization).

The ML service is a separate deployable unit on purpose, so Saloni/Richa can iterate on the model without touching the backend, and Josh can mock its response contract early and build against that mock while the model is still being trained.

## 5. Features

### Must-have (directly from the PS, MVP)

1. Soil health input (N, P, K, pH, organic carbon, moisture)
2. Crop type, optional variety, sowing date and growth-stage selection
3. Weather integration (current + forecast, by field location, with fallback)
4. Fertilizer type + quantity recommendation from the standard dose plus soil-test adjustment
5. Application schedule (what, how much, when, including split doses)
6. Over-/under-fertilization warning with soil-health and yield impact
7. Previous fertilizer usage log, used in every later recommendation

### Should-have (strengthens the PS ask)

8. Cost estimate + savings vs. the farmer's logged previous usage
9. Recommendation history and nutrient trends per field
10. Plain-language "why this recommendation" with the dose numbers
11. Printable schedule and PDF
12. "Check my own dose" what-if risk warning
13. Hindi/regional-language UI toggle

### Could-have (differentiators, if time allows)

14. 3D interactive soil/field visualization (React Three Fiber), animated with GSAP on state change
15. Offline-friendly / low-data mode (cached last recommendation)
16. Map field picker
17. Voice input for soil/crop entry (regional-language speech-to-text)
18. "KhetGPT assistant" Q&A on the recommendation
19. Agronomist/admin view with anonymised regional summaries

**Recommendation:** build 1-7 solid first, since that is what the PS grades. Then 8-13, which directly support the PS goals (cost, warning, real users). Use #14 as the single standout differentiator. Do not spread thin across many could-haves.

## 6. Data Sources & Datasets

Richa finds, judges and chooses the datasets herself, using the criteria in her prompt pack (relevance to our crops, label type, units, size and honesty, licence, row independence). Every dataset is recorded in `ml/data/README.md` with URL, licence, date, hash, rows, columns and units. Anything paid, unlicensed or of unclear origin is rejected. Synthetic data is allowed only if it is labelled as synthetic wherever it is used.

Reference tables the engine needs (all in `ml/data/external/`, every value with a source):

- **Reference doses:** the published standard dose (kg/ha of N, P2O5, K2O) per crop, irrigation type and, where the data has varieties, per variety (`generic` is the fallback). ICAR and state agriculture university sources such as the PAU Package of Practices.
- **Soil-test adjustments:** published rules that raise or lower the dose by soil rating (for example extra potash on low-K soil), and STCR targeted-yield equations where a published one exists for the crop and zone.
- **Use efficiency per crop and nutrient:** only used to credit recent applications.
- **Split schedules and growth stages** per crop.
- **Fertilizer products:** nutrient content and current retail price with date and source.
- **Soil test ratings:** the low and high cut-offs Soil Health Cards use.
- **Weather:** Open-Meteo forecast (current + 5-day) by lat/long, and a seasonal-average fallback built from Open-Meteo historical data.

Keep raw files out of git (large or licensed). See `ml/data/README.md`.

## 7. Repository & File Structure

Monorepo, one service per top-level folder so each person's work stays isolated. The full tree is in `docs/ARCHITECTURE.md`.

```
KhetGPT/
├── AGENTS.md, CLAUDE.md, GEMINI.md, README.md
├── docker-compose.yml, .gitignore, .github/workflows/ci.yml
├── docs/                    PRD, FEATURES, ARCHITECTURE, GIT_WORKFLOW, TEAM_ASSIGNMENTS,
│                            api-contract, backend-api, data-dictionary, contract-fixtures/, prompt-packs/
├── frontend/                DARSH   src/{components/{ui,layout,forms,three,charts}, scenes, animations,
│                                    pages, store, services, hooks, utils, styles}
├── backend/                 JOSH    prisma/schema.prisma, src/{config, routes, controllers, middleware, services, utils}
└── ml/                      SALONI + RICHA
    ├── data/{raw,processed,external}/, notebooks/
    └── src/
        ├── api/             SALONI   /recommend, /risk-score, /health, /reference/*
        ├── engine/          SALONI   npk_calculator.py, recommendation_engine.py
        ├── models/          SALONI   train.py, fertilizer_model.py, model_registry/
        ├── degradation/     RICHA    risk_analyzer.py
        ├── data_pipeline/   RICHA    ingest.py, clean.py, feature_engineering.py, soil_data_loader.py
        ├── weather/         RICHA    weather_client.py
        └── evaluation/      RICHA    metrics.py, explainability.py
```

**Why AGENTS.md at the root, plus thin CLAUDE.md/GEMINI.md:** Claude Code auto-loads `CLAUDE.md`, Antigravity/Gemini CLI auto-loads `GEMINI.md`, and both point to `AGENTS.md`, which holds the real context. Each service folder also has its own small `AGENTS.md`.

## 8. Git Branching Workflow

`main` stays deployable/demo-ready at all times. Four long-lived feature branches, one per person, merged back via PR once a chunk of work is stable:

| Branch | Owner | Scope |
| --- | --- | --- |
| `feature/saloni-ml-core` | Saloni | `ml/src/api`, `ml/src/engine`, `ml/src/models` |
| `feature/richa-ml-data` | Richa | `ml/data`, `ml/src/data_pipeline`, `ml/src/weather`, `ml/src/degradation`, `ml/src/evaluation` |
| `feature/josh-backend` | Josh | `backend/**` |
| `feature/darsh-frontend` | Darsh | `frontend/**` |

**One-time setup** (any one of you, from the repo root):

```bash
git clone https://github.com/Saloni060410/AgroBloom.git
cd AgroBloom

git checkout -b feature/saloni-ml-core   && git push -u origin feature/saloni-ml-core
git checkout main
git checkout -b feature/richa-ml-data    && git push -u origin feature/richa-ml-data
git checkout main
git checkout -b feature/josh-backend     && git push -u origin feature/josh-backend
git checkout main
git checkout -b feature/darsh-frontend   && git push -u origin feature/darsh-frontend
git checkout main
```

I can't push to your GitHub myself (no credentials to it), so one of you runs this once — after that everyone just checks out their own branch.

**Day to day, on your own branch:**

```bash
git checkout feature/<your-branch>
git pull origin main --rebase   # pull in what's merged before you start
# ... work, commit ...
git push origin feature/<your-branch>
```

**Merging into main:** open a PR from your branch once a feature works end-to-end (not mid-change); at least one other teammate reviews before merge, since everyone's code has to run together for the demo. Rebase onto main before opening the PR if main has moved.

**Avoiding overlap:** folders are owned per-branch (see table above and §9), so two branches almost never touch the same file. The shared surfaces are the contract docs (`docs/api-contract.md`, `docs/backend-api.md`) and `ml/requirements.txt`. Contracts change only through a docs-only PR to `main` that both owners approve. Full workflow: `docs/GIT_WORKFLOW.md`.

## 9. Team & Work Division

| Person | Focus | Owns (files/folders) | Key deliverables |
| --- | --- | --- | --- |
| **Saloni** | AI/ML: engine, model, serving | `ml/src/engine/*`, `ml/src/models/*`, `ml/src/api/*`, model card | NPK dose engine, dated schedule, cost, product model, `/recommend` and `/risk-score`, `docs/api-contract.md` (with Josh) |
| **Richa** | AI/ML: data, weather, risk, evaluation | `ml/data/*`, `ml/src/data_pipeline/*`, `ml/src/weather/*`, `ml/src/degradation/*`, `ml/src/evaluation/*` | Chosen and validated datasets, sourced reference tables, weather client, risk analyzer, explanations, metrics |
| **Josh** | Backend: auth, DB, API, infra | `backend/**`, `docker-compose.yml`, `.github/workflows/` | Auth, Prisma schema, REST routes, weather and geocoding, recommendation orchestration, trends, compose and CI |
| **Darsh** | Frontend: UI, 3D, animation | `frontend/**` | All pages and forms, stores, API layer, schedule and PDF view, 3D visualization, Hindi toggle. Full design freedom within the API and basics |

**Shared/coordination points (don't build in isolation):**

- **Josh and Saloni** agree on `docs/api-contract.md` on day 1 and build against `docs/contract-fixtures/`.
- **Darsh and Josh** agree on `docs/backend-api.md` the same way. Darsh works against a mock first.
- **Saloni and Richa** split by pipeline stage. Richa hands off validated tables, the feature module, the risk analyzer and explanation templates. Saloni's engine consumes them. The rule-trace and explain() interface (C6) is agreed before either merges.

The step-by-step packs, co-requisites and integration gates are in `docs/prompt-packs/`.

## 10. Success Metrics & Evaluation Criteria

- **Engine:** recommended nutrient totals match an independent recomputation of the dose formula within the tolerance in `agronomy_rules.yaml`, checked by an automated sanity test over every crop and soil combination.
- **Model:** the product classifier is reported against baselines with confidence intervals on a held-out test split, and its limits are stated honestly (the public datasets are small).
- **Product:** end-to-end demo runs (signup → soil input → recommendation → schedule) without manual intervention.
- **Impact framing for judges:** estimated % reduction in fertilizer over-application and estimated cost saving per acre, shown quantitatively on the recommendation screen — this maps directly to the PS's stated goal of reducing input cost, preventing soil degradation, and improving farmer income.
- **UX:** a non-technical user can go from soil input to an understandable schedule in under 2 minutes.

## 11. Risks & Open Questions

- **Data quality/coverage:** public datasets may not cover every crop/region the team wants to demo — mitigate by scoping to 4–6 well-covered crops (see §1 non-goals).
- **Weather API availability:** Open-Meteo needs no key but is free for non-commercial use only, so cache responses per field and confirm the terms before any commercial launch.
- **Model ⇄ backend contract drift:** locked down by writing `docs/api-contract.md` first (see §9).
- **Time split for the AI/ML pair:** Saloni and Richa's work is sequential (data → model), not parallel by default — start Richa's pipeline work immediately so Saloni isn't blocked.
- **Open question:** confirm target crops and target region (for soil-norm data) with the team before Richa starts data collection.
- **Decided:** Postgres for the backend. **Decided:** soil schema is fixed. **Decided:** no cloud deployment. **Decided:** risk analysis sits with Richa.
