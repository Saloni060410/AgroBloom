import { daysFromToday } from './format.js'
import { soilTestState } from './soilTestStatus.js'

const HINTS_KEY = 'agrobloom.logLines'

/** Stable id of a plan line: stage, product and its position in the schedule. */
export function lineKey(line, index) {
  return `${line.stage}-${line.fertilizer_type}-${index}`
}

/**
 * Which plan line each log was marked done for, remembered on this device. The backend log has no
 * "which dose" field, so this keeps the line the farmer clicked as the line that shows as done.
 */
export function loadLineHints() {
  try {
    return JSON.parse(localStorage.getItem(HINTS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function saveLineHint(logId, key) {
  try {
    const all = loadLineHints()
    all[logId] = key
    localStorage.setItem(HINTS_KEY, JSON.stringify(all))
  } catch {
    // storage unavailable: matching falls back to the date-order rule below
  }
}

/**
 * Pairs fertilizer logs with plan lines one to one. A log counts for a line when it is the same
 * product and was made on or after the day the plan was generated; each log is used for at most one
 * line, so three urea doses need three urea logs.
 *
 * Pass 1 honours the line a log was marked done for on this device. Pass 2 pairs the remaining logs
 * with the remaining lines of the same product, dated lines first and the earliest date first, so
 * a log always clears the most overdue dose, but only when the log is close to the planned amount
 * (COMPLETES_DOSE_FRACTION): 20 kg of urea logged against a 47 kg dose is a part-application, which
 * the next plan credits, not a finished dose. Returns an array parallel to the schedule: the matched
 * log, or null for a line not applied yet.
 */
export const COMPLETES_DOSE_FRACTION = 0.9

export function matchLogsToLines(recommendation, logs, hints = loadLineHints()) {
  const lines = recommendation?.schedule || []
  if (!lines.length) return []
  const since = new Date(new Date(recommendation.createdAt).toISOString().slice(0, 10))
  const pool = (logs || [])
    .filter((l) => new Date(l.appliedOn) >= since)
    .sort((a, b) => new Date(a.appliedOn) - new Date(b.appliedOn))
  const result = lines.map(() => null)
  const used = new Set()

  pool.forEach((log, li) => {
    const idx = lines.findIndex((line, i) => lineKey(line, i) === hints[log.id] && line.fertilizer_type === log.type && !result[i])
    if (idx >= 0) {
      result[idx] = log
      used.add(li)
    }
  })

  const order = lines
    .map((line, i) => i)
    .sort((x, y) => {
      const ax = lines[x].apply_by || '9999-12-31'
      const ay = lines[y].apply_by || '9999-12-31'
      return ax === ay ? x - y : ax < ay ? -1 : 1
    })
  pool.forEach((log, li) => {
    if (used.has(li)) return
    const logged = Number(log.quantityKgPerAcre)
    // A log with no usable quantity gets the benefit of the doubt; a real one is compared with the dose.
    const completes = (i) => !Number.isFinite(logged) || logged >= COMPLETES_DOSE_FRACTION * Number(lines[i].quantity_kg_per_acre)
    const idx = order.find((i) => !result[i] && lines[i].fertilizer_type === log.type && completes(i))
    if (idx !== undefined) {
      result[idx] = log
      used.add(li)
    }
  })
  return result
}

/**
 * The logged applications that did not complete a plan dose, newest first: a product the plan does not use,
 * a part-application, or one made before the plan was. The schedule lists them so a logged application never
 * disappears; the next plan credits the ones inside the credit window.
 */
export function unmatchedLogs(recommendation, logs, matches = matchLogsToLines(recommendation, logs)) {
  const matched = new Set(matches.filter(Boolean).map((l) => l.id))
  return (logs || [])
    .filter((l) => !matched.has(l.id))
    .sort((a, b) => new Date(b.appliedOn) - new Date(a.appliedOn))
}

const CREDITED_KEY = 'agrobloom.creditedLogs'

function loadCredited() {
  try {
    return JSON.parse(localStorage.getItem(CREDITED_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/**
 * Remembers which logs a plan was made with, on this device. A log has no creation time to compare with the
 * plan's, and an application made today can be logged before or after today's plan, so the dates alone cannot
 * tell whether a plan already credits it.
 */
export function rememberCreditedLogs(recommendationId, logs) {
  if (!recommendationId) return
  try {
    const all = loadCredited()
    all[recommendationId] = (logs || []).map((l) => l.id)
    const keep = Object.keys(all).slice(-30)
    localStorage.setItem(CREDITED_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))))
  } catch {
    // storage unavailable: falls back to comparing dates
  }
}

/**
 * Of the logs that finished no dose, the ones the current plan was NOT made with, so it does not credit them
 * yet. Uses the record from rememberCreditedLogs when this device made the plan; otherwise a log applied on a
 * later day than the plan's day.
 */
export function logsNeedingCredit(recommendation, unmatched, credited = loadCredited()) {
  if (!recommendation) return []
  const known = credited[recommendation.id]
  if (known) return unmatched.filter((l) => !known.includes(l.id))
  const planDay = String(recommendation.createdAt).slice(0, 10)
  return unmatched.filter((l) => String(l.appliedOn).slice(0, 10) > planDay)
}

export const SCHEDULE_CHANGED_EVENT = 'agrobloom:schedule-changed'

/** Tell the sidebar badge that logs or plans changed. */
export function notifyScheduleChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SCHEDULE_CHANGED_EVENT))
}

/**
 * Everything the app needs to say about one field's pending work, from its newest soil test,
 * newest plan and fertilizer logs. A field has pending work when a dated, unapplied plan line is
 * due within a week (or overdue), or when its soil test is missing or out of date (see soilTestStatus).
 */
export function fieldStatus({ field, soil, recommendation, logs, soilKnown = true }) {
  const matches = matchLogsToLines(recommendation, logs)
  const unapplied = (recommendation?.schedule || [])
    .map((line, i) => ({ line, days: line.apply_by && !matches[i] ? daysFromToday(line.apply_by) : null }))
    .filter((x) => x.days != null)
    .sort((a, b) => a.days - b.days)
  const due = unapplied.filter((x) => x.days <= 7)
  const soilState = soilTestState(field, soil, new Date(), soilKnown)
  const needsSoil = soilState.state === 'missing' || soilState.state === 'stale'
  return {
    soil: soil || null,
    recommendation: recommendation || null,
    logs: logs || [],
    next: unapplied[0] || null,
    due,
    dueCount: due.length,
    overdue: due.filter((x) => x.days < 0).length,
    needsSoil,
    soilState,
    pendingCount: due.length + (needsSoil ? 1 : 0),
  }
}

/** Short dose-only text for a field, e.g. "3 overdue", "due today", "due in 2 days". */
export function doseText(status) {
  if (!status || status.dueCount === 0) return null
  if (status.overdue > 0) return `${status.overdue} overdue`
  const days = status.due[0].days
  return days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`
}

/** The one line of red-tag text for a field, most urgent first; null when nothing is pending. */
export function pendingText(status) {
  if (!status || status.pendingCount === 0) return null
  if (status.overdue > 0) return `${status.overdue} dose${status.overdue === 1 ? '' : 's'} overdue`
  if (status.dueCount > 0) {
    const days = status.due[0].days
    return days === 0 ? 'Dose due today' : `Dose due in ${days} day${days === 1 ? '' : 's'}`
  }
  return status.soilState?.state === 'stale' ? 'Soil retest needed' : 'Soil test needed'
}
