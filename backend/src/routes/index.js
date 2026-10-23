import { Router } from 'express'
import authRoutes from './auth.routes.js'
import farmRoutes from './farm.routes.js'
import fieldRoutes from './field.routes.js'
import referenceRoutes from './reference.routes.js'
import geocodeRoutes from './geocode.routes.js'
import recommendationRoutes from './recommendation.routes.js'
import overviewRoutes from './overview.routes.js'

const router = Router()

router.get('/health', (req, res) => res.json({ status: 'ok' }))
router.use('/auth', authRoutes)
router.use('/overview', overviewRoutes)
router.use('/farms', farmRoutes)
router.use('/fields', fieldRoutes)
router.use('/reference', (req, res, next) => {
  res.set('Cache-Control', 'private, max-age=300')
  next()
}, referenceRoutes)
router.use('/geocode', geocodeRoutes)
router.use('/recommendations', recommendationRoutes)

export default router