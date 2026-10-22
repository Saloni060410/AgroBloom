import { create } from 'zustand'
import * as endpoints from '../services/endpoints.js'

/**
 * Every field the signed-in user owns, flattened across their farms and paired with its farm.
 * The nav, the plot switchers and the dashboard all read this one list instead of each walking
 * farms -> fields on their own.
 */
export const usePlotStore = create((set, get) => ({
  plots: [], // [{ farm, field }], oldest first so "Plot A/B/C" letters stay stable
  status: 'idle', // idle | loading | ready | error
  error: null,

  loadPlots: async ({ force = false } = {}) => {
    const { status } = get()
    if (!force && (status === 'ready' || status === 'loading')) return get().plots
    set({ status: 'loading', error: null })
    try {
      const farmsRes = await endpoints.getFarms({ limit: 50 })
      const farms = farmsRes?.items || (Array.isArray(farmsRes) ? farmsRes : [])
      const perFarm = await Promise.all(
        farms.map(async (farm) => {
          const fieldsRes = await endpoints.getFields(farm.id, { limit: 50 })
          const fields = fieldsRes?.items || (Array.isArray(fieldsRes) ? fieldsRes : [])
          return fields.map((field) => ({ farm, field }))
        }),
      )
      const plots = perFarm
        .flat()
        .sort((a, b) => new Date(a.field.createdAt) - new Date(b.field.createdAt))
      set({ plots, status: 'ready' })
      return plots
    } catch (err) {
      set({ status: 'error', error: err?.message || 'Could not load your fields' })
      return []
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
  reset: () => set({ plots: [], status: 'idle', error: null }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('khetgpt:auth:logout', () => usePlotStore.getState().reset())
}
