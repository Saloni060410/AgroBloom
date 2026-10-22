import { create } from 'zustand'

/** Which fields the "take a soil test" popup is currently asking about. */
export const useSoilPromptStore = create((set) => ({
  fieldIds: [],
  show: (fieldIds) => set({ fieldIds: [...new Set(fieldIds)] }),
  hide: () => set({ fieldIds: [] }),
}))
