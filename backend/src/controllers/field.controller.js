import { z } from 'zod'
import { prisma } from '../config/db.js'
import { parsePagination, paginatedResponse } from '../utils/pagination.js'
import { getCrops } from '../services/referenceService.js'

export const createFieldSchema = z.object({
  name: z.string().min(1).max(120),
  areaAcres: z.number().positive().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  pincode: z.string().optional(),
  cropType: z.string().min(1).optional(),
  cropVariety: z.string().min(1).nullable().optional(),
  growthStage: z.string().min(1).optional(),
  irrigation: z.enum(['irrigated', 'rainfed']).optional(),
  sowingDate: z.coerce.date().optional(),
})

export const patchFieldSchema = z.object({
  cropType: z.string().min(1).optional(),
  cropVariety: z.string().min(1).nullable().optional(),
  growthStage: z.string().min(1).optional(),
  irrigation: z.enum(['irrigated', 'rainfed']).optional(),
  sowingDate: z.coerce.date().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  areaAcres: z.number().positive().optional(),
})

async function validateCropFields({ cropType, cropVariety, growthStage }) {
  const crops = await getCrops()

  const crop = crops.find((c) => c.id === cropType)

  if (cropType && !crop) {
    return { ok: false, error: `Unknown cropType: ${cropType}` }
  }

  if (cropVariety && crop && !crop.varieties.some((v) => v.id === cropVariety)) {
    return {
      ok: false,
      error: `Unknown cropVariety: ${cropVariety} for crop ${cropType}`,
    }
  }

  if (growthStage && crop && !crop.stages.some((s) => s.id === growthStage)) {
    return {
      ok: false,
      error: `Unknown growthStage: ${growthStage} for crop ${cropType}`,
    }
  }

  return { ok: true }
}

export async function listFieldsForFarm(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const [items, total] = await Promise.all([
      prisma.field.findMany({ where: { farmId: req.farm.id }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.field.count({ where: { farmId: req.farm.id } }),
    ])
    res.json(paginatedResponse({ items, page, limit, total }))
  } catch (err) {
    next(err)
  }
}

export async function createField(req, res, next) {
  try {
    const { cropType, cropVariety, growthStage } = req.body

    if (cropType || cropVariety !== undefined || growthStage) {
      try {
        const check = await validateCropFields({ cropType, cropVariety, growthStage })
        if (!check.ok) return res.status(400).json({ error: check.error })
      } catch (err) {
        if (err.name !== 'ReferenceUnavailableError') throw err
        // Reference data is down — don't block field creation on it.
      }
    }

    const field = await prisma.field.create({
      data: {
        ...req.body,
        farmId: req.farm.id,
      },
    })

    res.status(201).json(field)
  } catch (err) {
    next(err)
  }
}

export async function getField(req, res) {
  res.json(req.field) // set by assertFieldOwner
}

export async function patchField(req, res, next) {
  try {
    const { cropType, cropVariety, growthStage } = req.body
    if (cropType || cropVariety !== undefined || growthStage) {
      try {
        const check = await validateCropFields({ cropType, cropVariety, growthStage })
        if (!check.ok) return res.status(400).json({ error: check.error })
      } catch (err) {
        if (err.name !== 'ReferenceUnavailableError') throw err
        // Reference data is down — don't block field creation on it.
      }
    }

    const updated = await prisma.field.update({ where: { id: req.field.id }, data: req.body })
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

// Removes one crop's field. Its soil tests, fertilizer logs and recommendations go with it
// (onDelete: Cascade); the farm and its other fields stay.
export async function deleteField(req, res, next) {
  try {
    await prisma.field.delete({ where: { id: req.field.id } })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
