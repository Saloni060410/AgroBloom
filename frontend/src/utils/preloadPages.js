// The app's pages load on demand, so the first visit to each one waits for its code to download. Once the
// signed-in shell is up and the browser is idle, fetch them in the background so moving between pages does
// not wait. Skipped on a connection that asks to save data.
const PAGES = [
  () => import('../pages/Overview.jsx'),
  () => import('../pages/Dashboard.jsx'),
  () => import('../pages/FieldProfile.jsx'),
  () => import('../pages/SoilInput.jsx'),
  () => import('../pages/Recommendation.jsx'),
  () => import('../pages/Schedule.jsx'),
  () => import('../pages/History.jsx'),
  () => import('../pages/ScheduleAll.jsx'),
  () => import('../pages/RiskCheck.jsx'),
]

export function preloadSignedInPages() {
  if (typeof window === 'undefined' || navigator.connection?.saveData) return
  const run = () => {
    // One at a time, so the downloads never compete with the page the person is looking at.
    PAGES.reduce((chain, load) => chain.then(() => load().catch(() => {})), Promise.resolve())
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 1500)
}
