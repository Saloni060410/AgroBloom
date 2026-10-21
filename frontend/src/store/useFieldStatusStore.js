import { create } from 'zustand'

/**
 * Per-field status (newest soil test, plan, logs and the pending work derived from them), filled by
 * useFieldStatusSync in the app shell and read by every page that lists fields.
 */
export const useFieldStatusStore = create((set) => ({
  key: '',
  byField: {},
  publish: (key, byField) => set({ key, byField }),
  reset: () => set({ key: '', byField: {} }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('khetgpt:auth:logout', () => useFieldStatusStore.getState().reset())
}
