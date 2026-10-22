# AgroBloom

Fertilizer planning for Punjab farms. AgroBloom reads a field's soil test, crop, growth stage, earlier fertilizer use and local weather, then gives a dose per nutrient, the product to buy, and a dated application schedule. It shows how each dose was worked out and warns when a plan would over- or under-apply.

Built for SIH PSAI01, Sustainable Fertilizer Usage Optimizer. The project was first called KhetGPT, so some internal names (the `khetgpt` database, the demo account's email) still use that name.

> A research prototype built from published Punjab Agricultural University and ICAR-IISS tables. It is not extension advice. Check final rates with your district Krishi Vigyan Kendra or Block Agriculture Officer.

## What it does

- **A dose you can check.** Every recommendation is `standard published dose + soil-test adjustment - credit for earlier applications`, and the screen shows each of the three numbers and where it came from.
- **Plans from the field's own history.** The growth stage follows the sowing date. Phosphorus and potassium applied earlier count for the whole season. Nitrogen credit is halved when heavy rain followed the application. Earlier soil tests are compared with the latest one, and a sudden jump or a falling organic carbon is flagged. The rain factor and thresholds are team assumptions, listed in `ml/data/external/agronomy_rules.yaml`, and need an agronomist's sign-off.
- **Several crops on one farm.** A farm card carries a tab per crop, each with its own sowing date, stage, plan and schedule.
- **Soil test in, however you have it.** Type the six values, or scan a Soil Health Card from a photo, camera, PDF, Word file or HEIC image (OCR runs in the browser). Values the scan is unsure about are left for you to confirm.
- **Soil test freshness.** A test is flagged for retest when the crop has moved to a later stage, when it is more than a month older than the sowing date, or when it is over a year old.
- **A dated schedule.** One line per crop stage with the apply-by date, held back when heavy rain is forecast, with a printable slip for all fields.
- **Risk check.** Type the dose you were planning and see whether it is too much, too little or about right, with the effect on soil health and yield.
- **Weather and prices.** Weather comes from Open-Meteo (live, then cached, then a seasonal average), and a failed weather call never blocks a recommendation.

## How the pieces fit

```
Frontend (React + Vite)  --REST-->  Backend (Express + Prisma + Postgres)  --REST-->  ML service (FastAPI)
                                            |                                              |
                                            v                                              v
                                 Open-Meteo weather, geocoding              Reference tables in ml/data/external
```

- The frontend only talks to the backend. The ML service never touches the database.
- The backend owns accounts, fields, soil tests, logs and saved plans, and builds the request for the ML service.
- The ML service is stateless: the dose engine, product choice, schedule, risk and cost, with a small product classifier whose guess is shown but never overrides the rule-based plan.

## Run it locally

### With Docker (everything at once)

```bash
cp backend/.env.example backend/.env
# put two real secrets into backend/.env (JWT_ACCESS_SECRET and JWT_REFRESH_SECRET):
openssl rand -hex 32
openssl rand -hex 32
# for the demo account, also set DEMO_FARMER_EMAIL and DEMO_FARMER_PASSWORD in backend/.env

docker compose up --build            # Postgres, ML service, backend
docker compose --profile web up --build   # the same, plus the website on :5173
docker compose exec backend npm run db:seed:demo   # three demo farms with plans
```

| Service | URL |
|---|---|
| Website (`--profile web`) | http://localhost:5173 |
| Backend API | http://localhost:4000/api |
| ML service | http://localhost:8001 (`/health`, `/docs`) |
| Postgres | localhost:5432 (user, password and database all `khetgpt`) |

The backend runs its database migrations every time it starts. The ML service reports `degraded` until a model has been trained, and still answers every request from its rule-based calculator.

### Without Docker

Run each service in its own terminal. You need Node 22, Python 3.11 and Postgres 16.

```bash
# ML service
cd ml && pip install -r requirements.txt
python -m src.models.train                    # optional: trains the product classifier
uvicorn src.api.main:app --reload --port 8001

# Backend (create the database and set DATABASE_URL in backend/.env first)
cd backend && npm install
npx prisma migrate deploy && npm run db:seed:demo
npm run dev                                   # http://localhost:4000

# Frontend
cd frontend && npm install
npm run dev                                   # http://localhost:5173
```

### The demo account

`npm run db:seed:demo` creates the demo farmer from `DEMO_FARMER_EMAIL` and `DEMO_FARMER_PASSWORD`, plus three farms (wheat over-application, rice with a rain hold, and a maize field that looks healthy but is over-applied), each with a soil test, fertilizer log and saved plan. The landing page's **Demo dashboard** button signs in with `kisan@khetgpt.in` / `password123` by default; set `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD` at build time to use others. These are sample-data credentials that ship in the website bundle, so never point them at a real account. The walkthrough is in [`docs/demo-scenarios.md`](docs/demo-scenarios.md).

## Configuration

Each service reads its own `.env`. Nothing secret is committed; add any new variable to that service's `.env.example`.

| Service | Variable | Purpose |
|---|---|---|
| backend | `DATABASE_URL` | Postgres connection string |
| backend | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing, 32+ random bytes each |
| backend | `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Token lifetimes (`15m`, `7d`) |
| backend | `CORS_ORIGIN` | Allowed website origin, or a comma-separated list |
| backend | `ML_SERVICE_URL`, `ML_MODE` | Where the ML service is, or `offline` to use canned reference data |
| backend | `WEATHER_SERVICE_URL`, `GEOCODE_SERVICE_URL` | Open-Meteo endpoints, no key needed |
| backend | `DEMO_FARMER_EMAIL`, `DEMO_FARMER_PASSWORD` | Used only by the demo seed |
| ml | `PREDICT_MODE`, `MODEL_ARTIFACT_DIR`, `DATA_EXTERNAL_DIR` | Serving mode and data locations |
| frontend | `VITE_API_BASE_URL` | Backend URL, baked in at build time |
| frontend | `VITE_USE_MOCK` | `true` runs the website on built-in sample data with no backend |
| frontend | `VITE_DEMO_EMAIL`, `VITE_DEMO_PASSWORD` | Optional override for the Demo dashboard button |

## Tests

```bash
cd ml && python -m pytest -q          # 343 tests: dose engine, history, risk, API contract
cd backend && npm test                # 51 tests, against the database in DATABASE_URL (it clears the tables first)
cd frontend && npm test               # 24 tests: soil-test rules, report parser, slip totals
cd frontend && npm run lint && npm run build
```

Do not run the backend tests against a database that holds data you want to keep. CI (`.github/workflows/ci.yml`) runs lint, build and tests for each service (the frontend unit tests are run locally).

## Where things live

```
frontend/   React 18, Vite, Tailwind, Zustand. The opening scene, landing, dashboard, soil test, plan, schedule, history
backend/    Express, Prisma, JWT auth, Postgres. Routes in src/routes, logic in src/controllers and src/services
ml/         FastAPI. src/engine (dose, schedule, history), src/degradation (risk), src/models, src/weather, data/external
docs/       Requirements, architecture, the two API contracts, data dictionary, demo scenarios, deployment
```

Region, crop, price and threshold numbers live in data files under `ml/data/external/`, each with its source, never in application code. [`ml/data/README.md`](ml/data/README.md) lists the datasets.

## Data and sources

- Standard doses and split schedules: Punjab Agricultural University, Package of Practices.
- Soil-test adjustments and Soil Test Crop Response equations: ICAR-IISS.
- Soil profile reference: ISRIC SoTWIS (Indo-Gangetic Plain).
- Weather and geocoding: Open-Meteo.

Only crops with a complete published dose table are offered (wheat, rice, maize, cotton, sugarcane, chickpea, barley). The product classifier was trained on synthetic data because real labelled data was not available, which is why the rule-based plan always wins over it. Cells still waiting on a published value are marked `TODO(data)` in the reference tables and are never guessed.

## Deploying

[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has the host setup, the environment variables each service needs and how to seed the demo data. A [`render.yaml`](render.yaml) blueprint is included. The default way to run the project is still the Docker setup above.

## Documentation

- [`docs/PRD.md`](docs/PRD.md): requirements and scope
- [`docs/FEATURES.md`](docs/FEATURES.md): prioritised features
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): stack, structure, decisions
- [`docs/api-contract.md`](docs/api-contract.md): backend to ML service
- [`docs/backend-api.md`](docs/backend-api.md): frontend to backend
- [`docs/data-dictionary.md`](docs/data-dictionary.md): every field and unit
- [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) and [`docs/TEAM_ASSIGNMENTS.md`](docs/TEAM_ASSIGNMENTS.md): how the team works
- [`AGENTS.md`](AGENTS.md): shared context for AI coding agents

## Team

| Person | Area |
|---|---|
| Saloni | ML: dose engine, model, FastAPI serving |
| Richa | ML: datasets, reference tables, weather, risk analyzer, evaluation |
| Josh | Backend: auth, database, API, compose and CI |
| Darsh | Frontend: interface, 3D and animation |

Commit messages read `<area>: <what changed>`, for example `ml: add NPK dose calculator`. Contract changes (`docs/api-contract.md`, `docs/backend-api.md`) go through a docs-only pull request that both owners approve.
