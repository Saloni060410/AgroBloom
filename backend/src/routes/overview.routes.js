import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { getOverview } from '../controllers/overview.controller.js'

const router = Router()

router.get('/', requireAuth, getOverview)

export default router
