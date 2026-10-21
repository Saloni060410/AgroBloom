import { daysFromToday } from './format.js'

/**
 * A plan line counts as applied when a fertilizer log of the same product was made on or after the
 * day the plan was generated. With two lines of the same product this cannot tell them apart, and
 * marks both together.
 */
export function lineApplied(line, recommendation, logs) {
  if (!recommendation) return false
  const since = new Date(new Date(recommendation.createdAt).toISOString().slice(0, 10))
  return logs.some((l) => l.type === line.fertilizer_type && new Date(l.appliedOn) >= since)
}

/** Dated plan lines that are not applied yet and fall due within `windowDays` (overdue ones included). */
export function dueLines(recommendation, logs, windowDays = 7) {
  return (recommendation?.schedule || [])
    .filter((line) => line.apply_by && !lineApplied(line, recommendation, logs))
    .map((line) => ({ line, days: daysFromToday(line.apply_by) }))
    .filter((x) => x.days != null && x.days <= windowDays)
}

export const SCHEDULE_CHANGED_EVENT = 'agrobloom:schedule-changed'

/** Tell the sidebar badge that logs or plans changed. */
export function notifyScheduleChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SCHEDULE_CHANGED_EVENT))
}

/**
 * Everything the app needs to say about one field's pending work, from its newest soil test,
 * newest plan and fertilizer logs. A field has pending work when a dated, unapplied plan line is
 * due within a week (or overdue), or when it has no soil test yet, so no plan can exist.
 */
export function fieldStatus({ soil, recommendation, logs }) {
  const unapplied = (recommendation?.schedule || [])
    .filter((line) => line.apply_by && !lineApplied(line, recommendation, logs || []))
    .map((line) => ({ line, days: daysFromToday(line.apply_by) }))
    .filter((x) => x.days != null)
    .sort((a, b) => a.days - b.days)
  const due = unapplied.filter((x) => x.days <= 7)
  const needsSoil = !soil
  return {
    soil: soil || null,
    recommendation: recommendation || null,
    logs: logs || [],
    next: unapplied[0] || null,
    due,
    dueCount: due.length,
    overdue: due.filter((x) => x.days < 0).length,
    needsSoil,
    pendingCount: due.length + (needsSoil ? 1 : 0),
  }
}

/** The one line of red-tag text for a field, most urgent first; null when nothing is pending. */
export function pendingText(status) {
  if (!status || status.pendingCount === 0) return null
  if (status.overdue > 0) return `${status.overdue} dose${status.overdue === 1 ? '' : 's'} overdue`
  if (status.dueCount > 0) {
    const days = status.due[0].days
    return days === 0 ? 'Dose due today' : `Dose due in ${days} day${days === 1 ? '' : 's'}`
  }
  return 'Soil test needed'
}
