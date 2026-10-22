import { CROPS_DATA } from '../data/cropsData.js'

const DAY_MS = 86_400_000
const FALLBACK_SEASON_DAYS = 120
const MAX_AGE_DAYS = 365

/**
 * The major points in a crop's season at which the soil's nutrient picture changes enough that an
 * earlier test no longer describes it: after sowing, through early growth, mid-season, flowering and
 * grain or pod filling, maturity and harvest, and the fallow stretch after harvest. They are cut from
 * the crop's season length (the PAU duration already in cropsData) rather than from per-crop stage
 * dates, because the reference data does not publish dates for every stage of every crop.
 */
export const STAGE_BUCKETS = [
  { id: 'sowing', until: 0.1, label: 'sowing' },
  { id: 'early', until: 0.35, label: 'early growth' },
  { id: 'mid', until: 0.6, label: 'mid-season' },
  { id: 'flowering', until: 0.85, label: 'flowering and grain filling' },
  { id: 'maturity', until: 1.05, label: 'maturity and harvest' },
  { id: 'post', until: Infinity, label: 'after harvest' },
]

/** Season length in days for a crop: the midpoint of the published range, or a default. */
export function seasonDays(cropType) {
  const text = CROPS_DATA.find((c) => c.id === cropType)?.duration
  const nums = String(text || '').match(/\d+/g)
  if (!nums) return FALLBACK_SEASON_DAYS
  const values = nums.map(Number)
  return values.reduce((a, b) => a + b, 0) / values.length
}

// Whole-day dates: a Date or an ISO string, both reduced to their UTC calendar day.
const toDate = (v) => new Date((v instanceof Date ? v.toISOString() : String(v)).slice(0, 10))

/** Which major stage the crop is in on `date`, counted from the field's sowing date; null if unknown. */
export function stageAt(field, date) {
  if (!field?.sowingDate) return null
  const das = (toDate(date) - toDate(field.sowingDate)) / DAY_MS
  const fraction = Math.max(0, das) / seasonDays(field.cropType)
  const index = STAGE_BUCKETS.findIndex((b) => fraction <= b.until)
  return { index, ...STAGE_BUCKETS[index] }
}

const shortDate = (v) => toDate(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Is this field's latest soil test still good enough to plan fertilizer from?
 *  - missing: no soil test at all.
 *  - stale: the crop has moved into a later major stage than the one the test was taken in, or the
 *    test is over a year old.
 *  - valid: otherwise.
 *  - unknown: the lookup failed, so nothing is claimed either way.
 * `now` is injectable so the rule can be tested.
 */
export function soilTestState(field, soil, now = new Date(), known = true) {
  // The lookup itself failed (network, rate limit): say so rather than claiming there is no test.
  if (!known) return { state: 'unknown', reason: 'The soil test could not be checked just now.' }
  if (!soil) return { state: 'missing', reason: 'No soil test yet. A plan needs one.' }

  const testedOn = soil.testedOn
  const ageDays = (toDate(now) - toDate(testedOn)) / DAY_MS
  const atTest = stageAt(field, testedOn)
  const atNow = stageAt(field, now)

  if (atTest && atNow && atNow.index > atTest.index) {
    const target = atNow.id === 'post' ? 'Test the soil before the next crop.' : 'Retest to keep the dose accurate.'
    return {
      state: 'stale',
      reason: `Last tested ${shortDate(testedOn)}, at ${atTest.label}. The crop is now at ${atNow.label}. ${target}`,
      testedStage: atTest.label,
      currentStage: atNow.label,
    }
  }
  if (ageDays > MAX_AGE_DAYS) {
    return { state: 'stale', reason: `Last tested ${shortDate(testedOn)}, over a year ago. Retest to keep the dose accurate.` }
  }
  return { state: 'valid', reason: `Tested ${shortDate(testedOn)}${atNow ? `, ${atNow.label}` : ''}.`, currentStage: atNow?.label }
}
