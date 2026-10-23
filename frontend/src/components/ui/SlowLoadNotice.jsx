import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Appears when something has been loading for a few seconds. On a free host an idle server takes up
 * to a minute to wake up; this says so instead of leaving a blank page that looks stuck.
 */
export default function SlowLoadNotice({ active, afterMs = 4000 }) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => setSlow(true), afterMs)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [active, afterMs])

  if (!active || !slow) return null
  return (
    <p role="status" className="mb-5 flex items-center gap-2.5 rounded-md border border-info-border bg-info-bg px-4 py-3 text-sm text-info-text">
      <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
      Still loading. The server may be waking up after a quiet spell, which can take up to a minute. It is quick once it is awake.
    </p>
  )
}
