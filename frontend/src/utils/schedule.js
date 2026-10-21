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
