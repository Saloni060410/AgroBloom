import { baseURL } from './api.js'

let sent = false

/**
 * Wakes the API. A free host puts an idle server to sleep and takes up to a minute to start it again, which
 * is the whole of the wait when somebody presses Sign in. The landing and sign-in pages call this as they open
 * (once per page load), so the server is usually awake by the time the form is filled in. Fire and forget: the
 * answer is not needed and a failure changes nothing.
 */
export function warmUpServer() {
  if (sent || import.meta.env.VITE_USE_MOCK === 'true' || typeof fetch === 'undefined') return
  sent = true
  fetch(`${baseURL}/health`, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' }).catch(() => {})
}
