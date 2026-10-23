import { prisma } from '../config/db.js'
import { toApiRecommendation } from './recommendation.controller.js'

const LOG_LIMIT = 50

// Everything the signed-in pages need to list a user's fields, in one round trip: every farm with
// its fields, and for each field the newest soil test, the newest plan and the recent fertilizer
// logs. Without it the website made one request per farm and three per field, in three waves, and
// on a distant or sleeping server those waves are what made pages slow.
export async function getOverview(req, res, next) {
  try {
    const farms = await prisma.farm.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        fields: {
          orderBy: { createdAt: 'asc' },
          include: {
            soilTests: { orderBy: { testedOn: 'desc' }, take: 1 },
            recommendations: { orderBy: { createdAt: 'desc' }, take: 1 },
            fertilizerLogs: { orderBy: { appliedOn: 'desc' }, take: LOG_LIMIT },
          },
        },
      },
    })

    res.json({
      farms: farms.map(({ fields, ...farm }) => ({
        ...farm,
        fields: fields.map(({ soilTests, recommendations, fertilizerLogs, ...field }) => ({
          ...field,
          soilTest: soilTests[0] ?? null,
          recommendation: recommendations[0] ? toApiRecommendation(recommendations[0], { areaAcres: field.areaAcres }) : null,
          fertilizerLogs,
        })),
      })),
    })
  } catch (err) {
    next(err)
  }
}
