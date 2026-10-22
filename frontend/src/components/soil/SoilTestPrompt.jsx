import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FlaskConical, RefreshCcw } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { usePlotStore } from '../../store/usePlotStore.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import { useSoilPromptStore } from '../../store/useSoilPromptStore.js'
import { titleCase } from '../../utils/format.js'

const SNOOZE_KEY = 'agrobloom.soilPromptSnooze'
const SEEN_KEY = 'agrobloom.soilPromptSeen'
const SNOOZE_MS = 24 * 3600_000

function readSnoozes() {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function snooze(fieldIds) {
  try {
    const all = readSnoozes()
    for (const id of fieldIds) all[id] = Date.now() + SNOOZE_MS
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(all))
  } catch {
    // storage unavailable: the popup simply returns next visit
  }
}

/**
 * Popup that asks for a soil test (a new field) or a retest (the crop has moved past the stage the
 * last test was taken in). It opens once per session for fields that need one and were not snoozed,
 * and straight away for a newly added field. Mounted once in the signed-in shell.
 */
export default function SoilTestPrompt() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const plots = usePlotStore((s) => s.plots)
  const { key: statusKey, byField } = useFieldStatusStore()
  const { fieldIds, show, hide } = useSoilPromptStore()

  // Once the statuses are in, ask about fields that need a test, once per session.
  useEffect(() => {
    if (!statusKey || !plots.length) return
    const snoozed = readSnoozes()
    const needing = plots
      .filter(({ field }) => byField[field.id]?.needsSoil && !(snoozed[field.id] > Date.now()))
      .map(({ field }) => field.id)
      .filter((id) => !pathname.endsWith(`/fields/${id}/soil`))
    if (!needing.length) return
    let seen = ''
    try {
      seen = sessionStorage.getItem(SEEN_KEY) || ''
    } catch {
      // ignore
    }
    const signature = [...needing].sort().join(',')
    if (seen === signature) return
    try {
      sessionStorage.setItem(SEEN_KEY, signature)
    } catch {
      // ignore
    }
    show(needing)
    // Only re-evaluated when the statuses change, not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey])

  const rows = fieldIds
    .map((id) => plots.find((p) => p.field.id === id))
    .filter(Boolean)
    .map(({ field }) => ({ field, state: byField[field.id]?.soilState || { state: 'missing', reason: 'No soil test yet. A plan needs one.' } }))

  const open = rows.length > 0
  const anyRetest = rows.some((r) => r.state.state === 'stale')

  const go = (id) => {
    hide()
    navigate(`/fields/${id}/soil`)
  }

  const later = () => {
    snooze(fieldIds)
    hide()
  }

  return (
    <Modal
      isOpen={open}
      onClose={hide}
      title={anyRetest && rows.every((r) => r.state.state === 'stale') ? 'Time to retest your soil' : 'A soil test is needed'}
      description="Fertilizer doses are only as good as the soil test behind them."
      className="max-w-xl max-h-[88vh] overflow-y-auto"
    >
      <ul className="space-y-3">
        {rows.map(({ field, state }) => (
          <li key={field.id} className="rounded-lg border border-border-default bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-ink-primary flex items-center gap-2">
                {field.name}
                {field.cropType && <span className="text-xs font-medium text-ink-secondary bg-bg-muted rounded-full px-2 py-0.5">{titleCase(field.cropType)}</span>}
              </div>
              <p className="text-sm text-ink-secondary mt-1">{state.reason}</p>
            </div>
            <button
              type="button"
              onClick={() => go(field.id)}
              className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm cursor-pointer"
            >
              {state.state === 'stale' ? <RefreshCcw className="w-4 h-4" aria-hidden="true" /> : <FlaskConical className="w-4 h-4" aria-hidden="true" />}
              {state.state === 'stale' ? 'Retest now' : 'Take soil test'}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={hide} className="min-h-[44px] px-5 rounded-full text-ink-secondary hover:bg-bg-subtle text-sm font-medium cursor-pointer">Close</button>
        <button type="button" onClick={later} className="min-h-[44px] px-5 rounded-full border-2 border-border-strong text-ink-primary hover:bg-bg-subtle text-sm font-medium cursor-pointer">Remind me tomorrow</button>
      </div>
    </Modal>
  )
}
