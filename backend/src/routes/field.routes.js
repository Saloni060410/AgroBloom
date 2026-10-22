import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { assertFieldOwner } from '../middleware/ownership.js'
import { validate } from '../middleware/validate.middleware.js'
import { patchFieldSchema, getField, patchField, deleteField } from '../controllers/field.controller.js'
import { createSoilTestSchema, createSoilTest, listSoilTests } from '../controllers/soilTest.controller.js'
import {
  createFertilizerLogSchema,
  createFertilizerLog,
  listFertilizerLogs,
} from '../controllers/fertilizerLog.controller.js'
import {
  createRecommendationSchema,
  createRecommendation,
  listRecommendationsForField,
} from '../controllers/recommendation.controller.js'
import { getFieldWeather } from '../controllers/weather.controller.js'
import { riskCheckSchema, checkRisk } from '../controllers/risk.controller.js'
import { getFieldTrends } from '../controllers/trends.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/:id', assertFieldOwner(), getField)
router.patch('/:id', assertFieldOwner(), validate(patchFieldSchema), patchField)
router.delete('/:id', assertFieldOwner(), deleteField)

router.post('/:id/soil-tests', assertFieldOwner(), validate(createSoilTestSchema), createSoilTest)
router.get('/:id/soil-tests', assertFieldOwner(), listSoilTests)

router.post('/:id/fertilizer-logs', assertFieldOwner(), validate(createFertilizerLogSchema), createFertilizerLog)
router.get('/:id/fertilizer-logs', assertFieldOwner(), listFertilizerLogs)

router.post('/:id/recommendations', assertFieldOwner(), validate(createRecommendationSchema), createRecommendation)
router.get('/:id/recommendations', assertFieldOwner(), listRecommendationsForField)

router.get('/:id/weather', assertFieldOwner(), getFieldWeather)

router.post('/:id/risk-check', assertFieldOwner(), validate(riskCheckSchema), checkRisk)
router.get('/:id/trends', assertFieldOwner(), getFieldTrends)

export default router