import { useState } from 'react'
import { Sprout } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import AddFarmModal from './AddFarmModal.jsx'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useSoilPromptStore } from '../../store/useSoilPromptStore.js'

const DISMISSED_KEY = 'agrobloom.welcomeDismissed'

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * A brand-new account has no fields, so every page would be empty. Once the (empty) field list has loaded,
 * a popup asks for the first one and opens the same form as "Add New Farm". Closing it is remembered for the
 * tab; signing out forgets that (store/resetSession.js), so the next new account sees it again.
 */
export default function FirstFieldPrompt() {
  const status = usePlotStore((s) => s.status)
  const plots = usePlotStore((s) => s.plots)
  const addPlot = usePlotStore((s) => s.addPlot)
  const showSoilPrompt = useSoilPromptStore((s) => s.show)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [formOpen, setFormOpen] = useState(false)

  const welcomeOpen = status === 'ready' && plots.length === 0 && !dismissed

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // storage unavailable: it will be shown again on the next page
    }
    setDismissed(true)
  }

  const created = (plot) => {
    addPlot(plot)
    setFormOpen(false)
    // A new field has no soil test, so every dose for it would be a guess: ask for one now.
    showSoilPrompt([plot.field.id])
  }

  return (
    <>
      <Modal isOpen={welcomeOpen && !formOpen} onClose={dismiss} title="Welcome to AgroBloom" description="Add your first field to get started.">
        <div className="space-y-4">
          <span className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center" aria-hidden="true">
            <Sprout className="w-6 h-6" />
          </span>
          <p className="text-ink-secondary">
            Nothing is set up yet. Tell us about your field (the crop, how big it is, and where) and then enter your soil test to get a fertilizer plan with dates.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="min-h-[46px] px-6 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium cursor-pointer"
            >
              Add my field
            </button>
            <button type="button" onClick={dismiss} className="min-h-[46px] px-5 rounded-full text-ink-secondary hover:bg-bg-subtle font-medium cursor-pointer">
              Later
            </button>
          </div>
        </div>
      </Modal>
      <AddFarmModal isOpen={formOpen} onClose={() => setFormOpen(false)} onCreated={created} />
    </>
  )
}
