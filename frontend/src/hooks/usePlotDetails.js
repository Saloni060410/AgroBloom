import { useEffect, useState } from 'react'
import * as endpoints from '../services/endpoints.js'
import { ratingsFromReference, DEFAULT_RATINGS } from '../utils/soilHealth.js'
import { useFieldStatusStore } from '../store/useFieldStatusStore.js'

/**
 * Status for each plot (latest soil test, latest plan, pending work) from the shared store the app
 * shell keeps current, plus the soil rating cut-offs. A plot with no entry yet is still loading.
 */
export function usePlotDetails(plots) {
  const byField = useFieldStatusStore((s) => s.byField)
  const [ratings, setRatings] = useState(DEFAULT_RATINGS)

  useEffect(() => {
    let cancelled = false
    endpoints
      .getReferenceSoilRatings()
      .then((list) => {
        if (!cancelled) setRatings(ratingsFromReference(list))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const loading = plots.length > 0 && plots.some((p) => !byField[p.field.id])
  return { details: byField, ratings, loading }
}
