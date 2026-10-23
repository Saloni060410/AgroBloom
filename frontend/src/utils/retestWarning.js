// A soil test taken soon after the last one rarely shows anything new, because soil values move slowly, while a
// plan made from it still asks for more fertilizer once the doses already applied are only partly credited.
// Testing and applying again and again therefore leads to over-application. The soil page asks for a
// confirmation first when the last test is this recent. 30 days is a team assumption (an agronomist should
// confirm it); it only decides when to ask, never a dose.
export const RECENT_TEST_DAYS = 30

const DAY_MS = 86_400_000

/**
 * Null when a new test is fine. Otherwise how long ago the last test was and how many applications were logged
 * since, for the confirmation message.
 */
export function retestWarning({ lastTestedOn, logs = [], today = new Date() }) {
  if (!lastTestedOn) return null
  const tested = new Date(String(lastTestedOn).slice(0, 10))
  if (Number.isNaN(tested.getTime())) return null
  const daysAgo = Math.max(0, Math.floor((today.getTime() - tested.getTime()) / DAY_MS))
  if (daysAgo >= RECENT_TEST_DAYS) return null
  const applicationsSince = logs.filter((l) => new Date(String(l.appliedOn).slice(0, 10)) >= tested).length
  return { daysAgo, applicationsSince }
}
