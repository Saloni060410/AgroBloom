import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import { pendingText } from '../../utils/schedule.js'
import { titleCase } from '../../utils/format.js'

/**
 * The fields that have doses due or overdue, as red tags with a View button that opens that field's
 * schedule. Lives on the Schedule page (it used to be a list in the sidebar). Renders nothing when
 * no field has a dose due.
 */
export default function PendingSchedulePanel({ currentFieldId }) {
  const plots = usePlotStore((s) => s.plots)
  const byField = useFieldStatusStore((s) => s.byField)

  const cropsOnFarm = (farmId) => plots.filter((p) => String(p.farm.id) === String(farmId)).length
  const rows = plots
    .filter(({ field }) => byField[field.id]?.dueCount > 0)
    .map(({ farm, field }) => ({
      id: field.id,
      label: cropsOnFarm(farm.id) > 1 ? `${farm.name} · ${titleCase(field.cropType || '')}` : field.name,
      text: pendingText(byField[field.id]),
      // The one waiting longest first, then the soonest due.
      urgency: byField[field.id].due[0].days,
    }))
    .sort((a, b) => a.urgency - b.urgency)

  if (rows.length === 0) return null

  return (
    <section aria-labelledby="pending-doses" className="no-print rounded-lg border border-risk-high-border bg-white shadow-sm overflow-hidden">
      <h2 id="pending-doses" className="px-5 py-3 text-sm font-semibold text-risk-high-text bg-risk-high-bg border-b border-risk-high-border">
        {rows.length === 1 ? '1 field has a dose due' : `${rows.length} fields have doses due`}
      </h2>
      <ul className="divide-y divide-border-subtle">
        {rows.map((r) => {
          const here = String(r.id) === String(currentFieldId)
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <span className="font-semibold text-ink-primary min-w-0 flex-1 basis-40 truncate">{r.label}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-risk-high-text text-white text-xs font-semibold px-3 py-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {r.text}
              </span>
              {here ? (
                <span className="min-h-[40px] inline-flex items-center px-4 text-sm font-medium text-ink-muted">Viewing now</span>
              ) : (
                <Link
                  to={`/fields/${r.id}/schedule`}
                  aria-label={`View schedule for ${r.label}`}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition-colors"
                >
                  View <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
