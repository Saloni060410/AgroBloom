import { useFarmStore } from './useFarmStore.js'
import { useFieldStatusStore } from './useFieldStatusStore.js'
import { usePlotStore } from './usePlotStore.js'
import { useRecommendationStore } from './useRecommendationStore.js'
import { useSoilPromptStore } from './useSoilPromptStore.js'

// Session flags kept in the tab: which soil-test prompts were shown, and whether the welcome popup was closed.
const SESSION_KEYS = ['agrobloom.soilPromptSeen', 'agrobloom.welcomeDismissed']

/**
 * Forgets everything the app is holding about the signed-in account: its fields, plans, statuses and prompts.
 *
 * Signing out only removed the login tokens. The stores stayed in memory, so the next account signed in or
 * created in the same tab was shown the previous one's fields (the plot store does not reload once it has
 * data). Called when someone signs out and again when someone signs in or up, so no account ever starts from
 * another's data.
 */
export function resetSessionData() {
  for (const store of [usePlotStore, useFieldStatusStore, useRecommendationStore, useFarmStore, useSoilPromptStore]) {
    store.setState(store.getInitialState(), true)
  }
  try {
    for (const key of SESSION_KEYS) sessionStorage.removeItem(key)
  } catch {
    // storage unavailable: nothing to clear
  }
}
