import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";
import axios from "axios";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Loads .env if one exists (docker compose sets these directly in the container's own
// environment instead, which dotenv.config() never overrides -- safe either way). Needed here,
// specifically, because this file is invoked directly (`node prisma/seed.js`), not through a
// path that already loads it -- unlike src/config/env.js, which the running server always goes
// through first.
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const farmer = await prisma.user.upsert({
    where: { email: "farmer@khetgpt.demo" },
    update: {},
    create: {
      email: "farmer@khetgpt.demo",
      passwordHash: await bcrypt.hash("Farmer@123", 10),
      name: "Demo Farmer",
      role: Role.FARMER,
    },
  });

  await prisma.user.upsert({
    where: { email: "agronomist@khetgpt.demo" },
    update: {},
    create: {
      email: "agronomist@khetgpt.demo",
      passwordHash: await bcrypt.hash("Agronomist@123", 10),
      name: "Demo Agronomist",
      role: Role.AGRONOMIST,
    },
  });

  const farm = await prisma.farm.upsert({
    where: { id: "seed-farm-1" },
    update: {},
    create: { id: "seed-farm-1", name: "Demo Farm", ownerId: farmer.id },
  });

  const field = await prisma.field.upsert({
    where: { id: "seed-field-1" },
    update: {},
    create: {
      id: "seed-field-1",
      name: "Wheat Field 1",
      farmId: farm.id,
      areaAcres: 2.5,
      latitude: 19.9975,
      longitude: 73.7898,
      pincode: "422001",
      cropType: "wheat",
      growthStage: "sowing",
      sowingDate: new Date("2026-11-05"),
    },
  });

  await prisma.soilTest.upsert({
    where: { id: "seed-soiltest-1" },
    update: {},
    create: {
      id: "seed-soiltest-1",
      fieldId: field.id,
      n: 210, p: 9, k: 90, ph: 7.4,
      organicCarbon: 0.42, moisture: 18,
    },
  });

  await prisma.fertilizerLog.createMany({
    data: [
      { id: "seed-fertlog-1", fieldId: field.id, type: "dap", quantityKgPerAcre: 80, appliedOn: new Date("2026-03-10") },
      { id: "seed-fertlog-2", fieldId: field.id, type: "urea", quantityKgPerAcre: 200, appliedOn: new Date("2026-03-25") },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete:", {
    users: await prisma.user.findMany({ select: { id: true, email: true, role: true } }),
    farms: await prisma.farm.findMany(),
    fields: await prisma.field.findMany(),
    soilTests: await prisma.soilTest.findMany(),
    fertilizerLogs: await prisma.fertilizerLog.findMany(),
  });
}

// --- npm run db:seed:demo / npm run demo:reset -------------------------------------------
//
// Reads docs/contract-fixtures/demo_scenarios.json directly (Richa's R11 source of truth,
// the same file docs/demo-scenarios.md is generated from) rather than hand-copying its farm/
// field/soil-test/fertilizer-log data into this file -- if a reference table changes and the
// fixture is re-run/updated, this seed picks up the new numbers automatically instead of
// silently drifting from it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "..", "..", "docs", "contract-fixtures", "demo_scenarios.json");

const DEMO_FARMER_EMAIL = process.env.DEMO_FARMER_EMAIL;
const DEMO_FARMER_PASSWORD = process.env.DEMO_FARMER_PASSWORD;
// Never committed (see backend/.env.example, backend/DEMO.md) -- these fall back to a working
// default so the demo isn't dead in the water if .env hasn't been set up yet, but the fallback
// is loudly logged rather than silently used, since it's not a secret anyone should rely on.
const DEMO_EMAIL = DEMO_FARMER_EMAIL || "demo@khetgpt.local";
const DEMO_PASSWORD = DEMO_FARMER_PASSWORD || "DemoFarmer!2026";
if (!DEMO_FARMER_EMAIL || !DEMO_FARMER_PASSWORD) {
  console.warn(
    "DEMO_FARMER_EMAIL/DEMO_FARMER_PASSWORD not set in the environment -- using a built-in " +
    "fallback demo login. Set both in backend/.env (never committed) for anything beyond a " +
    "quick local check. See backend/DEMO.md."
  );
}

// The backend's own running HTTP API, not a direct call into mlService.js/weatherService.js --
// deliberately: a Recommendation row's shape (riskLevel enum casing, estimatedCost/estimatedSaving
// from compare_to_history, the 30s idempotency window, cropType/growthStage resolution) is
// recommendation.controller.js's logic. Reimplementing that here would drift from the real
// code path the first time either one changes. DEMO_SEED_API_BASE_URL overrides this for a
// setup where the seed script and the server aren't sharing docker-compose's default port
// mapping (e.g. run from the host against a differently-published container).
const API_BASE_URL = process.env.DEMO_SEED_API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

function loadFixtureScenarios() {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
  return fixture.scenarios;
}

// The fixture's dates are fixed 2026 calendar dates tied to each scenario's own demo_today,
// but /fields/:id/recommendations always asks the ML service using the real server clock
// (ml/src/engine/recommendation_engine.py's today = today or date.today()) -- so seeding the
// fixture's dates as-is only reproduces docs/demo-scenarios.md's documented story on the one
// day they happen to land inside agronomy_rules.yaml's credit window (verified directly:
// without this shift, the wheat scenario came back MEDIUM/54.4 kg per acre instead of the
// documented HIGH/22.4). This mirrors ml/scripts/demo_requests.py's own fix for the exact same
// problem on the ML side, one day-offset per scenario computed the same way, so re-seeding on
// any later day keeps telling the intended story instead of a real-clock-dependent one.
function utcDateOnly(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(laterDate, earlierDate) {
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / 86_400_000);
}

function shiftIsoDate(isoDateString, shiftDays) {
  const date = new Date(`${isoDateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + shiftDays);
  return date;
}

async function upsertDemoFarmer() {
  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) },
    create: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      name: "Demo Farmer",
      role: Role.FARMER,
    },
  });
}

async function upsertScenarioFarmAndField(scenario, ownerId) {
  const { farm, field, soil_test: soilTest, fertilizer_logs: fertilizerLogs } = scenario.seed;
  const { crop_type: cropType, growth_stage: growthStage, irrigation, sowing_date: sowingDate } =
    scenario.recommend_request;
  const shiftDays = daysBetween(utcDateOnly(new Date()), new Date(`${scenario.demo_today}T00:00:00.000Z`));

  const farmRow = await prisma.farm.upsert({
    where: { id: farm.farm_id },
    update: { name: farm.name },
    create: { id: farm.farm_id, name: farm.name, ownerId },
  });

  const fieldRow = await prisma.field.upsert({
    where: { id: field.field_id },
    update: {
      name: field.name,
      areaAcres: field.area_acres,
      latitude: field.latitude,
      longitude: field.longitude,
      cropType,
      growthStage,
      irrigation,
      sowingDate: shiftIsoDate(sowingDate, shiftDays),
    },
    create: {
      id: field.field_id,
      farmId: farmRow.id,
      name: field.name,
      areaAcres: field.area_acres,
      latitude: field.latitude,
      longitude: field.longitude,
      cropType,
      growthStage,
      irrigation,
      sowingDate: shiftIsoDate(sowingDate, shiftDays),
    },
  });

  const soilTestId = `${field.field_id}-soiltest`;
  await prisma.soilTest.upsert({
    where: { id: soilTestId },
    update: {
      n: soilTest.n, p: soilTest.p, k: soilTest.k, ph: soilTest.ph,
      organicCarbon: soilTest.organic_carbon, moisture: soilTest.moisture,
      testedOn: shiftIsoDate(soilTest.tested_on, shiftDays),
    },
    create: {
      id: soilTestId,
      fieldId: fieldRow.id,
      n: soilTest.n, p: soilTest.p, k: soilTest.k, ph: soilTest.ph,
      organicCarbon: soilTest.organic_carbon, moisture: soilTest.moisture,
      testedOn: shiftIsoDate(soilTest.tested_on, shiftDays),
    },
  });

  // upsert, not createMany + skipDuplicates: the dates need to genuinely update on a re-seed
  // done on a different day (skipDuplicates would insert once and then silently never touch
  // these rows again, leaving stale, wrongly-dated logs behind on the next day's re-run).
  for (const [index, log] of fertilizerLogs.entries()) {
    const logId = `${field.field_id}-log-${index}`;
    const data = {
      fieldId: fieldRow.id,
      type: log.type,
      quantityKgPerAcre: log.quantity_kg_per_acre,
      appliedOn: shiftIsoDate(log.applied_on, shiftDays),
    };
    await prisma.fertilizerLog.upsert({ where: { id: logId }, update: data, create: { id: logId, ...data } });
  }

  return fieldRow;
}

// One groupBy for every field, not a count per field: the old loop ran one query per field just to
// learn which ones already had a plan. Logs in lazily (once, for the first field that needs a plan).
async function pregenerateRecommendations(fieldIds) {
  if (fieldIds.length === 0) return;

  const withPlan = new Set(
    (await prisma.recommendation.groupBy({ by: ["fieldId"], where: { fieldId: { in: fieldIds } } })).map((row) => row.fieldId)
  );

  let accessToken = null;
  for (const fieldId of fieldIds) {
    if (withPlan.has(fieldId)) {
      console.log(`  recommendation already exists for ${fieldId}, skipping`);
      continue;
    }

    if (accessToken === null) {
      const login = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      accessToken = login.data.accessToken;
    }

    await axios.post(
      `${API_BASE_URL}/api/fields/${fieldId}/recommendations`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log(`  recommendation created for ${fieldId}`);
  }
}

async function seedDemoScenarios({ reset, withRecommendations }) {
  if (reset) {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      const deleted = await prisma.farm.deleteMany({ where: { ownerId: existing.id } });
      console.log(`Reset: removed ${deleted.count} farm(s) (and everything under them) owned by ${DEMO_EMAIL}`);
    } else {
      console.log(`Reset: no existing user ${DEMO_EMAIL} yet, nothing to remove`);
    }
  }

  const farmer = await upsertDemoFarmer();
  console.log(`Demo farmer ready: ${DEMO_EMAIL} (${farmer.id})`);

  const scenarios = loadFixtureScenarios();
  const fields = [];
  for (const scenario of scenarios) {
    const field = await upsertScenarioFarmAndField(scenario, farmer.id);
    fields.push(field);
    console.log(`Seeded scenario "${scenario.id}": farm/field/soil-test/fertilizer-log(s) in place`);
  }

  if (withRecommendations) {
    console.log(`Pre-generating recommendations through ${API_BASE_URL} (optional step)...`);
    try {
      await pregenerateRecommendations(fields.map((field) => field.id));
    } catch (err) {
      // Optional, per the task -- the seed data itself (farms/fields/soil tests/logs) is
      // already committed above regardless of whether this step succeeds. A down ML service,
      // a down backend, or Open-Meteo being unreachable all land here; never fail the seed
      // over it, just say clearly that History will be empty until it's retried.
      console.warn(
        `Could not pre-generate recommendations (${err.code || err.response?.status || err.message}). ` +
        "Demo data is seeded; History will be empty until the backend and ML service are both " +
        "reachable and npm run db:seed:demo is re-run, or a recommendation is created normally " +
        "through the running app."
      );
    }
  }

  console.log("Demo seed complete.");
}

const args = process.argv.slice(2);
if (args.includes("--demo")) {
  seedDemoScenarios({
    reset: args.includes("--reset"),
    withRecommendations: !args.includes("--no-recommendations"),
  })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
} else {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
