import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, LayoutDashboard, Loader2 } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import SiteNav from '../components/layout/SiteNav.jsx'
import TractorScene from '../components/illustrations/TractorScene.jsx'
import { DialGauge } from '../components/ui/Gauges.jsx'
import { useUserStore } from '../store/useUserStore.js'
import { DEMO_ACCOUNT } from '../utils/demoAccount.js'
import { BRAND } from '../components/brand/brand.js'

/** One screen, edge to edge: the pitch, a demo dashboard on sample farms, and sign in. */
export default function Landing() {
  useDocumentTitle(`${BRAND.name} — Smart Soil, Optimal Harvest`)
  const navigate = useNavigate()
  const { login, isAuthenticated } = useUserStore()
  const [demoState, setDemoState] = useState({ loading: false, error: null })

  const openDemo = async () => {
    if (demoState.loading) return
    setDemoState({ loading: true, error: null })
    try {
      await login(DEMO_ACCOUNT)
      navigate('/overview')
    } catch (err) {
      setDemoState({
        loading: false,
        error: err?.status === 401 || err?.response?.status === 401
          ? 'The demo farms are not set up on this server yet. Sign in with your own account instead.'
          : err?.message || 'Could not open the demo. Check your connection and try again.',
      })
    }
  }

  return (
    <div className="bg-paper-warm min-h-dvh flex flex-col overflow-x-clip">
      <SiteNav minimal />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-6 lg:gap-10 px-5 sm:px-10 lg:px-16 pb-6"
      >
        <div className="animate-reveal relative z-10">
          <h1 className="text-[2.2rem] sm:text-5xl xl:text-6xl font-bold leading-[1.1] text-ink-primary">
            Smart Soil, Optimal Harvest: AI-Powered Fertilizer Planning for Sustainable Yields
          </h1>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openDemo}
              disabled={demoState.loading}
              className="inline-flex items-center justify-center gap-2.5 min-h-[56px] px-9 rounded-full bg-terracotta-600 hover:bg-terracotta-700 disabled:opacity-70 active:scale-[0.98] text-white text-lg font-medium shadow-md transition-all cursor-pointer"
            >
              {demoState.loading ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
              )}
              {demoState.loading ? 'Opening demo…' : 'Demo dashboard'}
            </button>
            <Link
              to={isAuthenticated ? '/overview' : '/login'}
              className="inline-flex items-center justify-center gap-2.5 min-h-[56px] px-9 rounded-full border-2 border-ink-primary text-ink-primary hover:bg-ink-primary hover:text-bg-base text-lg font-medium transition-colors"
            >
              {isAuthenticated ? 'My dashboard' : 'Sign in'}
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-4 text-sm text-ink-muted max-w-md">
            The demo opens sample farms so you can look around. Sign in to log in, or sign up as a new customer, and plan your own fields.
          </p>
          {demoState.error && (
            <p role="alert" className="mt-4 max-w-md p-3 rounded-md border border-risk-high-border bg-risk-high-bg text-risk-high-text text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{demoState.error}</span>
            </p>
          )}
        </div>

        {/* The scene is sized from the viewport height, so the whole page fits one screen. */}
        <div
          className="relative animate-reveal delay-2 mx-auto"
          style={{ width: 'min(100%, calc((100dvh - 8rem) * 1.63))', aspectRatio: '880 / 540' }}
        >
          <TractorScene className="w-full h-full" />

          {/* Stat cards. Figures come from this project's own evaluation report, not from marketing. */}
          <div className="absolute top-[9%] right-0 sm:right-2 bg-white rounded-lg shadow-md px-5 py-3 text-center animate-bob">
            <div className="text-3xl font-semibold text-primary-600 leading-none">85%</div>
            <div className="text-[13px] text-ink-secondary mt-1.5 leading-tight">
              Less urea, one
              <br />
              demo wheat field
            </div>
          </div>
          <div className="absolute top-[42%] left-0 sm:left-1 bg-white rounded-lg shadow-md px-5 py-3 text-center animate-bob" style={{ animationDelay: '-1.4s' }}>
            <div className="text-3xl font-semibold text-primary-600 leading-none">4:2:1</div>
            <div className="text-[13px] text-ink-secondary mt-1.5 leading-tight">
              Recommended
              <br />
              N : P : K ratio
            </div>
          </div>
          <div className="absolute -bottom-[3%] right-0 sm:right-1 bg-white rounded-lg shadow-md px-5 pt-4 pb-3 flex flex-col items-center animate-bob" style={{ animationDelay: '-2.6s' }}>
            <DialGauge value={0.3} size={104} thickness={13} label="Over-application risk meter, currently low" />
            <div className="text-[12px] text-ink-secondary mt-1">Over-application risk</div>
          </div>
        </div>
      </main>

      <p className="no-print px-5 pb-4 text-center text-xs text-ink-muted">
        A research prototype built from published Punjab Agricultural University and ICAR-IISS tables. Not extension advice.
      </p>
    </div>
  )
}
