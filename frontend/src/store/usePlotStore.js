import { create } from 'zustand'
import * as endpoints from '../services/endpoints.js'

const byCreated = (a, b) => new Date(a.field.createdAt) - new Date(b.field.createdAt)

/** One request for the lot. Returns the plots and what is already known about each field. */
async function fetchOverview() {
  const { farms = [] } = await endpoints.getOverview()
  const plots = []
  const snapshots = {}
  for (const { fields = [], ...farm } of farms) {
    for (const { soilTest, recommendation, fertilizerLogs, ...field } of fields) {
      plots.push({ farm, field })
      snapshots[field.id] = { soil: soilTest || null, recommendation: recommendation || null, logs: fertilizerLogs || [] }
    }
  }
  return { plots: plots.sort(byCreated), snapshots }
}

/** The old way: farms, then each farm's fields. Used when the overview endpoint is unavailable. */
async function fetchFarmsThenFields() {
  const farmsRes = await endpoints.getFarms({ limit: 50 })
  const farms = farmsRes?.items || (Array.isArray(farmsRes) ? farmsRes : [])
  const perFarm = await Promise.all(
    farms.map(async (farm) => {
      const fieldsRes = await endpoints.getFields(farm.id, { limit: 50 })
      const fields = fieldsRes?.items || (Array.isArray(fieldsRes) ? fieldsRes : [])
      return fields.map((field) => ({ farm, field }))
    }),
  )
  return { plots: perFarm.flat().sort(byCreated), snapshots: {} }
}

/**
 * Every field the signed-in user owns, flattened across their farms and paired with its farm.
 * The nav, the plot switchers and the dashboard all read this one list instead of each walking
 * farms -> fields on their own. `snapshots` holds the newest soil test, plan and logs per field when
 * the overview endpoint supplied them, so the app shell does not have to ask field by field.
 */
export const usePlotStore = create((set, get) => ({
  plots: [], // [{ farm, field }], oldest first so "Plot A/B/C" letters stay stable
  snapshots: {}, // { [fieldId]: { soil, recommendation, logs } }
  snapshotVersion: 0, // bumped whenever the snapshots were refreshed
  status: 'idle', // idle | loading | ready | error
  error: null,

  // silent: refresh in the background without putting the pages back into their loading state.
  loadPlots: async ({ force = false, silent = false } = {}) => {
    const { status } = get()
    if (!force && (status === 'ready' || status === 'loading')) return get().plots
    if (!silent) set({ status: 'loading', error: null })
    try {
      let result
      try {
        result = await fetchOverview()
      } catch {
        result = await fetchFarmsThenFields()
      }
      set((s) => ({ ...result, status: 'ready', snapshotVersion: s.snapshotVersion + 1 }))
      return result.plots
    } catch (err) {
      if (!silent) set({ status: 'error', error: err?.message || 'Could not load your fields' })
      return get().plots
    }
  },

  addPlot: (plot) => set((s) => ({ plots: [...s.plots, plot], status: 'ready' })),
  removeFarm: (farmId) =>
    set((s) => ({ plots: s.plots.filter((p) => String(p.farm.id) !== String(farmId)) })),
  removeField: (fieldId) =>
    set((s) => ({ plots: s.plots.filter((p) => String(p.field.id) !== String(fieldId)) })),
  updateField: (fieldId, patch) =>
    set((s) => ({
      plots: s.plots.map((p) =>
        String(p.field.id) === String(fieldId) ? { ...p, field: { ...p.field, ...patch } } : p,
      ),
    })),
  reset: () => set({ plots: [], snapshots: {}, snapshotVersion: 0, status: 'idle', error: null }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('khetgpt:auth:logout', () => usePlotStore.getState().reset())
}
