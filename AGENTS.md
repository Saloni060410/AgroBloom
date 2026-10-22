# AGENTS.md — AgroBloom (formerly KhetGPT)

Canonical context for any AI coding agent (Claude Code, Antigravity/Gemini CLI, Codex, Cursor, etc.) working in this repo. `CLAUDE.md` and `GEMINI.md` at the root just point here. This file is the one to keep up to date.

## What this project is

AgroBloom (the product name; some internal identifiers, such as the `khetgpt` database, still carry the old name KhetGPT) is a data-driven fertilizer optimization app (PSAI01: Sustainable Fertilizer Usage Optimizer). It recommends fertilizer type, quantity and a dated application schedule from soil health, crop type, growth stage, previous fertilizer usage and local weather. It flags the risk of over- and under-application and explains the impact on soil health and yield. Full requirements: `docs/PRD.md`. Prioritised features: `docs/FEATURES.md`.

## Repo layout (see docs/ARCHITECTURE.md for the full tree)

- `frontend/`: React (Vite, JS) + React Three Fiber/drei + GSAP + Tailwind + Zustand. Owner: Darsh.
- `backend/`: Node.js/Express + PostgreSQL (Prisma) + JWT auth. Owner: Josh.
- `ml/`: Python + FastAPI. Stateless. Owners: Saloni (`src/api`, `src/engine`, `src/models`) and Richa (`data/`, `src/data_pipeline`, `src/weather`, `src/degradation`, `src/evaluation`).
- `docs/`: PRD, FEATURES, ARCHITECTURE, GIT_WORKFLOW, TEAM_ASSIGNMENTS, `api-contract.md` (backend to ML), `backend-api.md` (frontend to backend), `data-dictionary.md`, `contract-fixtures/`, `prompt-packs/` (one step-by-step pack per person).

Data flow: `frontend -> backend -> ml`. The frontend never calls the ML service. The ML service never touches the database.

Each of `frontend/`, `backend/`, `ml/` has its own `AGENTS.md`. An agent working inside one of those folders should read the nearer file too.

## Fixed decisions (do not change without the team)

- **The soil schema is fixed by the problem statement:** `n`, `p`, `k`, `ph`, `organic_carbon`, `moisture` (`organicCarbon` in the backend and frontend). Never add, remove or rename soil fields.
- The core method is a transparent soil-test-based dose: fertilizer needed = standard dose for the crop + soil-test adjustment - credit for recent applications. The standard dose is the published dose for the crop. The adjustment comes from published soil-test rules or an STCR equation where one exists. Every recommendation shows those inputs.
- ML endpoints: `POST /recommend`, `POST /risk-score`, `GET /health`, `GET /reference/*`.
- Weather and geocoding come from Open-Meteo (no key). Live, then cached, then a seasonal-average fallback.
- Crop variety is optional and only exists if Richa's chosen data has varieties.
- The demo runs locally with docker-compose. A hosted deployment is optional and documented in `docs/DEPLOYMENT.md` (with a `render.yaml` blueprint); it does not change how the services are built.

## Cross-cutting rules

- Stay inside your area's folder. Cross-folder edits are the most common source of merge conflicts. Flag the need in the contract doc or ask the owner.
- The contracts (`docs/api-contract.md`, `docs/backend-api.md`) are the source of truth. Change them only through a docs-only PR to `main` that both owners approve, then update code and fixtures in the same change.
- Never commit secrets. Each service has its own `.env` (never committed). Add new variables to that service's `.env.example`.
- Region, crop, price and threshold numbers belong in data or config files (`ml/data/external/`, a backend config), never hardcoded in application logic. Every value has a source.
- Recommendations must be explainable and reproducible. Keep `model_version` in every response.
- Weather and reference calls degrade gracefully. They must not hard-fail a recommendation.
- Commit messages: `<area>: <what changed>`, for example `ml: add NPK dose calculator`. No AI co-author trailers and no "Generated with" lines in commits or PR descriptions.

## Commands

Run from inside the relevant service folder.

```bash
# frontend
npm install && npm run dev

# backend
npm install && npx prisma migrate dev && npm run dev

# ml
pip install -r requirements.txt
uvicorn src.api.main:app --reload --port 8001
```

### One-command local stack (docker-compose)

```bash
# from the repo root, on a clean clone:
cp backend/.env.example backend/.env
# generate two real secrets and paste them into backend/.env:
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
cp ml/.env.example ml/.env   # optional -- PREDICT_MODE=real is already the default

docker compose up --build
```

Brings up Postgres, ml and backend, healthy, from nothing but `docker compose up` --
`backend/Dockerfile`'s own entrypoint runs `prisma migrate deploy` on every container start, so
migrations are never a separate manual step here. `ml`'s
`/health` reports `degraded` (not unhealthy -- the stack still comes up) until a model has been
trained locally (`python -m src.models.train`, bind-mounted in read-only via
`./ml/models_artifacts`) -- the calculator alone still answers `/recommend` correctly without
one. Add `--profile web` to also build and serve the frontend (`localhost:5173`, nginx serving
the Vite build) -- most local frontend development instead runs `npm run dev` directly against
the compose backend, which reloads faster than a container rebuild.

## Team

| Person | Area |
|---|---|
| Saloni | AI/ML: dose engine, model, FastAPI serving |
| Richa | AI/ML: datasets, reference tables, weather, risk analyzer, evaluation |
| Josh | Backend: auth, database, API, compose and CI |
| Darsh | Frontend: UI, 3D, animation |

Work breakdown: `docs/TEAM_ASSIGNMENTS.md` and the packs in `docs/prompt-packs/`.
