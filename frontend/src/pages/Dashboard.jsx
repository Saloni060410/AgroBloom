import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useUserStore } from '../store/useUserStore.js'
import { useFarmStore } from '../store/useFarmStore.js'
import { usePlotStore } from '../store/usePlotStore.js'
import { usePlotDetails } from '../hooks/usePlotDetails.js'
import * as endpoints from '../services/endpoints.js'
import { firstName } from '../utils/format.js'
import { Avatar } from '../components/layout/UserMenu.jsx'
import WeatherCard from '../components/layout/WeatherCard.jsx'
import FarmCard from '../components/farms/FarmCard.jsx'
import AddFarmModal from '../components/farms/AddFarmModal.jsx'
import Modal from '../components/ui/Modal.jsx'
import { AddFarmArt } from '../components/illustrations/SmallArt.jsx'
import { BRAND } from '../components/brand/brand.js'

export default function Dashboard() {
  useDocumentTitle(`My Fields — ${BRAND.name}`)
  const navigate = useNavigate()
  const user = useUserStore((s) => s.user)
  const { plots, status, loadPlots, addPlot, removeFarm } = usePlotStore()
  const { deleteFarm } = useFarmStore()
  const { details, ratings } = usePlotDetails(plots)

  const [crops, setCrops] = useState([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [toRemove, setToRemove] = useState(null)
  const [removeError, setRemoveError] = useState(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    loadPlots()
    endpoints.getReferenceCrops().then(setCrops).catch(() => {})
  }, [loadPlots])

  const cropName = (id) => crops.find((c) => c.id === id)?.name_en || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'No crop')
  const weatherField = plots.find((p) => p.field.latitude != null)?.field || plots[0]?.field

  const handleCreated = (plot) => {
    addPlot(plot)
    setIsAddOpen(false)
    // A brand-new plot has no soil test, so every dose for it would be a guess. Start there.
    navigate(`/fields/${plot.field.id}/soil`)
  }

  const confirmRemove = async () => {
    if (!toRemove) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await deleteFarm(toRemove.id)
      removeFarm(toRemove.id)
      setToRemove(null)
    } catch (err) {
      setRemoveError(err?.message || 'Could not remove this farm. Try again.')
    } finally {
      setRemoving(false)
    }
  }

  const loading = status === 'idle' || status === 'loading'

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-5 animate-reveal">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name} size={72} className="ring-4 ring-white shadow-md" />
          <h1 className="text-3xl sm:text-[2.2rem] font-bold text-ink-primary leading-tight">
            Welcome back,
            <br />
            {firstName(user?.name)}!
          </h1>
        </div>
        <WeatherCard field={weatherField} />
      </header>

      <section aria-labelledby="active-farmlands">
        <h2 id="active-farmlands" className="text-2xl font-semibold text-ink-primary mb-5">Active Farmlands</h2>

        {status === 'error' && (
          <div role="alert" className="mb-5 p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex flex-wrap items-center justify-between gap-3">
            <span>Could not load your fields. The server may be unreachable.</span>
            <button type="button" onClick={() => loadPlots({ force: true })} className="font-semibold underline cursor-pointer">Try again</button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {loading &&
            [0, 1].map((i) => (
              <div key={i} aria-hidden="true" className="h-[520px] rounded-lg bg-white/70 border border-border-default animate-pulse" />
            ))}

          {!loading &&
            plots.map((plot, i) => (
              <FarmCard
                key={plot.field.id}
                index={i}
                plot={plot}
                cropName={cropName(plot.field.cropType)}
                detail={details[plot.field.id]}
                ratings={ratings}
                onRemove={(farm) => {
                  setRemoveError(null)
                  setToRemove(farm)
                }}
              />
            ))}

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="group min-h-[320px] rounded-lg border-2 border-dashed border-border-strong hover:border-primary-600 hover:bg-white/50 flex flex-col items-center justify-center gap-3 p-6 cursor-pointer transition-colors"
          >
            <AddFarmArt className="w-44 h-40 group-hover:scale-105 transition-transform" />
            <span className="text-xl font-semibold text-ink-primary">+ Add New Farm</span>
            {!loading && plots.length === 0 && (
              <span className="text-sm text-ink-muted text-center max-w-[15rem]">Register your first plot to get a soil-tested fertilizer plan.</span>
            )}
          </button>
        </div>
      </section>

      <AddFarmModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onCreated={handleCreated} />

      <Modal isOpen={Boolean(toRemove)} onClose={() => setToRemove(null)} title="Remove this farm?" description="This deletes the farm with its fields, soil tests, fertilizer logs and recommendations. It cannot be undone.">
        {removeError && <p role="alert" className="mb-3 text-sm text-risk-high-text">{removeError}</p>}
        <p className="text-sm text-ink-secondary">
          You are about to remove <strong className="text-ink-primary">{toRemove?.name}</strong>.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={() => setToRemove(null)} className="min-h-[44px] px-5 rounded-full hover:bg-bg-subtle font-medium cursor-pointer">Keep it</button>
          <button type="button" onClick={confirmRemove} disabled={removing} className="min-h-[44px] px-6 rounded-full bg-risk-high-text text-white font-medium disabled:opacity-60 cursor-pointer">
            {removing ? 'Removing…' : 'Remove farm'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
