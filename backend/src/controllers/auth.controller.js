import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../config/db.js'
import { env } from '../config/env.js'
import { issueTokenPair, rotateRefreshToken, revokeRefreshToken } from '../services/tokenService.js'

const BCRYPT_COST = env.BCRYPT_COST
// Login always runs a real bcrypt.compare, even for unknown emails, so the response takes the same time
// whether or not the account exists. Made once, asynchronously, when first needed or at start-up: a
// hashSync here froze the server for seconds on a small host before it could answer anything.
let dummyHash = null
const dummy = () => (dummyHash ??= bcrypt.hash('dummy-password-for-timing', BCRYPT_COST))
dummy().catch(() => {})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  name: z.string().min(1),
  role: z.enum(['FARMER', 'AGRONOMIST']).default('FARMER'),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

function sanitizeUser(user) {
  // passwordHash is intentionally removed from the response
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = user
  return rest
}

export async function register(req, res, next) {
  try {
    const { email, password, name, role } = req.body

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const user = await prisma.user.create({ data: { email, passwordHash, name, role } })
    const tokens = await issueTokenPair(user)

    res.status(201).json({ user: sanitizeUser(user), ...tokens })
  } catch (err) {
    next(err)
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    const valid = await bcrypt.compare(password, user?.passwordHash ?? (await dummy()))

    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' })

    const tokens = await issueTokenPair(user)
    res.json({ user: sanitizeUser(user), ...tokens })
  } catch (err) {
    next(err)
  }
}

export async function refresh(req, res, next) {
  try {
    const tokens = await rotateRefreshToken(req.body.refreshToken)
    res.json(tokens)
  } catch (err) {
    next(err)
  }
}

export async function logout(req, res, next) {
  try {
    await revokeRefreshToken(req.body.refreshToken)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(sanitizeUser(user))
  } catch (err) {
    next(err)
  }
}