import { useEffect, useState } from 'react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useFarmStore } from '../store/useFarmStore.js'
import { usePlotStore } from '../store/usePlotStore.js'
import { usePlotDetails } from '../hooks/usePlotDetails.js'
import * as endpoints from '../services/endpoints.js'
import FarmCard from '../components/farms/FarmCard.jsx'
import { useSoilPromptStore } from '../store/useSoilPromptStore.js'
import AddFarmModal from '../components/farms/AddFarmModal.jsx'
import AddCropModal from '../components/farms/AddCropModal.jsx'
import Modal from '../components/ui/Modal.jsx'
import { AddFarmArt } from '../components/illustrations/SmallArt.jsx'
import { BRAND } from '../components/brand/brand.js'

export default function Dashboard() {
  useDocumentTitle(`My Fields — ${BRAND.name}`)
  const showSoilPrompt = useSoilPromptStore((s) => s.show)
  const { plots, status, loadPlots, addPlot, removeFarm, removeField } = usePlotStore()
  const { deleteFarm } = useFarmStore()
  const { details, ratings } = usePlotDetails(plots)

  const [crops, setCrops] = useState([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addCropTo, setAddCropTo] = useState(null)
  const [toRemove, setToRemove] = useState(null) // the plot whose remove button was pressed
  const [removeError, setRemoveError] = useState(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    loadPlots()
    endpoints.getReferenceCrops().then(setCrops).catch(() => {})
  }, [loadPlots])

  const cropName = (id) => crops.find((c) => c.id === id)?.name_en || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'No crop')

  const handleCreated = (plot) => {
    addPlot(plot)
    setIsAddOpen(false)
    // A brand-new plot has no soil test, so every dose for it would be a guess: ask for one now.
    showSoilPrompt([plot.field.id])
  }

  // Plots sharing a farm are crops grown on the same land.
  const siblingsOf = (plot) =>
    plots
      .filter((p) => String(p.farm.id) === String(plot.farm.id) && p.field.id !== plot.field.id)
      .map((p) => ({ id: p.field.id, cropName: cropName(p.field.cropType) }))
  const removingOneCrop = Boolean(toRemove) && siblingsOf(toRemove).length > 0

  const confirmRemove = async () => {
    if (!toRemove) return
    setRemoving(true)
    setRemoveError(null)
    try {
      if (removingOneCrop) {
        await endpoints.deleteField(toRemove.field.id)
        removeField(toRemove.field.id)
      } else {
        await deleteFarm(toRemove.farm.id)
        removeFarm(toRemove.farm.id)
      }
      setToRemove(null)
    } catch (err) {
      setRemoveError(err?.message || 'Could not remove this farm. Try again.')
    } finally {
      setRemoving(false)
    }
  }

  const loading = status === 'idle' || status === 'loading'
  // One card per farm; the crops grown on it are its plots. Farms with pending work come first
  // (stable otherwise), so they are seen without scrolling.
  const pendingIn = (plot) => (details[plot.field.id]?.pendingCount || 0) > 0
  const groups = []
  for (const plot of plots) {
    const existing = groups.find((g) => String(g.farm.id) === String(plot.farm.id))
    if (existing) existing.plots.push(plot)
    else groups.push({ farm: plot.farm, plots: [plot] })
  }
  const ordered = [...groups].sort((a, b) => Number(b.plots.some(pendingIn)) - Number(a.plots.some(pendingIn)))
  const pendingFarms = ordered.filter((g) => g.plots.some(pendingIn)).length

  return (
    <div className="space-y-8">
      <section aria-labelledby="active-farmlands">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h2 id="active-farmlands" className="text-2xl font-semibold text-ink-primary">Active Farmlands</h2>
          {pendingFarms > 0 && (
            <span className="inline-flex items-center rounded-full bg-risk-high-bg text-risk-high-text border border-risk-high-border text-sm font-semibold px-3 py-1">
              {pendingFarms} of {groups.length} {pendingFarms === 1 ? 'farm has' : 'farms have'} pending work
            </span>
          )}
        </div>

        {status === 'error' && (
          <div role="alert" className="mb-5 p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex flex-wrap items-center justify-between gap-3">
            <span>Could not load your fields. The server may be unreachable.</span>
            <button type="button" onClick={() => loadPlots({ force: true })} className="font-semibold underline cursor-pointer">Try again</button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading &&
            [0, 1].map((i) => (
              <div key={i} aria-hidden="true" className="h-[520px] rounded-lg bg-white/70 border border-border-default animate-pulse" />
            ))}

          {!loading &&
            ordered.map((group, i) => (
              <FarmCard
                key={group.farm.id}
                index={i}
                group={group}
                cropNameOf={cropName}
                details={details}
                ratings={ratings}
                onAddCrop={setAddCropTo}
                onRemove={(target) => {
                  setRemoveError(null)
                  setToRemove(target)
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

      <AddCropModal isOpen={Boolean(addCropTo)} onClose={() => setAddCropTo(null)} plot={addCropTo} />

      <Modal
        isOpen={Boolean(toRemove)}
        onClose={() => setToRemove(null)}
        title={removingOneCrop ? 'Remove this crop?' : 'Remove this farm?'}
        description={
          removingOneCrop
            ? 'This deletes the crop with its soil tests, fertilizer logs and recommendations. The farm and its other crops stay. It cannot be undone.'
            : 'This deletes the farm with its fields, soil tests, fertilizer logs and recommendations. It cannot be undone.'
        }
      >
        {removeError && <p role="alert" className="mb-3 text-sm text-risk-high-text">{removeError}</p>}
        <p className="text-sm text-ink-secondary">
          You are about to remove{' '}
          <strong className="text-ink-primary">{removingOneCrop ? `${cropName(toRemove.field.cropType)} from ${toRemove.farm.name}` : toRemove?.farm.name}</strong>.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={() => setToRemove(null)} className="min-h-[44px] px-5 rounded-full hover:bg-bg-subtle font-medium cursor-pointer">Keep it</button>
          <button type="button" onClick={confirmRemove} disabled={removing} className="min-h-[44px] px-6 rounded-full bg-risk-high-text text-white font-medium disabled:opacity-60 cursor-pointer">
            {removing ? 'Removing…' : removingOneCrop ? 'Remove crop' : 'Remove farm'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
