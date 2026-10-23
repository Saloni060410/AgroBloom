# API Contract: Backend to ML Service (v1.0)

Owned jointly by **Josh** (backend) and **Saloni** (ML). Reviewed against the reference tables Richa has published, then locked. After it is locked, change it only through the process at the bottom.

Fixtures for every request and response live in `docs/contract-fixtures/`. Their numbers are illustrative. Contract tests on both sides validate against them.

## Decisions baked into this version

1. **Soil schema is fixed by the problem statement:** `n`, `p`, `k`, `ph`, `organic_carbon`, `moisture`. Do not add, remove or rename soil fields. A test guards this.
2. `crop_type`, `variety` and `growth_stage` are ids from `GET /reference/crops`. `variety` is optional and only exists if Richa's data has varieties. `generic` is a reserved fallback id inside the reference tables and is never sent or listed.
3. `sowing_date` is optional. It is the date the crop's stage days are counted from (for rice this is the nursery sowing date, see `growth_stages.csv`). If it is missing, the engine assumes today is the middle of the current stage.
4. `irrigation` is optional (`irrigated` or `rainfed`). Reference doses differ by irrigation. If it is missing the engine uses `irrigated`.
5. The core engine is a transparent soil-test-based dose: `fertilizer needed = standard dose for the crop + soil-test adjustment - credit for recent applications`. The standard dose is the published dose for the crop (for example the PAU dose for medium-fertility soil). The soil-test adjustment comes from published soil-test rules, or from an STCR equation (`a x target yield - b x soil test`) where one exists. Each nutrient reports which `method` was used. The ML model only chooses between nutrient-equivalent products. Every response shows the inputs (`explanation.nutrient_balance`).
6. The **primary product** is the product with the largest total quantity in the schedule. Its `quantity_kg_per_acre` is that product's total across the schedule. Every application, including other products, is in `schedule`.
7. Weather is fetched by the backend (Open-Meteo) and sent in the request. `weather.source` says whether it was `live`, `cached` or a `seasonal_average` fallback.
8. Cost is compared with the farmer's logged previous usage. If nothing is logged the comparison fields are `null`. Never invent a baseline.
9. Errors: `422 { detail: [...] }` for invalid input, `503 { detail }` when the model or reference data is unavailable.
10. `model_version` format: `<model>-<semver>+rules-<hash8>`.

## Units

| Quantity | Unit |
|---|---|
| Soil `n`, `p`, `k` | kg/ha of available nutrient, elemental, as printed on a Soil Health Card (alkaline permanganate N, Olsen P, ammonium acetate K) |
| Soil `organic_carbon`, `moisture` | percent. `moisture` is not used by the dose calculation |
| `ph` | 0 to 14 |
| `nutrient_balance.*_kg_ha` | kg/ha on a fertilizer basis: N, P2O5 and K2O |
| `quantity_kg_per_acre` (schedule, previous usage, planned application) | kg of product per acre, product weight, not nutrient weight |
| `weather.rainfall_mm_forecast` | total forecast rainfall over the next 5 days |
| `weather.temperature_c` | current air temperature |
| Conversion | 1 ha = 2.4711 acre, done inside the ML service |

## Missing data policy

Data gaps must never turn into invented numbers.

| Gap | What the engine does |
|---|---|
| A dose or adjustment cell is `TODO(data)` for a nutrient | The crop is not ready. `503 { detail }` names the missing cells. `/reference/crops` lists only ready crops |
| No adjustment row exists for a nutrient and rating | Adjustment is 0. A missing row means the source publishes none |
| Stage timing (`das_*`) is `TODO(data)` | Dose is still computed. `apply_by` is `null` and `timing_note` says when, for example "At first irrigation" |
| No fertilizer use efficiency for the crop and nutrient | Credit for recent applications is 0 and `explanation.data_notes` says so |
| A product has no price | The product is still selected and dosed if a nutrient needs it -- it is left out of `cost.breakdown`/`estimated_cost_inr_per_acre` (never invented a price) and `explanation.data_notes` says its cost is unavailable. Only a product with no *row at all* in `fertilizer_products.csv` (name/nutrient % unknown, not just unpriced) is a `503` |
| Live weather failed | The backend sends `cached` or `seasonal_average` weather. The engine still runs and echoes the source |
| Unknown product id in previous usage | Ignored for credit and cost, and listed in `explanation.data_notes` |

## POST /recommend

**Request** (sent by backend)
```json
{
  "field_id": "string",
  "crop_type": "wheat",
  "variety": "string | null",
  "irrigation": "irrigated | rainfed | null",
  "growth_stage": "sowing",
  "sowing_date": "YYYY-MM-DD | null",
  "soil": { "n": 0.0, "p": 0.0, "k": 0.0, "ph": 0.0, "organic_carbon": 0.0, "moisture": 0.0 },
  "weather": {
    "temperature_c": 0.0,
    "humidity_pct": 0.0,
    "rainfall_mm_forecast": 0.0,
    "source": "live | cached | seasonal_average"
  },
  "previous_fertilizer_usage": [
    { "type": "urea", "quantity_kg_per_acre": 0.0, "applied_on": "YYYY-MM-DD" }
  ],
  "soil_tested_on": "YYYY-MM-DD | null",
  "previous_soil_tests": [
    { "tested_on": "YYYY-MM-DD", "n": 0.0, "p": 0.0, "k": 0.0, "ph": 0.0, "organic_carbon": 0.0, "moisture": 0.0 }
  ],
  "rainfall_history": [ { "date": "YYYY-MM-DD", "mm": 0.0 } ]
}
```

`soil_tested_on`, `previous_soil_tests` and `rainfall_history` are optional and default to empty. `previous_soil_tests` holds earlier tests of the same field (not the one sent as `soil`), newest first. `rainfall_history` is rain that actually fell, one entry per past day, up to the last 60 days. When any of them is missing the engine skips the adjustment that needs it and the response is the same as before.

**Response**
```json
{
  "recommendation": {
    "fertilizer_type": "urea",
    "quantity_kg_per_acre": 0.0,
    "schedule": [
      {
        "stage": "sowing",
        "fertilizer_type": "dap",
        "quantity_kg_per_acre": 0.0,
        "apply_by": "YYYY-MM-DD | null",
        "timing_note": "string | null"
      }
    ]
  },
  "risk": {
    "level": "low | medium | high",
    "reason": "string",
    "soil_health_impact": "string",
    "yield_impact": "string",
    "over_application_pct": "number | null"
  },
  "explanation": {
    "top_factors": ["string"],
    "nutrient_balance": {
      "n": {
        "method": "reference_dose | stcr",
        "soil_rating": "very_low | low | medium | high | null",
        "standard_dose_kg_ha": 0.0,
        "soil_adjustment_kg_ha": 0.0,
        "prior_credit_kg_ha": 0.0,
        "fertilizer_needed_kg_ha": 0.0
      },
      "p": { "...": "same keys, P2O5 basis" },
      "k": { "...": "same keys, K2O basis" }
    },
    "formula": "string",
    "data_notes": ["string"],
    "history_insights": [
      { "kind": "soil_jump | rating_dropped | rating_improved | oc_falling", "severity": "warning | watch | good", "nutrient": "n | p | k | ph | organic_carbon | null", "text": "string" }
    ],
    "stage_used": "string | null"
  },
  "cost": {
    "estimated_cost_inr_per_acre": 0.0,
    "previous_cost_inr_per_acre": "number | null",
    "saving_inr_per_acre": "number | null",
    "prices_as_of": "YYYY-MM-DD | null",
    "breakdown": [ { "fertilizer_type": "urea", "quantity_kg_per_acre": 0.0, "cost_inr_per_acre": 0.0 } ]
  },
  "impact": { "over_application_reduction_pct": "number | null" },
  "model_version": "<model>-<semver>+rules-<hash8>"
}
```

- `apply_by` is the deadline for the stage: `sowing_date` plus the stage's `das_end`. It is `null` when the stage timing is not sourced, and then `timing_note` carries the event, for example "At first irrigation". `timing_note` may also be set when the date is known.
- `risk` covers over- and under-application, soil health (organic carbon, pH) and runoff from forecast rain. `soil_health_impact` and `yield_impact` state the consequence in plain language, as the problem statement asks.
- `nutrient_balance` is per nutrient on an N, P2O5 and K2O basis. `fertilizer_needed_kg_ha = max(0, standard_dose + soil_adjustment - prior_credit)`. The adjustment is signed. With `method: "stcr"`, `standard_dose = a x target yield` and `soil_adjustment = -b x soil test`.
- DAP also supplies nitrogen. That nitrogen is credited against the first nitrogen stage in the schedule.
- The engine selects whichever product a needed nutrient maps to, priced or not (see the missing-data policy above). `cost.prices_as_of` is the oldest `price_date` among the *priced* products actually used, so the UI can say how old those prices are; an unpriced product doesn't affect it.
- `data_notes` lists caveats the user should see: skipped credit, non-live weather, old prices, an unpriced product excluded from the cost breakdown, ignored inputs.
- `saving_inr_per_acre` can be negative. The UI explains it.
- `stage_used` is the growth stage the plan was built for. It is the later of the saved `growth_stage` and the stage implied by `sowing_date` (the engine never moves a stage back). When it moved forward, `data_notes` says so.
- Credit for earlier phosphorus and potassium applications lasts the crop season, not a flat 60 days. Nitrogen credit still uses the 60-day window, and is halved when `rainfall_history` shows 20 mm or more within 3 days after the application (nitrogen is lost to leaching and runoff). Top-dressing is held back for 2 days after heavy rain. All of these numbers are team assumptions in `ml/data/external/agronomy_rules.yaml` and need agronomist sign-off.
- `history_insights` compares the soil test used with earlier ones: a sudden jump in a nutrient, a rating that dropped or improved, organic carbon falling over three or more tests. These are warnings and trends only. They never change the dose, which still comes from the published tables. Each insight is also copied into `data_notes`, so a client that only shows `data_notes` still shows them.

## POST /risk-score

Scores a farmer's own planned dose ("what if I apply this?"). Same soil, weather, crop, irrigation and usage fields as `/recommend`, plus:
```json
"planned_application": [ { "fertilizer_type": "urea", "quantity_kg_per_acre": 200 } ]
```
**Response**
```json
{
  "risk": {
    "level": "low | medium | high",
    "reason": "string",
    "soil_health_impact": "string",
    "yield_impact": "string",
    "over_application_pct": "number | null"
  },
  "nutrient_balance": {
    "n": { "applied_kg_ha": 0.0, "recommended_kg_ha": 0.0, "ratio": "number | null" },
    "p": { "...": "same keys" },
    "k": { "...": "same keys" }
  },
  "model_version": "string"
}
```

`ratio` is `null` when the crop needs none of that nutrient (`recommended_kg_ha` is 0) but some is planned: the ratio is infinite and cannot be sent as JSON. It is `1` when nothing is planned and none is needed.
`recommended_kg_ha` is the `fertilizer_needed_kg_ha` the engine computes for the same inputs.

## GET /health

Liveness check the backend can poll.
```json
{ "status": "ok | degraded", "model_version": "string", "detail": "string | null" }
```
`degraded` (HTTP 200) means the service is up but the model artifact or a reference table is missing. The reason is in `detail`.

## GET /reference/*

Read-only lists built from `ml/data/external/`. The backend proxies and caches them. Nothing here is hardcoded in the backend or the frontend. Only ready crops are listed.

| Path | Returns |
|---|---|
| `/reference/crops` | `[{ id, name_en, name_hi, varieties: [{ id, name_en, name_hi }], stages: [{ id, name_en, name_hi, order }] }]` |
| `/reference/soil-ratings` | low and high cut-offs per soil parameter, with units, and `very_low_below` where a source has that band |
| `/reference/fertilizers` | `[{ id, name, n_pct, p2o5_pct, k2o_pct, price_inr_per_kg, price_date, bag_size_kg }]`. Every product the engine knows, including ones with no verified price: `price_inr_per_kg` and `price_date` are `null` for them, and `bag_size_kg` is `null` when unknown |
| `/reference/seasonal-weather?lat=&lng=&month=` | a weather block with `source: "seasonal_average"`, used when live weather and cache both fail |

## How to change this contract

1. Propose the change in a docs-only PR to `main` titled `docs: api-contract <change>`.
2. Both owners approve it in the PR.
3. Merge, then both owners run `git pull origin main --rebase` on their branches the same day.
4. Update `ml/src/api/schemas.py`, `backend/src/services/mlService.js` and the fixtures in the same change. Keep `model_version` in every response so a bad result traces to the model and rule tables that made it.
