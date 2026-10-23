# Data dictionary

Units and meaning of the fields shared across services. Keep in step with `api-contract.md`, `backend/prisma/schema.prisma` and `ml/data/external/`.

## Soil (fixed by the problem statement)

Never add, remove or rename these fields.

| Field | Meaning | Unit |
|---|---|---|
| `n` | Available nitrogen | kg/ha (Soil Health Card basis, alkaline-permanganate method) |
| `p` | Available phosphorus | kg/ha (Soil Health Card basis, Olsen-P method) |
| `k` | Available potassium | kg/ha (Soil Health Card basis, ammonium-acetate method) |
| `ph` | Soil pH | 0 to 14 |
| `organic_carbon` | Organic carbon content | percent |
| `moisture` | Soil moisture | percent |

## Crop

| Field | Meaning | Values |
|---|---|---|
| `crop_type` | Crop id | from `GET /reference/crops` (`ml/data/external/crops.csv`) |
| `variety` | Optional variety id | from the same endpoint, only where Richa's data has varieties |
| `growth_stage` | Stage id | from the same endpoint (`growth_stages.csv`) |
| `sowing_date` | Sowing date | `YYYY-MM-DD`, optional. Dates the schedule |

## Weather

| Field | Meaning | Unit |
|---|---|---|
| `temperature_c` | Current air temperature | degrees C |
| `humidity_pct` | Relative humidity | percent |
| `rainfall_mm_forecast` | Forecast rainfall for the next 5 days | mm |
| `source` | `live`, `cached` or `seasonal_average` | |

Current provider is **Open-Meteo** (no API key required) — see `ml/src/weather/`. An earlier
PRD draft specified OpenWeatherMap; that was superseded (see commit `9f25bf5`).

## Recommendation

| Field | Meaning | Unit |
|---|---|---|
| `quantity_kg_per_acre` | Fertilizer product quantity | kg/acre |
| `nutrient_balance.*.method` | `reference_dose` or `stcr` | |
| `nutrient_balance.*_kg_ha` | Standard dose, soil adjustment (signed), prior credit, fertilizer needed (P as P2O5, K as K2O) | kg/ha |
| `risk.level` | Over- and under-application risk | `low`, `medium`, `high` |
| `cost.*_inr_per_acre` | Plan cost, previous cost, saving | INR per acre |
| `model_version` | `<model>-<semver>+rules-<hash8>` | string |

## Soil-estimate API fields (R14, proposed -- not yet wired into any endpoint)

`ml/src/data_pipeline/soil_reference.py`'s `get_soil_estimate(lat, lon)` -- see
`docs/soil-reference-proposal.md` for the full mapping rationale and the coverage-gap finding.
Listed here because these are the fields a future `GET /soil-reference` endpoint (Josh) would
return, not because they're live yet.

| Field | Meaning | Unit / allowed values |
|---|---|---|
| `ph` | Estimated soil pH, SoilGrids `phh2o`, 0-5cm topsoil | 0 to 14, or `null` if SoilGrids has no coverage at this point |
| `organic_carbon_pct` | Estimated organic carbon, SoilGrids `soc`, 0-5cm topsoil | percent, or `null` |
| `n`, `p`, `k`, `moisture` | Always `null` | not estimable from this source -- see `soil_reference.py`'s `NOT_MAPPED` and `docs/soil-reference-proposal.md` for why each one specifically can't be, not just "not implemented" |
| `source` | Attribution string (CC-BY 4.0 requires this be shown somewhere in the UI) | free text, e.g. `"soilgrids_v2.0 (ISRIC), 0-5cm topsoil, CC-BY 4.0 -- https://rest.isric.org"` |
| `coverage.ph` / `coverage.organic_carbon_pct` | Whether SoilGrids actually returned a value at this exact point | boolean -- `false` is a real, expected outcome (verified for our own Ludhiana demo coordinates), never an error |

**This never fills `n`, `p` or `k`.** If/when this ships, it can only ever pre-fill 2 of the 6
fixed soil fields (`ph`, `organic_carbon`) -- N/P/K always remain a required, farmer-entered
field. See the proposal doc for exactly what the UI must say about this.

## Training dataset unit reconciliation (R4)

The `fertilizer_prediction` training dataset (`ml/data/raw/fertilizer_prediction.csv`, see
`ml/data/README.md`) does **not** use the same units as the API/soil schema above, and the
mapping is only partial. Documented honestly rather than assumed:

| Dataset column | Renamed (clean.csv) | API/Soil Health Card equivalent | Mapping |
|---|---|---|---|
| `Nitrogen`, `Potassium`, `Phosphorous` | `nitrogen_raw`, `potassium_raw`, `phosphorous_raw` | `n`, `p`, `k` (kg/ha, elemental, Soil Health Card basis) | **No defensible mapping found.** The source doesn't state units, and values (0–42) are far too low to plausibly be kg/ha of available nutrient on any Soil Health Card convention. Left as unmapped, unitless "raw" columns — treated as relative/index values for the classifier only, never conflated with the API's `n`/`p`/`k`. |
| `Temparature`, `Humidity` | `temperature_c`, `humidity_pct` | `weather.temperature_c`, `weather.humidity_pct` | Plausible direct match (ranges and typical Punjab climate line up), but the source doesn't confirm units either — treated as a reasonable assumption, not a confirmed mapping. |
| `Moisture` | `moisture_pct` | `soil.moisture` (%) | Same caveat as temperature/humidity — plausible, not confirmed. |
| `Soil Type` (Sandy/Loamy/Black/Red/Clayey) | `soil_type` | *(none)* | **No equivalent field exists in the fixed soil schema** (`n, p, k, ph, organic_carbon, moisture`). This is a soil *texture* classification, not a chemistry measurement — kept as a classifier-only feature, not merged into any soil field. |
| *(none)* | *(none)* | `ph`, `organic_carbon` | The training dataset has **no pH or organic carbon column at all**. The classifier is trained without these two fixed-schema fields; whether/how to compensate for this at inference time is a feature-engineering decision for R6, not resolved here. |

**Net effect:** the fertilizer-*type* classifier trains on temperature, humidity, moisture,
soil type (texture), and unitless N/P/K index values — a real, documented limitation, not
hidden. It does not and cannot see pH or organic carbon. This is consistent with the R2
decision log's original framing: the classifier is a secondary product-choice refinement:
the *quantity* recommendation (which does need real kg/ha figures) comes entirely from
`reference_doses.csv`/`soil_adjustments.csv`, sourced independently from PAU, not from this
training dataset.

## External reference tables (`ml/data/external/`, contract C5)

Crop, region and fertilizer reference data live here, not in application code (NFR5). Richa
owns these files; Saloni's NPK calculator and Josh's reference proxy read them.

**Engine formula:** `fertilizer needed = standard dose + soil-test adjustment - credit from
recent applications`. `standard dose` comes from `reference_doses.csv`, `soil-test adjustment`
from `soil_adjustments.csv`, `credit` from `agronomy_rules.yaml`'s `credit_window_days` combined
with `nutrient_efficiency.csv`'s `fertilizer_use_efficiency`. `stcr_equations.csv` is an
optional, full alternative method for a nutrient (`nutrient_balance.*.method = "stcr"`) when a
per-field yield target is available and a sourced equation exists — not an addition on top of
the standard-dose-plus-adjustment path.

**Why not demand ÷ supply ÷ efficiency:** an earlier design computed
`(crop demand - soil supply) / use efficiency - credit`, fed by a `crop_requirements.csv` table
holding what was assumed to be the crop's gross nutrient uptake. It wasn't — the only sourced
numbers available (PAU's flat rates) are already **fertilizer-dose recommendations for
medium-fertility soil** ("add the following amounts of *fertilizers* ... on *medium fertile
soils*" — PAU POP Rabi 2025-26 p.9). Running an already-net dose through that formula
double-counted the soil's contribution and inflated the recommendation. This is also why a
`soil_supply_factor`/`fertilizer_use_efficiency` pair couldn't be sourced in the first place:
STCR's published coefficients (e.g. wheat `FN = 5.65T - 1.34SN`) pre-combine soil supply and
efficiency into single regression coefficients — there was never a separable pair to find. The
old `crop_requirements.csv` (itself a rename of R1's `crop_nutrient_norms.csv`) and its
`soil_rating_multipliers` block are retired under this design.

Cells marked `TODO(data)` mean a value could not be verified against an authoritative source
and was deliberately left blank rather than invented.

### crops.csv

| Column | Meaning | Unit / allowed values |
|---|---|---|
| `crop_id` | Stable snake_case identifier, used as `crop_type` across the API/DB/UI | e.g. `wheat`, `rice`, `maize`, `cotton`, `sugarcane`, `chickpea` |
| `name_en` | English display name | string |
| `name_hi` | Hindi display name | string (Devanagari) |
| `dataset_label` | The label this crop maps to in the chosen training dataset(s) | string |
| `season` | Cropping season | `rabi` / `kharif` / `annual` |
| `source` | Citation for this crop's inclusion/season | free text |

### crop_varieties.csv

Header-only unless a crop's chosen dataset actually distinguishes varieties. **Never lists the
`generic` fallback id** — that's a sentinel used only in `reference_doses.csv`, not a real
named variety.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id` | Foreign key into crops.csv | snake_case id |
| `variety_id` | Stable snake_case identifier | e.g. `pr_132` |
| `name_en` / `name_hi` | Display names | string |
| `source` | Citation | free text |

Rows: `rice`/`pr_132`, `chickpea`/`kabuli`, and `cotton`/`non_bt` and `cotton`/`bt` (Bt varieties
that are not hybrids). The general cotton dose in `reference_doses.csv` is PAU's Bt hybrids row. These
are the cases where PAU publishes a different fertilizer dose by variety. When a request names no
variety for such a crop, the plan carries a note listing the varieties that have their own dose.

### growth_stages.csv

| Column | Meaning | Unit / allowed values |
|---|---|---|
| `crop_id` | Foreign key into crops.csv | snake_case id |
| `stage_id` | Stable snake_case identifier for the stage | e.g. `sowing`, `crown_root_initiation` |
| `name_en` / `name_hi` | Display names | string |
| `order` | 1-indexed sequence of the stage within the crop's lifecycle | integer |
| `das_start` / `das_end` | Days after sowing marking the start/end of the stage | integer days, or `TODO(data)` |
| `counted_from` | What `das_start`/`das_end` count from: `sowing` (the default) or `transplanting` | `sowing` / `transplanting` |
| `timing_hint` | PAU's instruction for applying fertilizer at this stage, shown as the line's `timing_note` | sentence, or empty |
| `timing_source` | Where the hint comes from | free text |
| `source` | Citation, including page number where available | free text |

**Rice is transplanted, not direct-sown.** The rice stages from `first_n_split` onward are measured in
**days after transplanting (DAT)** per PAU, not days after nursery sowing, because the nursery lasts 25 to
30 days. Those rows have `counted_from = transplanting`, and the engine adds the transplanting day (the
`transplanting` stage's window) before dating them (`src/engine/stage_timing.py`). Dates shown to the
farmer use the early end of that window, so a best-before is never later than it should be; the stage the
crop has surely reached uses the late end, so it is never advanced early. `first_n_split` is 1 to 7 DAT
("within 7 days of transplanting"), `active_tillering` 21 DAT, `panicle_initiation` 35 to 42 DAT.

**What the schedule's date means.** `apply_by` is the best-before day: the last day of the stage's window for
a nitrogen top-dressing, the first day for phosphorus and potash (which go on before or at the stage). The
line's `timing_note` is the stage's `timing_hint` plus "Best between X and Y" when the stage has a window,
and a rain delay when one applies. Where PAU gives no day count (wheat's first irrigation, maize's knee-high
and pre-tasseling stages, cotton's thinning and flowering, sugarcane's two top-dressings) the window comes
from `stage_timing_estimates.csv`, and the note says "The dates are an estimate: PAU gives no day count for
this stage." Only the stage's real days (`das_start`/`das_end`) decide which stage a crop is in; an estimate
only dates a dose.

### stage_timing_estimates.csv

Approximate day windows for the stages in growth_stages.csv whose days PAU does not give, so every dose in a
schedule has a best-before date.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id`, `stage_id` | The stage, as in growth_stages.csv | ids |
| `est_start`, `est_end` | First and last day after sowing | integer days |
| `est_basis` | Why these days, and what PAU does say | free text |

These are a team assumption pending an agronomist's sign-off. The file only says *when* to apply, never which
product or how much, so the engine leaves it out of the rules hash (`TIMING_ONLY_FILES` in
`recommendation_engine.py`): editing it does not make the product classifier out of date or force it to be
retrained.

### reference_doses.csv

The **standard dose** — PAU's flat, medium-fertility-soil fertilizer recommendation, not gross
crop nutrient demand (see the engine-formula note above).

| Column | Meaning | Unit |
|---|---|---|
| `crop_id` | Foreign key into crops.csv | snake_case id |
| `variety_id` | Foreign key into crop_varieties.csv, or the fixed fallback `generic` | snake_case id |
| `irrigation` | Irrigation condition the dose applies to | `irrigated` / `rainfed` |
| `region` | State/region the dose applies to | e.g. `Punjab` |
| `n_kg_ha`, `p2o5_kg_ha`, `k2o_kg_ha` | Standard fertilizer dose | kg/ha (source tables are in kg/acre; converted at 1 acre = 0.4047 ha, i.e. x2.4711) |
| `source` | Citation, including page number | free text |
| `notes` | Caveats (soil-test-conditional additions, variety exceptions, alternative STCR equations, etc.) | free text |

Engine lookup order: exact `(crop_id, variety_id)` match, then `(crop_id, "generic")`.

**All 7 crops covered** (wheat, rice, chickpea, maize, cotton, sugarcane, barley -- real,
PAU-sourced).

### soil_adjustments.csv

Adjusts the standard dose based on the field's own soil-test rating for that nutrient, using
PAU's published soil-test-conditional rules where they exist. Signed, in P2O5/K2O terms.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id` | Foreign key into reference_doses.csv | snake_case id |
| `nutrient` | `n` / `p` / `k` | string |
| `soil_rating` | The soil_test_ratings.csv band this adjustment applies at | `very_low` / `low` / `medium` / `high`, or `TODO(data)` |
| `adjustment_kg_ha` | Amount to add to (positive) or subtract from (negative) the standard dose | kg/ha, or `TODO(data)` |
| `source` | Citation, or an explicit statement that no PAU adjustment table was found — never left blank | free text |
| `notes` | Caveats, including STCR alternatives where a full replacement equation exists instead | free text |

**A missing `(crop_id, nutrient, soil_rating)` row means no adjustment (0) — a deliberate, safe
default**, unlike the retired demand/supply formula's `soil_supply_factor`, where a missing
value couldn't safely default to anything (a 0 there would have overstated the deficit and
recommended *more* fertilizer, the wrong direction). Adjustments can be negative by design (e.g.
rice: PAU says apply P2O5/K2O "only when the soil test shows deficiency" — the standard dose
already assumes deficiency, so the adjustment for a *sufficient* soil test is `-` the full
standard dose, skipping it).

**Known gap:** wheat and rice N (and wheat P2O5) have no published PAU soil-test adjustment
table — only `TODO(data)` rows, with the STCR equation noted as a full alternative computation
path (see `stcr_equations.csv`). The same is true of any other crop and nutrient without a row
(maize N, P and K, for example).

**How the engine covers the gap.** For a crop and nutrient with no PAU adjustment, the engine
applies the general ICAR soil-test band rule from `agronomy_rules.yaml` (`soil_rating_fallback`):
a low or very low rating adds 25% of the standard dose, a medium rating keeps it, a high rating
takes off 25%, the same dose anywhere inside a band. Where PAU publishes an adjustment (wheat K,
rice P and K, cotton K, sugarcane P and K, barley K) that table decides and the band rule never
touches it. The 25% factors are a team assumption pending an agronomist's sign-off, nitrogen
above all. Switching `soil_rating_fallback.enabled` to `false` restores the flat standard dose.
pH, organic carbon and moisture never change a dose. The farmer sees which band applied and
what it did to the dose in the plan's data notes.

### stcr_equations.csv

Optional. Soil Test Crop Response targeted-yield equations: `fertilizer needed = a * target
yield - b * soil test`, a full alternative to standard-dose-plus-adjustment for a given
crop/variety/nutrient when a yield target is available.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id`, `variety_id` | The crop/variety this equation was calibrated for | snake_case id |
| `region` | Where the equation was calibrated — may differ from the demo region | free text |
| `applies_to` | Irrigation condition, inferred from the source table's "Situation" field | `irrigated` / `rainfed` |
| `nutrient` | `n` / `p` / `k` | string |
| `a`, `b` | Regression coefficients: `needed = a*T - b*ST` | numeric |
| `target_yield_default_q_ha` | A fallback yield target if the field doesn't supply one | q/ha, or `TODO(data)` |
| `source` | Citation | free text |
| `notes` | Caveats (region substitution, coefficient provenance, etc.) | free text |

**v0: wheat cv. WH 542, N and P2O5** (ICAR-IISS, Hisar/Haryana — the national STCR compilation
has no Punjab centre; Haryana is the nearest applicable substitute, same Trans-Gangetic Plain
zone, flagged via the `region` column rather than left implicit). `target_yield_default_q_ha`
is `TODO(data)` — no sourced typical/realistic Punjab wheat yield target found yet.
`applies_to` is an inference from the source document's "Situation: Irrigated" field, not a
literal source column — flagged in case a different `applies_to` semantics was intended.

### split_schedule.csv

| Column | Meaning | Unit |
|---|---|---|
| `crop_id`, `stage_id` | Foreign keys into crops.csv / growth_stages.csv | snake_case id |
| `n_fraction`, `p_fraction`, `k_fraction` | Share of that nutrient's total dose applied at this stage | 0–1, each nutrient's fractions sum to 1 across a crop's stages |

**All 7 crops covered** (wheat, rice, chickpea, maize, cotton, sugarcane, barley). Note rice's
stage timing is in Days After Transplanting (DAT), not DAS — see the growth_stages.csv note
above.

### nutrient_efficiency.csv

Used **only** to credit recent applications (`credit_kg_ha = prior_application_kg_ha *
fertilizer_use_efficiency`) — not for a demand/supply split, which is what caused the retired
formula's double-counting problem.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id` | Crop this efficiency applies to, or the fixed fallback `default` | snake_case id |
| `nutrient` | `n` / `p` / `k` | string |
| `fertilizer_use_efficiency` | Share of applied nutrient the crop recovers | 0–1, or `TODO(data)` |
| `source` | Citation, or an explicit "no defensible source found" statement — never left blank | free text |
| `notes` | Caveats (national-average vs. region-specific, etc.) | free text |

Engine lookup order: exact `crop_id` match, then `default`. **`default`/N/P/K all sourced**:
N is 42.6% (a real but *national-average, rice-only* recovery-efficiency figure, used as an
interim stand-in and flagged as such, Kaur et al. 2023); P is 20% and K is 55% (PIB Release ID
2237709, 10 Mar 2026, Ministry of Chemicals and Fertilizers, citing ICAR studies: national NUE
ranges 15-25% for P and 50-60% for K — the midpoint of each range). No crop-specific override
exists yet for any nutrient, only the `default` row.

### fertilizer_products.csv

| Column | Meaning | Unit |
|---|---|---|
| `product_id` | Stable snake_case identifier | e.g. `urea`, `dap`, `npk_10_26_26` |
| `name` | Display name | string |
| `dataset_label` | The label this product maps to in the chosen training dataset | string, e.g. `10-26-26` — replaces a separate alias file |
| `n_pct`, `p2o5_pct`, `k2o_pct` | Nutrient content by weight (guaranteed grade, per FCO 1985 nomenclature) | % (0–100) |
| `price_inr_per_kg` | Retail price | INR/kg, or `TODO(data)` if no defensible dated price was found |
| `price_date` | Date the price was current as of | ISO date, or `TODO(data)` if not confirmed |
| `bag_size_kg` | Retail bag size, for `GET /reference/fertilizers` | kg, or `TODO(data)`/null if unknown for that product |
| `source` | Citation (IFFCO price list, PIB/Department of Fertilizers notification, state MRP, etc.) | free text |

All 9 grades in the chosen training dataset have real N/P2O5/K2O percentages (FCO nomenclature
is definitional). Prices, dates and bag sizes are real and confirmed for urea (45kg), DAP,
NP 28-28-0 and NPK 10-26-26 (all 50kg) — IFFCO's published price list, w.e.f. 1 Jan 2025. MOP
is also now priced (₹34.21/kg, 50kg bag) — a government-reported market-average retail price
(PIB Release ID 2237470, 10 Mar 2026), not one company's MRP list the way the IFFCO-sourced
grades are.
`bag_size_kg` is left `TODO(data)` rather than assumed for the remaining products even though
50kg is the common industry-standard bag size for most Indian fertilizer grades — no primary
citation was found for those specific products. SSP and the remaining NPK grades (`npk_14_35_14`,
`npk_17_17_17`, `np_20_20_0`) are still `price_inr_per_kg: TODO(data)` — they're under a
**decontrolled MRP regime** (confirmed via PIB Backgrounder, Release ID 2211384, 5 Jan 2026), so
only their government *subsidy* rate is publicly fixed, not the consumer price; subsidy figures
are noted in each row for context but never substituted for a retail price. **A missing price is
never treated as 0 in a comparison.** The engine does recommend a product that has no price (single
superphosphate for sugarcane, for example), because the right product matters more than being able to
cost it. The cost shown then leaves that product out and says so in the plan's data notes, and the
saving against earlier applications is left unknown rather than computed from a partial cost. `GET
/reference/fertilizers` lists such a product with a `null` price, so the app can name it, log it and check a plan
that uses it.

### phosphorus_sources.csv

Which product supplies the phosphorus in a plan. PAU's fertilizer table for each crop lists the
phosphorus source (DAP or single superphosphate; nitrophosphate for wheat and maize; sugarcane lists
only single superphosphate), and the engine uses the first one listed.

| Column | Meaning | Unit |
|---|---|---|
| `crop_id` | Foreign key into crops.csv; one row per crop | snake_case id |
| `primary_product` | The product the plan uses for phosphorus | `product_id` in fertilizer_products.csv |
| `alternative_products` | Other products that can supply the same phosphorus, shown in a note with their quantities | `product_id`s joined with `\|` |
| `alternative_timing` | What PAU says about timing when an alternative is used, e.g. wheat: with superphosphate, 20 kg urea per acre at sowing | `product=text`, joined with `\|`, or empty |
| `source` | The PAU table the choice comes from | free text |
| `notes` | Matching assumptions, for example nitrophosphate taken as `np_20_20_0` | free text |

Nitrogen carried by the phosphorus product is credited against urea, so a product without nitrogen
(single superphosphate) means more urea. The soil schema has no sulphur reading, so the engine cannot
tell whether sulphur is short; the plan only mentions that single superphosphate supplies it. Gram lists only single superphosphate, so, like sugarcane, it plans that.

### soil_test_ratings.csv

| Column | Meaning | Unit |
|---|---|---|
| `parameter` | Soil parameter name | `organic_carbon`, `n`, `p`, `k`, `ph` |
| `unit` | Unit that parameter is measured in | e.g. `%`, `kg/ha`, `pH units` |
| `very_low_below` | Optional cutoff for a 4th "very low" tier | same unit as `unit`, or blank/`TODO(data)` |
| `low_below` / `high_above` | Cutoffs separating low / medium / high ratings | same unit as `unit` |
| `source` | Citation | free text |

Full coverage (organic_carbon, n, p, k, ph) from ICAR-IISS Bhopal's national soil-test
interpretation ranges, as used on Soil Health Cards. `p`'s cutoffs are the Olsen-P method
figures, applicable to Punjab's predominantly alkaline soils. `k`'s `very_low_below` is
`TODO(data)` — PAU's wheat fertilizer table distinguishes a "very low" K tier (used by
`soil_adjustments.csv`'s `wheat/k/very_low` row) but doesn't itself publish the kg/ha cutoff
between "low" and "very low".

### seasonal_weather.csv

Fallback weather when a live/cached call isn't available (`weather.source = seasonal_average`).

| Column | Meaning | Unit |
|---|---|---|
| `region_key` | Region identifier | snake_case, e.g. `punjab_ludhiana` |
| `month` | Calendar month | 1–12 |
| `temperature_c`, `humidity_pct`, `rainfall_mm_5day` | Seasonal-average weather | °C, %, mm |
| `source` | Citation | free text |

**Full 12-month coverage (R7)** for `punjab_ludhiana`, built by `weather_client.build_seasonal_fallback()`
from real Open-Meteo archive data (2022-2024 daily values, averaged per month) -- not the R1/R3
placeholder (a single January row estimated from a secondary climate aggregator, now replaced).
`rainfall_mm_5day` is mean daily rainfall x5, not a directly-published 5-day figure; every row's
`source` cell states the exact years and coordinates averaged, and says plainly it's an average,
not a forecast. Regenerate with `python -c "from src.weather.weather_client import build_seasonal_fallback; build_seasonal_fallback([{'region_key': 'punjab_ludhiana', 'lat': 30.9010, 'lon': 75.8573}], years=[2022,2023,2024])"`.

### agronomy_rules.yaml

Rule-layer parameters: nutrient credit window (days), rain-hold thresholds (mm / days), over-
and under-application risk ratios, and the sanity-test formula tolerance (%). Every key carries
an inline comment with either a source citation or the words "team assumption" — all keys
remain placeholders; validating them against real guidance is follow-up work.

### explanation_templates.yaml

`template_id -> {en, hi}` sentence with `{placeholders}`, keyed to Saloni's `rule_trace`
`rule_id`s (contract C6). Full coverage (every rule_id, risk reason, soil/yield impact
statement) is a follow-up pass — one example exists, matching `soil_adjustments.csv`'s
wheat-K-low rule, to prove the shape out.

## Reference tables (`ml/data/external/`, schemas in the prompt packs, contract C5)

`crops.csv`, `crop_varieties.csv`, `growth_stages.csv`, `reference_doses.csv`, `soil_adjustments.csv`, `stcr_equations.csv` (optional), `split_schedule.csv`, `nutrient_efficiency.csv` (per crop, used for credit only), `phosphorus_sources.csv`, `stage_timing_estimates.csv`, `fertilizer_products.csv`, `soil_test_ratings.csv`, `agronomy_rules.yaml`, `explanation_templates.yaml`, `seasonal_weather.csv`. Every value has a `source`.
