import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import PlotPicker from './PlotPicker.jsx'

/** Compact "which field am I looking at" dropdown. suffix is the page path after /fields/:id. */
export default function PlotSwitcher({ fieldId, suffix = '', className = '' }) {
  const navigate = useNavigate()
  const { plots, loadPlots } = usePlotStore()
  const byField = useFieldStatusStore((s) => s.byField)

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  if (plots.length < 2) return null

  // Every field is listed. The ones needing attention carry a tag.
  const notesFor = (id) => {
    const s = byField[id]
    if (!s) return []
    const tags = []
    if (s.soilState?.state === 'missing') tags.push({ text: 'Needs soil test', tone: 'amber' })
    else if (s.soilState?.state === 'stale') tags.push({ text: 'Retest due', tone: 'amber' })
    if (s.dueCount) tags.push({ text: `${s.dueCount} dose${s.dueCount === 1 ? '' : 's'} due`, tone: 'red' })
    return tags
  }

  return (
    <PlotPicker
      plots={plots}
      value={fieldId}
      onChange={(id) => navigate(`/fields/${id}${suffix}`)}
      notesFor={notesFor}
      className={className}
    />
  )
}
