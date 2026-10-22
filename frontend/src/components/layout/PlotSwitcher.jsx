import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import { titleCase } from '../../utils/format.js'

/** Compact "which field am I looking at" select. suffix is the page path after /fields/:id. */
export default function PlotSwitcher({ fieldId, suffix = '', className = '', onlyTested = false }) {
  const navigate = useNavigate()
  const { plots, loadPlots } = usePlotStore()
  const byField = useFieldStatusStore((s) => s.byField)

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  // With onlyTested, list just the fields whose soil test is on file and still valid. Until the
  // statuses have loaded there is nothing to filter on, so every field is shown.
  const loaded = Object.keys(byField).length > 0
  const listed = onlyTested && loaded ? plots.filter(({ field }) => ['valid', 'unknown'].includes(byField[field.id]?.soilState?.state)) : plots
  if (plots.length < 2 && !onlyTested) return null
  if (listed.length === 0 && !onlyTested) return null

  return (
    <div className={`relative inline-block ${className}`}>
      <label htmlFor="plot-switcher" className="sr-only">Switch field</label>
      <select
        id="plot-switcher"
        value={listed.some(({ field }) => field.id === fieldId) ? fieldId : ''}
        onChange={(e) => navigate(`/fields/${e.target.value}${suffix}`)}
        className="appearance-none min-h-[44px] pl-4 pr-10 rounded-full border-2 border-border-default hover:border-border-strong bg-white text-sm font-medium text-ink-primary cursor-pointer focus:outline-none focus:border-primary-600"
      >
        {!listed.some(({ field }) => field.id === fieldId) && (
          <option value="" disabled>
            {listed.length ? 'Choose a field with a current soil test' : 'No field has a current soil test'}
          </option>
        )}
        {listed.map(({ field }) => (
          <option key={field.id} value={field.id}>
            {field.name}
            {field.cropType ? ` (${titleCase(field.cropType)})` : ''}
            {byField[field.id]?.pendingCount ? ` \u00b7 ${byField[field.id].pendingCount} pending` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" aria-hidden="true" />
    </div>
  )
}
