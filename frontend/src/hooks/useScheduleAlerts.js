import { useEffect, useState } from 'react'
import * as endpoints from '../services/endpoints.js'
import { dueLines, SCHEDULE_CHANGED_EVENT } from '../utils/schedule.js'

/**
 * How many plan lines across the user's fields are due within a week or overdue and not yet
 * logged as applied. Drives the badge on the sidebar's Schedule item. Refreshes when the set of
 * fields changes or a page reports that logs or plans changed.
 */
export function useScheduleAlerts(plots) {
  const [result, setResult] = useState({ key: '', count: 0, overdue: 0 })
  const [version, setVersion] = useState(0)
  const key = `${plots.map((p) => p.field.id).join(',')}#${version}`

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(SCHEDULE_CHANGED_EVENT, bump)
    return () => window.removeEventListener(SCHEDULE_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    if (!plots.length) return undefined
    let cancelled = false
    Promise.all(
      plots.map(async ({ field }) => {
        const [recs, logs] = await Promise.all([
          endpoints.getRecommendations(field.id, { limit: 1 }).catch(() => null),
          endpoints.getFertilizerLogs(field.id, { limit: 50 }).catch(() => null),
        ])
        return dueLines((recs?.items || [])[0], logs?.items || [])
      }),
    ).then((perField) => {
      if (cancelled) return
      const all = perField.flat()
      setResult({ key, count: all.length, overdue: all.filter((x) => x.days < 0).length })
    })
    return () => {
      cancelled = true
    }
    // plots is read only through key, which already encodes its field ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return plots.length && result.key === key ? result : { count: 0, overdue: 0 }
}
