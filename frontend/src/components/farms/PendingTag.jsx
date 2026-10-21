import { AlertCircle } from 'lucide-react'
import { pendingText } from '../../utils/schedule.js'

/** Red tag naming a field's pending work. Renders nothing when the field has none. */
export default function PendingTag({ status, className = '' }) {
  const text = pendingText(status)
  if (!text) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-risk-high-text text-white text-xs font-semibold px-3 py-1 shadow-sm ${className}`}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="sr-only">Pending work: </span>
        {text}
      </span>
    </span>
  )
}
