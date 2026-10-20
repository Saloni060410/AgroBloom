import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import PlanRiskChecker from '../components/farms/PlanRiskChecker.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import { useFarmStore } from '../store/useFarmStore.js'
import { BRAND } from '../components/brand/brand.js'

export default function RiskCheck() {
  const { fieldId } = useParams()
  const navigate = useNavigate()
  useDocumentTitle(`Risk Check — ${BRAND.name}`)
  const { currentField, fetchField } = useFarmStore()

  useEffect(() => {
    fetchField(fieldId).catch(() => {})
  }, [fieldId, fetchField])

  const field = currentField && String(currentField.id) === String(fieldId) ? currentField : null

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/fields/${fieldId}/recommendation`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline min-h-touch">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back to the plan
        </Link>
        <PlotSwitcher fieldId={fieldId} suffix="/risk-check" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-ink-primary">Risk check</h1>
        <p className="mt-1 text-ink-secondary">
          Type in what you were planning to apply{field ? ` on ${field.name}` : ''} and see whether it is too much, too little, or about right for the soil.
        </p>
      </div>
      <PlanRiskChecker
        fieldId={fieldId}
        onBackToRecommended={() => navigate(`/fields/${fieldId}/recommendation`)}
        fieldArea={field?.areaAcres || 1}
        cropType={field?.cropType || ''}
      />
    </div>
  )
}
