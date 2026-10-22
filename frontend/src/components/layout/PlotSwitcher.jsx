import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import { titleCase } from '../../utils/format.js'

/** Compact "which field am I looking at" select. suffix is the page path after /fields/:id. */
export default function PlotSwitcher({ fieldId, suffix = '', className = '' }) {
  const navigate = useNavigate()
  const { plots, loadPlots } = usePlotStore()
  const byField = useFieldStatusStore((s) => s.byField)

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  if (plots.length < 2) return null

  // Every field is listed. The ones needing attention say so, since a native select cannot hold a tag.
  const notes = (id) => {
    const s = byField[id]
    if (!s) return ''
    const parts = []
    if (s.soilState?.state === 'missing') parts.push('needs soil test')
    else if (s.soilState?.state === 'stale') parts.push('retest due')
    if (s.dueCount) parts.push(`${s.dueCount} dose${s.dueCount === 1 ? '' : 's'} due`)
    return parts.length ? ` \u00b7 ${parts.join(' \u00b7 ')}` : ''
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <label htmlFor="plot-switcher" className="sr-only">Switch field</label>
      <select
        id="plot-switcher"
        value={fieldId}
        onChange={(e) => navigate(`/fields/${e.target.value}${suffix}`)}
        className="appearance-none min-h-[44px] pl-4 pr-10 rounded-full border-2 border-border-default hover:border-border-strong bg-white text-sm font-medium text-ink-primary cursor-pointer focus:outline-none focus:border-primary-600"
      >
        {plots.map(({ field }) => (
          <option key={field.id} value={field.id}>
            {field.name}
            {field.cropType ? ` (${titleCase(field.cropType)})` : ''}
            {notes(field.id)}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" aria-hidden="true" />
    </div>
  )
}
