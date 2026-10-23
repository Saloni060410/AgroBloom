import axios from 'axios'
import { z } from 'zod'
import { env } from '../config/env.js'

const client = axios.create({ baseURL: env.ML_SERVICE_URL, timeout: env.ML_TIMEOUT_MS })

export class MlUnavailableError extends Error {
  constructor(message = 'Recommendation service is unavailable, try again') {
    super(message)
    this.name = 'MlUnavailableError'
    this.status = 502
  }
}

export class MlPayloadError extends Error {
  constructor(detail, message = 'Invalid recommendation request') {
    super(message)
    this.name = 'MlPayloadError'
    this.status = 400
    this.detail = detail
  }
}

export class MlInvalidResponseError extends Error {
  constructor(message = 'ML service returned an unexpected response') {
    super(message)
    this.name = 'MlInvalidResponseError'
    this.status = 502
  }
}

const nutrientSchema = z.object({
  method: z.enum(['reference_dose', 'stcr']),
  soil_rating: z.enum(['very_low', 'low', 'medium', 'high']).nullable(),
  standard_dose_kg_ha: z.number(),
  soil_adjustment_kg_ha: z.number(),
  prior_credit_kg_ha: z.number(),
  fertilizer_needed_kg_ha: z.number(),
})

const recommendResponseSchema = z.object({
  recommendation: z.object({
    fertilizer_type: z.string(),
    quantity_kg_per_acre: z.number(),
    schedule: z.array(z.object({
      stage: z.string(),
      fertilizer_type: z.string(),
      quantity_kg_per_acre: z.number(),
      apply_by: z.string().nullable(),
      timing_note: z.string().nullable(),
    })),
  }),
  risk: z.object({
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string(),
    soil_health_impact: z.string(),
    yield_impact: z.string(),
    over_application_pct: z.number().nullable(),
  }),
  explanation: z.object({
    top_factors: z.array(z.string()),
    nutrient_balance: z.object({ n: nutrientSchema, p: nutrientSchema, k: nutrientSchema }),
    formula: z.string(),
    data_notes: z.array(z.string()),
    history_insights: z.array(z.object({
      kind: z.string(),
      severity: z.enum(['warning', 'watch', 'good']),
      nutrient: z.string().nullable().optional(),
      text: z.string(),
    })).optional(),
    stage_used: z.string().nullable().optional(),
  }),
  cost: z.object({
    estimated_cost_inr_per_acre: z.number(),
    previous_cost_inr_per_acre: z.number().nullable(),
    saving_inr_per_acre: z.number().nullable(),
    prices_as_of: z.string().nullable(),
    breakdown: z.array(z.object({
      fertilizer_type: z.string(),
      quantity_kg_per_acre: z.number(),
      cost_inr_per_acre: z.number(),
    })),
  }),
  impact: z.object({ over_application_reduction_pct: z.number().nullable() }),
  model_version: z.string(),
})

const nutrientAppliedSchema = z.object({
  applied_kg_ha: z.number(),
  recommended_kg_ha: z.number(),
  ratio: z.number().nullable(), // null: the crop needs none of this nutrient but some is planned
})

const riskScoreResponseSchema = z.object({
  risk: z.object({
    level: z.enum(['low', 'medium', 'high']),
    reason: z.string(),
    soil_health_impact: z.string(),
    yield_impact: z.string(),
    over_application_pct: z.number().nullable(),
  }),
  nutrient_balance: z.object({
    n: nutrientAppliedSchema,
    p: nutrientAppliedSchema,
    k: nutrientAppliedSchema,
  }),
  model_version: z.string(),
})

function isRetryable(err) {
  return !err.response || err.response.status >= 500
}

async function postWithRetry(path, payload) {
  try {
    return await client.post(path, payload)
  } catch (err) {
    if (err.response?.status === 422) throw new MlPayloadError(err.response.data?.detail)
    if (!isRetryable(err)) throw new MlUnavailableError(err.message)
    try {
      return await client.post(path, payload)
    } catch (retryErr) {
      if (retryErr.response?.status === 422) throw new MlPayloadError(retryErr.response.data?.detail)
      throw new MlUnavailableError(retryErr.message)
    }
  }
}

export async function recommend(payload) {
  const { data } = await postWithRetry('/recommend', payload)
  const parsed = recommendResponseSchema.safeParse(data)
  if (!parsed.success) throw new MlInvalidResponseError(parsed.error.message)
  return parsed.data
}

export async function riskScore(payload) {
  const { data } = await postWithRetry('/risk-score', payload)
  const parsed = riskScoreResponseSchema.safeParse(data)
  if (!parsed.success) throw new MlInvalidResponseError(parsed.error.message)
  return parsed.data
}

export async function health() {
  const { data } = await client.get('/health')
  return data
}