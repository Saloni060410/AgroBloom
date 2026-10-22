import { useEffect, useRef, useState } from 'react'
import * as endpoints from '../services/endpoints.js'
import { fieldStatus, SCHEDULE_CHANGED_EVENT } from '../utils/schedule.js'
import { useFieldStatusStore } from '../store/useFieldStatusStore.js'

/**
 * Loads soil test, plan and fertilizer logs for every field once and publishes the derived status
 * to useFieldStatusStore. Refreshes when the set of fields changes or a page reports that logs,
 * soil tests or plans changed. Mounted once, in the signed-in shell.
 * Returns the totals for the Schedule badge.
 */
export function useFieldStatusSync(plots) {
  const [version, setVersion] = useState(0)
  const retries = useRef(0)
  const key = `${plots.map((p) => p.field.id).join(',')}#${version}`
  const publish = useFieldStatusStore((s) => s.publish)
  const published = useFieldStatusStore((s) => s.key)
  const byField = useFieldStatusStore((s) => s.byField)

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(SCHEDULE_CHANGED_EVENT, bump)
    return () => window.removeEventListener(SCHEDULE_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    if (!plots.length) return undefined
    let cancelled = false
    let retryTimer = null
    Promise.all(
      plots.map(async ({ field }) => {
        const [soilRes, recRes, logRes] = await Promise.all([
          endpoints.getSoilTests(field.id, { limit: 1 }).catch(() => null),
          endpoints.getRecommendations(field.id, { limit: 1 }).catch(() => null),
          endpoints.getFertilizerLogs(field.id, { limit: 50 }).catch(() => null),
        ])
        return {
          id: field.id,
          failed: soilRes === null || recRes === null || logRes === null,
          status: fieldStatus({
            field,
            soil: (soilRes?.items || [])[0],
            recommendation: (recRes?.items || [])[0],
            logs: logRes?.items || [],
            soilKnown: soilRes !== null,
          }),
        }
      }),
    ).then((results) => {
      if (cancelled) return
      publish(key, Object.fromEntries(results.map((r) => [r.id, r.status])))
      // A lookup that failed (a rate limit, a dropped connection) is retried a few times rather than
      // leaving that field looking untested.
      if (results.some((r) => r.failed) && retries.current < 3) {
        retries.current += 1
        retryTimer = setTimeout(() => setVersion((v) => v + 1), 8000 * retries.current)
      } else if (!results.some((r) => r.failed)) {
        retries.current = 0
      }
    })
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
    // plots is read only through key, which already encodes its field ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!plots.length || published !== key) return { count: 0, overdue: 0 }
  const all = Object.values(byField)
  return { count: all.reduce((n, s) => n + s.dueCount, 0), overdue: all.reduce((n, s) => n + s.overdue, 0) }
}
