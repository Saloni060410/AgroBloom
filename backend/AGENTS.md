# AGENTS.md — backend

Read the root `AGENTS.md` first. This file is backend-only conventions. Owner: **Josh**.

## Stack

- Node.js + Express.
- PostgreSQL via Prisma (`prisma/schema.prisma` is the source of truth for the schema —
  run a migration, don't hand-edit the database).
- Auth: JWT (short-lived access token + refresh token), passwords hashed with bcrypt.
- Calls out to the ML service over REST — never import Python or reimplement ML logic here.

## Folder map

```
src/
├── server.js / app.js
├── config/       # db.js, env.js — all env var reads happen here, nowhere else
├── models/       # Prisma-generated + any thin domain wrappers: User, Farm, Field,
│                 # SoilTest, Recommendation, FertilizerLog
├── routes/       # auth, farm, field, recommendation, weather, geocode, trends, reference
├── controllers/   # request handling per route
├── middleware/    # auth.middleware.js, error.middleware.js, validate.middleware.js
├── services/      # mlService.js (POST /recommend, /risk-score), weatherService.js (Open-Meteo), geocodeService.js
└── utils/
```

## Conventions

- The soil schema is fixed by the problem statement (`n`, `p`, `k`, `ph`, `organicCarbon`, `moisture`). Never change it.
- Location: coordinates are canonical. Search by place name goes through `services/geocodeService.js` (Open-Meteo geocoding). `pincode` is a label only.
- Weather: live, then cached (up to 6 hours), then the ML service's seasonal average. Report the `source`.

- The request/response shape you send to and expect from the ML service (`services/mlService.js`)
  must match `docs/api-contract.md` and `docs/contract-fixtures/` exactly. If the shape needs to change, update that doc in
  the same PR — Saloni builds against it independently.
- Validate all incoming request bodies (a `validate.middleware.js` schema per route) before they
  hit a controller — don't trust frontend input.
- Every route that touches user/farm data checks the authenticated user owns that resource.
- Migrations: `npx prisma migrate dev --name <what_changed>`, committed alongside the schema change.
- Don't call the weather API or the ML service directly from a controller — always go through
  `services/`, so retries/timeouts/mocking live in one place.

## Commands

```bash
npm install
npx prisma migrate dev
npm run dev
```

`docker-compose up` at the repo root starts Postgres + this service + the ML service together.

### Tests use their own database

`npm test` runs on `<your database>_test` (for example `khetgpt_test`), never on the database the app uses:
the tests empty the users, farms and fields tables, which used to wipe the demo farmer and any fields
created in the running app. `scripts/run-tests.mjs` derives the name from `DATABASE_URL`, applies the
migrations to it, and runs the tests there. If the database user may not create databases, create it once
with an admin account: `createdb -O <user> khetgpt_test`. In CI (`CI=true`) `DATABASE_URL` is already a
throwaway database and is used as it is.
