import { useEffect, useMemo, useState } from 'react'
import Modal from '../ui/Modal.jsx'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useSoilPromptStore } from '../../store/useSoilPromptStore.js'
import * as endpoints from '../../services/endpoints.js'

const labelClass = 'block text-sm font-semibold text-ink-primary mb-1.5'
const controlClass =
  'w-full min-h-[46px] px-3.5 rounded-md border-2 border-border-default hover:border-border-strong focus:border-primary-600 bg-white text-ink-primary focus:outline-none'

/**
 * Adds a second (third, ...) crop to a farm. Each crop is its own field inside the same farm, so it
 * has its own sowing date, growth stage, logs, plan and schedule. The location and irrigation come
 * from the crop it is added next to, and so does the latest soil test (same land), so nothing is
 * typed twice.
 */
export default function AddCropModal({ isOpen, onClose, plot, onCreated }) {
  const plots = usePlotStore((s) => s.plots)
  const addPlot = usePlotStore((s) => s.addPlot)
  const showSoilPrompt = useSoilPromptStore((s) => s.show)
  const farm = plot?.farm
  const source = plot?.field

  const [crops, setCrops] = useState([])
  const [pickedCrop, setPickedCrop] = useState('')
  const [pickedStage, setPickedStage] = useState('')
  const [area, setArea] = useState('1.0')
  const [sowingDate, setSowingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // A crop already on this farm is not offered again.
  const taken = useMemo(
    () => new Set(plots.filter((p) => String(p.farm.id) === String(farm?.id)).map((p) => p.field.cropType)),
    [plots, farm?.id],
  )
  const choices = useMemo(() => crops.filter((c) => !taken.has(c.id)), [crops, taken])
  // The pick, or the first crop still free when nothing (valid) has been picked yet.
  const cropType = choices.some((c) => c.id === pickedCrop) ? pickedCrop : choices[0]?.id || ''
  const stages = useMemo(() => crops.find((c) => c.id === cropType)?.stages || [], [crops, cropType])
  const growthStage = stages.some((s) => s.id === pickedStage) ? pickedStage : stages[0]?.id || ''

  useEffect(() => {
    if (!isOpen || crops.length) return undefined
    let active = true
    endpoints
      .getReferenceCrops()
      .then((list) => {
        if (active && Array.isArray(list)) setCrops(list)
      })
      .catch(() => {
        if (active) setError('Could not load the crop list. Check your connection and reopen this form.')
      })
    return () => {
      active = false
    }
  }, [isOpen, crops.length])

  const changeCrop = (id) => {
    setPickedCrop(id)
    setPickedStage('') // each crop starts at its own first stage
  }

  const submit = async (e) => {
    e.preventDefault()
    const acres = parseFloat(area)
    if (!cropType) return setError('Choose a crop.')
    if (!(acres > 0)) return setError('Enter the area this crop covers, in acres.')
    if (submitting || !farm || !source) return
    setSubmitting(true)
    setError('')
    try {
      const cropName = crops.find((c) => c.id === cropType)?.name_en || cropType
      const field = await endpoints.createField(farm.id, {
        name: `${farm.name} – ${cropName}`,
        areaAcres: acres,
        ...(source.latitude != null ? { latitude: source.latitude, longitude: source.longitude } : {}),
        ...(source.pincode ? { pincode: source.pincode } : {}),
        cropType,
        growthStage: growthStage || undefined,
        irrigation: source.irrigation || 'irrigated',
        sowingDate,
      })

      // Same land, same soil: carry the latest test over. If that fails the farmer is asked for one.
      let copied = false
      try {
        const res = await endpoints.getSoilTests(source.id, { limit: 1 })
        const latest = (res?.items || (Array.isArray(res) ? res : []))[0]
        if (latest) {
          await endpoints.createSoilTest(field.id, {
            n: latest.n,
            p: latest.p,
            k: latest.k,
            ph: latest.ph,
            organicCarbon: latest.organicCarbon,
            moisture: latest.moisture,
            testedOn: latest.testedOn,
          })
          copied = true
        }
      } catch {
        copied = false
      }

      const created = { farm, field }
      addPlot(created)
      if (!copied) showSoilPrompt([field.id])
      onCreated?.(created)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Could not add this crop. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const noneLeft = crops.length > 0 && choices.length === 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add another crop"
      description={farm ? `Grow a second crop on ${farm.name}. It gets its own plan, schedule and doses.` : ''}
      className="max-w-xl max-h-[92vh] overflow-y-auto"
    >
      <form onSubmit={submit} noValidate className="space-y-4 text-sm">
        {error && (
          <div role="alert" className="p-3 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text">
            {error}
          </div>
        )}
        {noneLeft && <p className="text-ink-secondary">Every crop we support is already on this farm.</p>}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="add-crop-type" className={labelClass}>Crop</label>
            <select id="add-crop-type" className={controlClass} value={cropType} onChange={(e) => changeCrop(e.target.value)} disabled={!choices.length}>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>{c.name_en}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-crop-stage" className={labelClass}>Growth stage now</label>
            <select id="add-crop-stage" className={controlClass} value={growthStage} onChange={(e) => setPickedStage(e.target.value)} disabled={!stages.length}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name_en}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-crop-area" className={labelClass}>Area for this crop (acres)</label>
            <input id="add-crop-area" type="number" step="0.1" min="0.1" className={controlClass} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label htmlFor="add-crop-sown" className={labelClass}>Sowing date</label>
            <input id="add-crop-sown" type="date" max={new Date().toISOString().slice(0, 10)} className={controlClass} value={sowingDate} onChange={(e) => setSowingDate(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-ink-muted">
          Location and irrigation are copied from {source?.name || 'the first crop'}, and so is its latest soil test, since it is the same land.
        </p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-default">
          <button type="button" onClick={onClose} className="min-h-[44px] px-5 rounded-full text-ink-secondary hover:bg-bg-subtle font-medium cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !choices.length} className="min-h-[46px] px-7 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-medium shadow-md cursor-pointer">
            {submitting ? 'Adding…' : 'Add crop'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
