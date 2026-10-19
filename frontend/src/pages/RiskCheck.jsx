import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import PlanRiskChecker from '../components/farms/PlanRiskChecker.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
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
    <div className="space-y-8">
      <PageHeader
        eyebrow={field?.name}
        title="Risk Check"
        subtitle={`Type in what you were planning to apply${field ? ` on ${field.name}` : ''} and see whether it is too much, too little, or about right for the soil.`}
      >
        <PlotSwitcher fieldId={fieldId} suffix="/risk-check" />
        <Link to={`/fields/${fieldId}/recommendation`} className="inline-flex items-center gap-1.5 min-h-[46px] px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 font-medium text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back to the plan
        </Link>
      </PageHeader>
      <PlanRiskChecker
        fieldId={fieldId}
        onBackToRecommended={() => navigate(`/fields/${fieldId}/recommendation`)}
        fieldArea={field?.areaAcres || 1}
        cropType={field?.cropType || ''}
      />
    </div>
  )
}
