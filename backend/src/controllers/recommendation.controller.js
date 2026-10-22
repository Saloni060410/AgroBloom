import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { prisma } from '../config/db.js'
import { getWeatherForField, getRainfallHistory } from '../services/weatherService.js'
import { recommend, MlPayloadError } from '../services/mlService.js'
import { parsePagination, paginatedResponse } from '../utils/pagination.js'

const RISK_LEVEL_MAP = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' }
const IDEMPOTENCY_WINDOW_MS = 30_000
const PREVIOUS_SOIL_TESTS = 5
const isoDate = (date) => date.toISOString().slice(0, 10)

export const createRecommendationSchema = z
  .object({
    soilTestId: z.string().uuid().optional(),
    cropType: z.string().min(1).optional(),
    cropVariety: z.string().min(1).nullable().optional(),
    growthStage: z.string().min(1).optional(),
  })
  .optional()
  .transform((v) => v ?? {})

function toApiRecommendation(row, { areaAcres } = {}) {
  const weatherStale = row.weatherSource != null && row.weatherSource !== 'live'
  const savingTotal =
    row.estimatedSaving != null && areaAcres != null ? row.estimatedSaving * areaAcres : null

  return {
    id: row.id,
    fieldId: row.fieldId,
    soilTestId: row.soilTestId,
    cropType: row.cropType,
    cropVariety: row.cropVariety,
    growthStage: row.growthStage,
    fertilizerType: row.fertilizerType,
    quantityKgPerAcre: row.quantityKgPerAcre,
    schedule: row.schedule,
    risk: {
      level: row.riskLevel,
      reason: row.riskReason,
      soilHealthImpact: row.soilHealthImpact,
      yieldImpact: row.yieldImpact,
    },
    topFactors: row.topFactors,
    explanation: row.explanation,
    weatherSource: row.weatherSource,
    weatherStale,
    estimatedCost: row.estimatedCost,
    estimatedSaving: row.estimatedSaving,
    savingTotal,
    modelVersion: row.modelVersion,
    createdAt: row.createdAt,
  }
}

export async function createRecommendation(req, res, next) {
  try {
    const field = req.field
    const { soilTestId, cropType: bodyCropType, cropVariety: bodyCropVariety, growthStage: bodyGrowthStage } = req.body

    const cropType = bodyCropType ?? field.cropType
    const cropVariety = bodyCropVariety !== undefined ? bodyCropVariety : field.cropVariety
    const growthStage = bodyGrowthStage ?? field.growthStage

    if (!cropType) return res.status(409).json({ error: 'Field has no crop type set' })
    if (!growthStage) return res.status(409).json({ error: 'Field has no growth stage set' })

    let soilTest
    if (soilTestId) {
      soilTest = await prisma.soilTest.findUnique({ where: { id: soilTestId } })
      if (!soilTest || soilTest.fieldId !== field.id) {
        return res.status(404).json({ error: 'Soil test not found for this field' })
      }
    } else {
      soilTest = await prisma.soilTest.findFirst({ where: { fieldId: field.id }, orderBy: { testedOn: 'desc' } })
    }
    if (!soilTest) return res.status(409).json({ error: 'Field has no soil test' })

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const fertilizerLogs = await prisma.fertilizerLog.findMany({
      where: { fieldId: field.id, appliedOn: { gte: twelveMonthsAgo } },
      orderBy: { appliedOn: 'asc' },
    })

    // Earlier tests (never the one being used) let the engine flag sudden jumps and trends.
    const previousSoilTests = await prisma.soilTest.findMany({
      where: { fieldId: field.id, testedOn: { lt: soilTest.testedOn } },
      orderBy: { testedOn: 'desc' },
      take: PREVIOUS_SOIL_TESTS,
    })

    const weather = await getWeatherForField({ id: field.id, latitude: field.latitude, longitude: field.longitude })
    const rainfallHistory = await getRainfallHistory({ id: field.id, latitude: field.latitude, longitude: field.longitude })

    const payload = {
      field_id: field.id,
      crop_type: cropType,
      variety: cropVariety ?? null,
      irrigation: field.irrigation ?? 'irrigated',
      growth_stage: growthStage,
      sowing_date: field.sowingDate ? isoDate(field.sowingDate) : null,
      soil: {
        n: soilTest.n,
        p: soilTest.p,
        k: soilTest.k,
        ph: soilTest.ph,
        organic_carbon: soilTest.organicCarbon,
        moisture: soilTest.moisture,
      },
      weather: {
        temperature_c: weather.temperature_c,
        humidity_pct: weather.humidity_pct,
        rainfall_mm_forecast: weather.rainfall_mm_forecast,
        source: weather.source,
      },
      previous_fertilizer_usage: fertilizerLogs.map((log) => ({
        type: log.type,
        quantity_kg_per_acre: log.quantityKgPerAcre,
        applied_on: isoDate(log.appliedOn),
      })),
      soil_tested_on: isoDate(soilTest.testedOn),
      previous_soil_tests: previousSoilTests.map((test) => ({
        tested_on: isoDate(test.testedOn),
        n: test.n,
        p: test.p,
        k: test.k,
        ph: test.ph,
        organic_carbon: test.organicCarbon,
        moisture: test.moisture,
      })),
      rainfall_history: rainfallHistory,
    }

    const recent = await prisma.recommendation.findFirst({
      where: { fieldId: field.id, createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
    })
    if (recent && isDeepStrictEqual(recent.inputSnapshot, payload)) {
      return res.status(200).json(toApiRecommendation(recent, { areaAcres: field.areaAcres }))
    }

    let mlResult
    try {
      mlResult = await recommend(payload)
    } catch (err) {
      if (err instanceof MlPayloadError) {
        return res.status(400).json({ error: err.message, detail: err.detail })
      }
      throw err
    }

    const created = await prisma.recommendation.create({
      data: {
        fieldId: field.id,
        soilTestId: soilTest.id,
        cropType,
        cropVariety: cropVariety ?? null,
        growthStage,
        fertilizerType: mlResult.recommendation.fertilizer_type,
        quantityKgPerAcre: mlResult.recommendation.quantity_kg_per_acre,
        schedule: mlResult.recommendation.schedule,
        riskLevel: RISK_LEVEL_MAP[mlResult.risk.level],
        riskReason: mlResult.risk.reason,
        soilHealthImpact: mlResult.risk.soil_health_impact,
        yieldImpact: mlResult.risk.yield_impact,
        explanation: mlResult.explanation,
        weatherSource: weather.source,
        inputSnapshot: payload,
        topFactors: mlResult.explanation.top_factors,
        estimatedCost: mlResult.cost.estimated_cost_inr_per_acre,
        estimatedSaving: mlResult.cost.saving_inr_per_acre,
        modelVersion: mlResult.model_version,
      },
    })

    res.status(201).json(toApiRecommendation(created, { areaAcres: field.areaAcres }))
  } catch (err) {
    next(err)
  }
}

export async function listRecommendationsForField(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const [items, total] = await Promise.all([
      prisma.recommendation.findMany({ where: { fieldId: req.field.id }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.recommendation.count({ where: { fieldId: req.field.id } }),
    ])
    res.json(
      paginatedResponse({
        items: items.map((row) => toApiRecommendation(row, { areaAcres: req.field.areaAcres })),
        page,
        limit,
        total,
      })
    )
  } catch (err) {
    next(err)
  }
}

export async function getRecommendationById(req, res, next) {
  try {
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: req.params.id },
      include: { field: { include: { farm: true } } },
    })
    if (!recommendation || recommendation.field.farm.ownerId !== req.user.id) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(toApiRecommendation(recommendation, { areaAcres: recommendation.field.areaAcres }))
  } catch (err) {
    next(err)
  }
}