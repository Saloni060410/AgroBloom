# API Contract: Frontend to Backend (v1.0)

Owned jointly by **Josh** (backend) and **Darsh** (frontend). Contract C3 in the team's shared
vocabulary. Written from the actual implemented routes/controllers/Prisma schema, verified
directly — real curl transcripts against the full `docker compose` stack (real Postgres, real
ML service, real Open-Meteo weather/geocode), re-run 2026-09-28 during a security/reliability
pass over `backend/**` (see "Security and reliability pass" below), not assumed or hand-written.
Every JSON block below is an actual captured response from that run; only JWTs are shortened
(`<jwt>`) for readability, and every id is a real UUID from that run (a later run will produce
different ones, the shapes won't change).

## How this maps to the ML contract (`docs/api-contract.md`, C1)

The backend calls the ML service (`src/services/mlService.js`) and re-shapes its snake_case
response into the camelCase `Recommendation` object below, stored in Postgres
(`prisma/schema.prisma`):

| ML contract (C1) | Backend (`Recommendation`) |
|---|---|
| `cost.estimated_cost_inr_per_acre` | `estimatedCost` |
| `cost.saving_inr_per_acre` | `estimatedSaving` |
| `risk.level` | `riskLevel` (`LOW`\|`MEDIUM`\|`HIGH`, uppercased) |
| `risk.reason` | `riskReason` |
| `risk.soil_health_impact` | `soilHealthImpact` |
| `risk.yield_impact` | `yieldImpact` |
| `explanation.nutrient_balance`, `explanation.formula` | inside the `explanation` Json column, as returned by the ML service |
| `recommendation.schedule` | `schedule` (Json column) |
| `weather.source` | `weatherSource` |
| `explanation.top_factors` | `topFactors` (`String[]`) |
| `model_version` | `modelVersion` |
| request `variety`, `sowing_date` | `Field.cropVariety`, `Field.sowingDate` (already on the schema; sourced from the field unless overridden per-request) |

The soil schema (`n`, `p`, `k`, `ph`, `organicCarbon`, `moisture`) is fixed by the problem
statement and is identical here to the ML contract's `soil` object — never renamed, never
extended.

**Verified gap, not previously documented:** the mapping table above is only partially true.
`topFactors` (top-level) is genuinely camelCase, but `explanation` itself is stored and returned
**as the ML service's own raw response** — `explanation.nutrient_balance`, `explanation.formula`,
`explanation.data_notes` and (redundantly) `explanation.top_factors` all stay **snake_case**, and
that last one duplicates the top-level `topFactors` verbatim. `schedule`'s array items are the
same story: `stage`/`fertilizer_type`/`quantity_kg_per_acre`/`apply_by`/`timing_note`, not
`fertilizerType`/`quantityKgPerAcre`/`applyBy`/`timingNote` as a prior draft of this doc claimed
without having actually checked. See the real `POST /fields/:id/recommendations` transcript
below and "Known gaps" at the end — a frontend consuming `schedule` or `explanation` fields
needs the snake_case names, not the camelCase ones the rest of this API uses everywhere else.

## Conventions

- Base URL: `/api`.
- All request and response bodies are JSON. Top-level `Farm`/`Field`/`SoilTest`/`FertilizerLog`/
  `Recommendation` fields are **camelCase**; `Recommendation.schedule` and `.explanation` are the
  ML service's own snake_case payload, passed through as-is (see the gap noted above).
- **Error shape:** `{ "error": "<message>", "details"?: <zod .flatten() output> }`. `details`
  is only present on a `422` validation failure (`src/middleware/validate.middleware.js`).
- **Auth:** `Authorization: Bearer <accessToken>` on every route except
  `/auth/register`, `/auth/login`, `/auth/refresh` and `/health`.
- **Pagination:** `?page=<n>&limit=<n>` (both optional, default page 1 / a default limit,
  capped at a max limit — `src/utils/pagination.js`) on every list endpoint. Response shape:
  `{ "items": [...], "page": 1, "limit": 20, "total": 0 }`.
- **Roles:** `FARMER` (default) and `AGRONOMIST` exist on `User.role`, but **no endpoint is
  currently role-gated** — both roles have identical permissions today. `AGRONOMIST` is
  reserved for the stretch regional-summary feature (J13, not built yet). Documented here as a
  known, deliberate gap, not an oversight.
- **Ownership:** every farm/field-scoped route checks the resource belongs to the
  authenticated user; a resource that exists but belongs to someone else returns the same
  `404 { "error": "Not found" }` as a resource that doesn't exist at all (never a `403` that
  would confirm the resource's existence to someone who doesn't own it) — verified with an
  automated ownership matrix (`tests/ownership.test.js`) covering every route below in one
  place, both directions (the non-owner gets 404 everywhere; the real owner still gets through
  everywhere).
- **Request id:** every response carries a unique `X-Request-Id` header, and the same id
  appears in that request's structured log line (see below) — useful for tracing one specific
  request through logs.
- **CORS:** `CORS_ORIGIN` (env) is a real allowlist, comma-separated for more than one origin,
  not a single trusted string. A browser request with an `Origin` header not on the list gets a
  real `403`, never a silently-reflected origin.

## Status codes used across this API

| Code | Meaning |
|---|---|
| `200` / `201` | Success (`201` for a resource creation; `200` for a duplicate recommendation request within the idempotency window, see below) |
| `204` | Success, no body (`DELETE /farms/:id`, `POST /auth/logout`) |
| `400` | A referenced id isn't valid in context (unknown `cropType`/`cropVariety`/`growthStage` against `/reference/crops`, unknown `fertilizerType` in a risk check, or the ML service rejected the request payload as invalid), or a disallowed CORS origin |
| `401` | Missing/invalid/expired access token; wrong login credentials; invalid/reused/expired refresh token |
| `404` | Resource not found, **or** found but not owned by the caller |
| `409` | A prerequisite is missing (field has no `cropType`/`growthStage` set yet, or no soil test logged yet), or a real, race-condition-safe unique-constraint conflict (e.g. two concurrent registrations with the same email — Prisma's own `P2002`, mapped centrally in `error.middleware.js`, not just the common-case pre-check in `auth.controller.js`) |
| `422` | Request body failed validation (zod) |
| `429` | Rate limited (auth endpoints: 10 requests / 15 min in production; geocode: 30 / min) |
| `502` | The ML service is unreachable or returned something the backend couldn't parse |
| `503` | Live, cached and seasonal-average weather are all unavailable |

## `POST /auth/register`

```json
{ "email": "asha@example.com", "password": "a-strong-password", "name": "Asha Singh", "role": "FARMER" }
```
`role` is optional, defaults to `FARMER`. `password` must be at least 10 characters.

**201**
```json
{
  "user": { "id": "79530ac6-49c0-4def-97f0-bdb8a78cba43", "email": "asha@example.com", "name": "Asha Singh", "role": "FARMER", "createdAt": "2026-09-27T22:09:52.717Z" },
  "accessToken": "<jwt>",
  "refreshToken": "1a48bdfc7e9e884d32c6eea400b851f41f902df4432091565207e1062b462dd5c743bd0c0c8fdf710a09030e242b3586"
}
```

Registering the same email again:

**409**
```json
{ "error": "Email already registered" }
```
This is a pre-check (`findUnique` then `create`), which is why it's usually this clean message —
but two *concurrent* registrations with the same email can still race past that check; the
loser now gets a proper `409` from a real Prisma `P2002`, not an uncaught `500`
(`tests/error.middleware.test.js`'s own concurrent-registration test proves the race happens and
is handled, not just that the code compiles).

## `POST /auth/login`

```json
{ "email": "asha@example.com", "password": "a-strong-password" }
```
**200**: same shape as register's response. Wrong password:

**401**
```json
{ "error": "Invalid email or password" }
```
Same message and timing for a wrong password or an unknown email — a real `bcrypt.compare`
always runs, even against a dummy hash, so response time doesn't leak whether the account exists.

## `POST /auth/refresh`

```json
{ "refreshToken": "<opaque token>" }
```
**200**: a **new** pair —
```json
{ "accessToken": "<jwt>", "refreshToken": "9e1c4044bb62dcc03e9f477a7683b1bee3f9d796a7735e05b0ac9064ac1c81fb56dfc9f0f6348cf07f65b0e89609b8ca" }
```
refresh tokens rotate on every use; the presented token is immediately revoked. Presenting that
same (now-revoked) token again:

**401**
```json
{ "error": "Refresh token reuse detected — session revoked" }
```
Treated as theft/replay — revokes every refresh token the user has, not just the reused one.

## `POST /auth/logout`

Requires auth. Body: `{ "refreshToken": "<opaque token>" }`. **204**, no body. Revokes that one
refresh token.

## `GET /auth/me`

Requires auth. **200**
```json
{ "id": "79530ac6-49c0-4def-97f0-bdb8a78cba43", "email": "asha@example.com", "name": "Asha Singh", "role": "FARMER", "createdAt": "2026-09-27T22:09:52.717Z" }
```
No `passwordHash`, ever, in any auth response. Without a token: **401**
`{ "error": "Missing access token" }`.

## `GET /farms` · `POST /farms`

Requires auth. `POST` body: `{ "name": "Green Valley Farm" }` → **201**
```json
{ "id": "bd6d53d4-a97e-4d2b-93fe-14fcfa6e060d", "name": "Green Valley Farm", "ownerId": "243ba465-1470-4928-bb56-dbf9e20bbcaf", "createdAt": "2026-09-27T22:09:55.918Z" }
```
`GET`: paginated list of the caller's own farms —
`{ "items": [ { "...": "same Farm shape" } ], "page": 1, "limit": 20, "total": 1 }`.

## `GET /farms/:id` · `DELETE /farms/:id`

Requires auth + ownership. `GET` → the same `Farm` shape as above. `DELETE` → **204**, no body
(cascades to every field, soil test, fertilizer log and recommendation under it — see the
schema's `onDelete: Cascade`). A non-owner (or non-existent id): **404**
`{ "error": "Not found" }`.

## `GET /farms/:farmId/fields` · `POST /farms/:farmId/fields`

Requires auth + farm ownership. `POST` body (all but `name` optional):
```json
{
  "name": "Wheat Field 1", "areaAcres": 2.5, "latitude": 30.911, "longitude": 75.847,
  "pincode": "141001", "cropType": "wheat", "growthStage": "sowing",
  "irrigation": "irrigated", "sowingDate": "2026-11-01"
}
```
**201**
```json
{
  "id": "44db48dc-9b9d-4876-95fb-911c585d4127", "name": "Wheat Field 1",
  "farmId": "bd6d53d4-a97e-4d2b-93fe-14fcfa6e060d", "areaAcres": 2.5,
  "latitude": 30.911, "longitude": 75.847, "pincode": "141001",
  "cropType": "wheat", "cropVariety": null, "growthStage": "sowing",
  "irrigation": "irrigated", "sowingDate": "2026-11-01T00:00:00.000Z",
  "createdAt": "2026-09-27T22:09:56.440Z"
}
```
`cropType`/`cropVariety`/`growthStage`, if given, are checked against `GET /reference/crops`
(**400** `{ "error": "Unknown cropType: not-a-real-crop" }` if unknown) -- **but if the
reference service itself is down, field creation is not blocked on it** (the check is skipped,
not failed). `GET`: paginated `Field[]`, same shape.

## `GET /fields/:id` · `PATCH /fields/:id`

Requires auth + ownership (via the field's farm). `PATCH` accepts the same optional fields as
field creation (minus `name`/`pincode`) → **200**, updated `Field`. **Verified, not previously
documented:** `GET /fields/:id` embeds the parent `farm` object too —

```json
{
  "id": "44db48dc-9b9d-4876-95fb-911c585d4127", "...": "the rest of Field",
  "farm": { "id": "bd6d53d4-a97e-4d2b-93fe-14fcfa6e060d", "name": "Green Valley Farm", "ownerId": "243ba465-1470-4928-bb56-dbf9e20bbcaf", "createdAt": "2026-09-27T22:09:55.918Z" }
}
```
`PATCH`'s response does **not** include `farm` — only `GET` does.

## `GET /geocode?q=<place name>`

Requires auth. Rate-limited (30/min). Proxies Open-Meteo geocoding.

**200**
```json
[
  { "name": "Ludhiana", "admin": "Punjab", "latitude": 30.91204, "longitude": 75.85379 },
  { "name": "Ludhiāna", "admin": "Uttar Pradesh", "latitude": 28.49596, "longitude": 77.85739 },
  { "name": "Ludhiana Airport", "admin": "Punjab", "latitude": 30.8547, "longitude": 75.9526 }
]
```
(Up to 5 results, India-scoped. Cached 24h per query.)

## `POST /fields/:id/soil-tests` · `GET /fields/:id/soil-tests`

Requires auth + field ownership. `POST` body: `{ "n", "p", "k", "ph", "organicCarbon",
"moisture", "testedOn"? }` (the same six fixed soil fields as the ML contract; `testedOn`
defaults to now) → **201**
```json
{ "id": "a57c6e08-2f71-41dc-84e1-23c9a0fcdf95", "fieldId": "44db48dc-9b9d-4876-95fb-911c585d4127", "n": 300, "p": 15, "k": 150, "ph": 7, "organicCarbon": 0.6, "moisture": 35, "testedOn": "2026-10-20T00:00:00.000Z" }
```
An out-of-range value (`ph: 15`): **422**
```json
{ "error": "Validation failed", "details": { "formErrors": [], "fieldErrors": { "ph": ["Too big: expected number to be <=14"] } } }
```
`GET`: paginated, newest-tested-first, same shape wrapped in `{ items, page, limit, total }`.

## `POST /fields/:id/fertilizer-logs` · `GET /fields/:id/fertilizer-logs`

Requires auth + field ownership. `POST` body: `{ "type": "urea", "quantityKgPerAcre": 150,
"appliedOn": "2026-09-10" }` → **201**
```json
{ "id": "48e45b8e-30b0-4c30-bc24-8168d3fa70dd", "fieldId": "44db48dc-9b9d-4876-95fb-911c585d4127", "type": "urea", "quantityKgPerAcre": 150, "appliedOn": "2026-09-10T00:00:00.000Z" }
```
`appliedOn` cannot be in the future — **422**
`{ "error": "Validation failed", "details": { "formErrors": [], "fieldErrors": { "appliedOn": ["appliedOn cannot be in the future"] } } }`
if it is. `GET`: paginated, newest-applied-first.

## `GET /fields/:id/weather`

Requires auth + field ownership. **400** if the field has no latitude/longitude set.

**200**
```json
{ "temperatureC": 22.2, "humidityPct": 87, "rainfallMmForecast": 0.7, "source": "live", "fetchedAt": "2026-09-27T22:09:58.114Z", "stale": false }
```
`source` is `"live"`, `"cached"` (network hiccup, serving a copy under 6h old) or
`"seasonal_average"` (both live and cache failed). `stale` is `true` for anything but a fresh
live read. **503** if all three fail.

## `POST /fields/:id/recommendations` · `GET /fields/:id/recommendations` · `GET /recommendations/:id`

Requires auth + field ownership (the single-recommendation route checks ownership through the
recommendation's own field).

`POST` body (all optional -- override the field's own crop/variety/stage for this one call):
```json
{ "soilTestId": "a57c6e08-2f71-41dc-84e1-23c9a0fcdf95" }
```
Uses the field's latest soil test if `soilTestId` isn't given. **409** if the field (after any
override) still has no `cropType` or `growthStage`, or if there's no soil test at all.
**Idempotent for 30 seconds**: an identical request (same resolved crop/variety/stage/soil
test/weather/previous-usage) within 30s of the last one returns the **existing** recommendation
with **200**, not a new row (verified: two immediately-repeated calls returned the identical
`id`, second one at `200`) -- a real repeated network retry doesn't create duplicate history
entries. The payload also carries the earlier soil tests of the field (up to 5, before the one used)
and the last 60 days of observed rain from Open-Meteo, so the engine can flag soil-test jumps and
trends and reduce nitrogen credit after heavy rain; the rain lookup is best effort and falls back to
none. Calls the ML service and Open-Meteo weather internally; **502** if the ML service is
unreachable or its response doesn't validate, **400** if the ML service reports the request
itself was invalid.

**201** (or **200** if idempotent-matched) -- real transcript, field with a 150 kg/acre urea log
already applied:
```json
{
  "id": "c857f47d-cc3d-411b-ae6f-df4ab554eec1",
  "fieldId": "44db48dc-9b9d-4876-95fb-911c585d4127",
  "soilTestId": "a57c6e08-2f71-41dc-84e1-23c9a0fcdf95",
  "cropType": "wheat", "cropVariety": null, "growthStage": "second_irrigation",
  "fertilizerType": "urea", "quantityKgPerAcre": 22.417,
  "schedule": [
    { "stage": "second_irrigation", "apply_by": "2026-12-21", "timing_note": null, "fertilizer_type": "urea", "quantity_kg_per_acre": 22.417 }
  ],
  "risk": {
    "level": "HIGH",
    "reason": "Applied N is 170.5 kg/ha, 335% of the 51.0 kg/ha the crop needs.",
    "soilHealthImpact": "Nitrogen applied well beyond crop need can acidify the soil over time and leach into groundwater rather than being taken up by the plant.",
    "yieldImpact": "Extra fertilizer beyond what the crop can use adds cost without adding yield -- money spent for no extra grain."
  },
  "topFactors": [
    "The standard irrigated dose for wheat is 123.6 kg/ha of N.",
    "You already applied about 170.5059 kg/ha of N-containing fertilizer recently; at this crop's nutrient-use efficiency, that credits 72.6 kg/ha against the new dose.",
    "The standard irrigated dose for wheat is 61.8 kg/ha of P2O5.",
    "Across its training data, the model's single most influential input for product choice is crop type (chickpea) -- for this field, that value is 0.0."
  ],
  "explanation": {
    "formula": "fertilizer needed = standard dose for the crop + soil-test adjustment - credit for recent applications",
    "data_notes": ["The product classifier's top guess (np_28_28_0) differed from the rule-based plan; the rule-based plan was kept."],
    "history_insights": [],
    "stage_used": "second_irrigation",
    "top_factors": ["...", "identical to the top-level topFactors above, verbatim -- see the gap noted at the top of this doc"],
    "nutrient_balance": {
      "n": { "method": "reference_dose", "soil_rating": "medium", "prior_credit_kg_ha": 72.636, "standard_dose_kg_ha": 123.6, "soil_adjustment_kg_ha": 0, "fertilizer_needed_kg_ha": 50.964 },
      "p": { "method": "reference_dose", "soil_rating": "medium", "prior_credit_kg_ha": 0, "standard_dose_kg_ha": 61.8, "soil_adjustment_kg_ha": 0, "fertilizer_needed_kg_ha": 61.8 },
      "k": { "method": "reference_dose", "soil_rating": "medium", "prior_credit_kg_ha": 0, "standard_dose_kg_ha": 0, "soil_adjustment_kg_ha": 0, "fertilizer_needed_kg_ha": 0 }
    }
  },
  "weatherSource": "live", "weatherStale": false,
  "estimatedCost": 132.709, "estimatedSaving": 755.291, "savingTotal": 1888.2275,
  "modelVersion": "fertilizer-classifier-0.1.1+rules-4b2ba173",
  "createdAt": "2026-09-27T22:09:58.911Z"
}
```
`savingTotal` is `estimatedSaving * field.areaAcres` (null if either is null) -- the ML
contract's saving is per acre, this is the whole field (2.5 acres here: `755.291 * 2.5 =
1888.2275`, exactly).

`GET /fields/:id/recommendations`: paginated, **newest-first** (`orderBy createdAt desc`).
`GET /recommendations/:id`: a single recommendation by id (still ownership-checked, inline in
the controller rather than via the shared `assertFieldOwner`/`assertFarmOwner` middleware --
same 404 behavior either way, verified in the ownership matrix).

## `POST /fields/:id/risk-check`

Requires auth + field ownership. Same prerequisite checks as creating a recommendation (409 if
no crop type/growth stage/soil test). Body:
```json
{ "plannedApplication": [{ "fertilizerType": "urea", "quantityKgPerAcre": 200 }] }
```
`plannedApplication` needs at least one item; each `fertilizerType` is checked against
`GET /reference/fertilizers` (**400** `{ "error": "Unknown fertilizerType: not-a-real-fertilizer" }`
if unknown, before calling the ML service at all).

**200** -- real transcript (same field, a bigger planned dose than the recommendation above):
```json
{
  "risk": {
    "level": "high",
    "reason": "Applied N is 227.3 kg/ha, 446% of the 51.0 kg/ha the crop needs.",
    "soilHealthImpact": "Nitrogen applied well beyond crop need can acidify the soil over time and leach into groundwater rather than being taken up by the plant.",
    "yieldImpact": "Extra fertilizer beyond what the crop can use adds cost without adding yield -- money spent for no extra grain.",
    "overApplicationPct": 346.1
  },
  "nutrientBalance": {
    "n": { "appliedKgHa": 227.34, "recommendedKgHa": 50.964, "ratio": 4.461 },
    "p": { "appliedKgHa": 0, "recommendedKgHa": 61.8, "ratio": 0 },
    "k": { "appliedKgHa": 0, "recommendedKgHa": 0, "ratio": 1 }
  }
}
```
This is a pure check -- nothing is written to the database. Note `nutrientBalance` here IS
camelCase (unlike a recommendation's `explanation.nutrient_balance`) -- this route builds its
own response shape rather than passing through the ML service's raw payload.

## `GET /fields/:id/trends`

Requires auth + field ownership. Last 24 months, three independent time series a chart can
draw directly. Real transcript, same field (one soil test, one 150 kg/acre urea log, one
recommendation so far):

```json
{
  "soilTests": [{ "testedOn": "2026-10-20T00:00:00.000Z", "n": 300, "p": 15, "k": 150, "ph": 7, "organicCarbon": 0.6, "moisture": 35 }],
  "applied": [{ "month": "2026-09", "nitrogenKgAcre": 69, "p2o5KgAcre": 0, "k2oKgAcre": 0, "costInr": 888 }],
  "recommendations": [{ "createdAt": "2026-09-27T22:09:58.911Z", "fertilizerType": "urea", "quantityKgPerAcre": 22.417, "estimatedCost": 132.709, "riskLevel": "HIGH", "fertilizerNeededN": 50.964, "fertilizerNeededP": 61.8, "fertilizerNeededK": 0 }]
}
```
`applied` aggregates logged `fertilizerLogs` into calendar months using each product's N/P2O5/K2O
percentages and price from `/reference/fertilizers` (a log for a product no longer in that
list is silently excluded from `applied`, not errored). Empty arrays, not an error, for a field
with no history yet (verified: `tests/trends.test.js`'s own "brand-new field" test).

## `GET /reference/crops` · `/reference/soil-ratings` · `/reference/fertilizers`

Requires auth. Proxied from the ML service (`ml/src/api/endpoints/reference.py`), cached with a
stale-while-revalidate fallback (fresh under 1h, stale-but-served under 24h, `503` past that
if the ML service is also down). Shapes are exactly the ML contract's
(`docs/api-contract.md`'s `GET /reference/*` section) -- this backend doesn't rename these
fields to camelCase since the ML service's own `id`/`name_en`/`n_pct` etc. are already the
public shape both frontend and backend consume as-is. Real transcript, `/reference/soil-ratings`
(short enough to show in full; `crops`/`fertilizers` are longer lists of the same shape):
```json
[
  { "parameter": "organic_carbon", "unit": "%", "very_low_below": null, "low_below": 0.5, "high_above": 0.75 },
  { "parameter": "n", "unit": "kg/ha", "very_low_below": null, "low_below": 280, "high_above": 560 },
  { "parameter": "p", "unit": "kg/ha", "very_low_below": null, "low_below": 10, "high_above": 25 },
  { "parameter": "k", "unit": "kg/ha", "very_low_below": null, "low_below": 108, "high_above": 280 },
  { "parameter": "ph", "unit": "pH units", "very_low_below": null, "low_below": 6.5, "high_above": 7.5 }
]
```

## Security and reliability pass (2026-09-28)

Every item below was checked directly (reading the code, running the real suite, or hitting a
real running server), not assumed. `backend/PROGRESS.md`-equivalent detail lives in the
individual commits; this is the summary a reader of this contract needs.

- **Auth coverage:** every route is behind `requireAuth` except `/auth/register`, `/auth/login`,
  `/auth/refresh` and `/health` -- verified by reading every route file, not just this list.
- **Ownership matrix** (`tests/ownership.test.js`, new): one comprehensive test, not scattered
  assertions, covering farm/field/soil test/fertilizer log/recommendation (both nested and
  direct)/weather/risk-check/trends -- a non-owner gets 404 everywhere, a real owner still
  succeeds everywhere (two separate tests, so a routing bug that 404s for *everyone* would also
  be caught).
- **No hardcoded secrets** -- grepped the whole tree; every credential comes from `env`.
- **`helmet()`** with its defaults, a real **CORS allowlist** (comma-separated `CORS_ORIGIN`,
  a disallowed origin gets a real `403`, not a silent reflect-or-500), a **100kb body limit**,
  a **request id** (`X-Request-Id`, also in the structured log line) and **structured JSON
  logs** (`request_id`, `method`, `path`, `status`, `latency_ms`, `user_id` -- deliberately
  narrow, never the request body, a password, or the `Authorization` header; replaces the
  previous plain-text `morgan` access log).
- **Error middleware** maps a `ZodError` to `400` (defense-in-depth -- nothing currently throws
  one directly; every route's own `validate()` middleware already returns its own `422` with a
  `details` payload first, a deliberate, separately-tested design, not changed here), a Prisma
  `P2002` (unique constraint) to `409`, a Prisma `P2025` (record not found) to `404`, anything
  else to a generic `500`. The `P2002` path is live today, not theoretical: `auth.controller.js`'s
  register pre-checks for a duplicate email, but a genuinely concurrent double-registration can
  still race past that check -- `tests/error.middleware.test.js` reproduces the real race and
  confirms the loser gets a proper `409`, not an uncaught `500`.
- **Graceful shutdown:** `SIGTERM`/`SIGINT` now stop the server from accepting new connections,
  let in-flight ones finish, disconnect Prisma's pool, then exit -- verified by sending a real
  `SIGTERM` to a running process and confirming a clean exit within 1 second. Previously the
  process was killed outright with no cleanup.
- **`npm audit --omit=dev` reviewed:** 3 high-severity findings, all confined to `prisma`'s own
  devDependency chain (`@prisma/config` → `deepmerge-ts@7.1.5`, a stack-exhaustion advisory
  fixed in `deepmerge-ts@8.0.0+`) -- never installed in the production image (`Dockerfile` runs
  `npm ci --omit=dev`). `npm audit fix --force` would *downgrade* prisma to `6.12.0`, not
  upgrade it; not applied, since that trades a low-practical-risk dev-tooling advisory for an
  actual regression in the pinned toolchain version. Worth revisiting when prisma ships a patch
  that bumps its own `deepmerge-ts` pin.
- **`.env.example`** matches `src/config/env.js`'s schema exactly, field for field -- checked
  directly, not assumed.
- **A real bug found and fixed while building the structured logger:** reading `req.path` lazily
  inside `res.on('finish')` isn't guaranteed to see Express's fully-restored URL after a nested
  router's prefix-stripping/restoring -- two near-simultaneous requests to the identical route
  logged two different paths before the fix (`/register` and `/api/auth/register`). Fixed by
  snapshotting `method`/`path` at request start instead; regression test in
  `tests/logging.middleware.test.js`.

## Known gaps (flagged, not hidden)

- **`explanation`/`schedule` stay snake_case** inside an otherwise-camelCase API -- see the note
  at the top of this document. Not fixed here (a contract-shape change, not a
  security/reliability issue) -- flagged clearly so a frontend integration doesn't get surprised
  by `explanation.nutrient_balance` instead of `explanation.nutrientBalance`.
- **`topFactors` is fully duplicated** as `explanation.top_factors` -- redundant, not wrong.
- **CI now runs the real test suite against a real Postgres service container**
  (`.github/workflows/ci.yml`'s `backend` job), not just lint -- this used to be an open gap
  ("the CI workflow currently only runs `npm run lint`"), closed by J10; updated here since a
  prior draft of this doc hadn't caught up to that.
- **`AGRONOMIST` role has no differentiated permissions yet** (see "Roles" above).
