import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, LayoutDashboard, Loader2, FlaskConical, Calculator, CalendarCheck } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import SiteNav from '../components/layout/SiteNav.jsx'
import FarmIntro from '../components/intro/FarmIntro.jsx'
import Footer from '../components/layout/Footer.jsx'
import TractorScene from '../components/illustrations/TractorScene.jsx'
import CropArt, { CROP_THEME } from '../components/illustrations/CropArt.jsx'
import { DialGauge } from '../components/ui/Gauges.jsx'
import { useActiveField } from '../hooks/useActiveField.js'
import { useUserStore } from '../store/useUserStore.js'
import { DEMO_ACCOUNT } from '../utils/demoAccount.js'
import { BRAND } from '../components/brand/brand.js'

const STEPS = [
  {
    icon: FlaskConical,
    title: 'Enter your soil test',
    body: 'Type in the six values from your Soil Health Card: N, P, K, pH, organic carbon and moisture.',
  },
  {
    icon: Calculator,
    title: 'Get a dose you can check',
    body: 'Every recommendation shows the published dose it started from, the soil-test adjustment, and the credit for what you already applied.',
  },
  {
    icon: CalendarCheck,
    title: 'Apply on the dates',
    body: 'A dated schedule per crop stage, held back when heavy rain is forecast so fertilizer stays in the field.',
  },
]

const TERMS = [
  {
    tag: 'Term 1',
    title: 'Standard published dose',
    body: 'The nutrient dose the Punjab Agricultural University Package of Practices publishes for the crop.',
    source: 'Source: PAU Package of Practices',
    tone: 'text-primary-700',
  },
  {
    tag: 'Term 2',
    title: 'Soil-test adjustment',
    body: 'Raised or lowered by your soil test rating, from published soil-test rules or a Soil Test Crop Response equation where one exists.',
    source: 'Source: ICAR-IISS STCR',
    tone: 'text-accent-water',
  },
  {
    tag: 'Term 3',
    title: 'Credit for earlier applications',
    body: 'Nutrients from fertilizer you already applied are counted against the new dose, using the crop’s nutrient-use efficiency.',
    source: 'Source: your fertilizer log',
    tone: 'text-terracotta-600',
  },
]

// The opening animation plays once per page load: coming back to "/" inside the app skips it, and so
// does a visitor who asked their system for reduced motion.
let introPlayed = false
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The opening scene, then the hero (headline, demo dashboard, sign in), then the explanation. */
export default function Landing() {
  useDocumentTitle(`${BRAND.name} — Smart Soil, Optimal Harvest`)
  const navigate = useNavigate()
  const { fieldPath } = useActiveField()
  const { login, isAuthenticated } = useUserStore()
  const [demoState, setDemoState] = useState({ loading: false, error: null })
  const [intro, setIntro] = useState(() => !introPlayed && !prefersReducedMotion())
  const [revealed, setRevealed] = useState(!intro)
  const mainRef = useRef(null)

  // While the scene covers the page, keep the page out of the tab order and away from screen readers.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (intro) main.setAttribute('inert', '')
    else main.removeAttribute('inert')
  }, [intro])

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
    <div className="relative bg-bg-base min-h-screen overflow-x-clip">
      {intro && (
        <FarmIntro
          onSplit={() => setRevealed(true)}
          onDone={() => {
            introPlayed = true
            setIntro(false)
          }}
        />
      )}
      {/* The logo bar lies over the hero's own background, so there is no seam between them. */}
      <div className="absolute inset-x-0 top-0 z-30">
        <SiteNav minimal />
      </div>

      <main id="main-content" tabIndex={-1} ref={mainRef}>
        {/* Hero */}
        <section className="relative bg-paper-warm">
          <div className="w-full px-5 sm:px-8 lg:px-12 xl:px-16 pt-28 pb-24 lg:pt-32 lg:pb-40 grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-2 items-center">
            <div className={`${revealed ? 'animate-reveal' : 'opacity-0'} relative z-10 lg:pr-4`}>
              <h1 className="font-bold tracking-tight text-ink-primary">
                <span className="block text-[2.2rem] sm:text-5xl lg:text-[3.1rem] xl:text-[3.6rem] 2xl:text-[4.25rem] leading-[1.08] text-balance">Smart Soil, Optimal Harvest</span>
                <span className="mt-4 block max-w-md text-lg sm:text-xl font-medium leading-snug text-ink-secondary text-balance">
                  AI-Powered Fertilizer Planning for Sustainable Yields
                </span>
              </h1>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openDemo}
                  disabled={demoState.loading}
                  className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-8 rounded-full bg-terracotta-600 hover:bg-terracotta-700 disabled:opacity-70 active:scale-[0.98] text-white text-lg font-medium shadow-md transition-all cursor-pointer"
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
                  className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-8 rounded-full border-2 border-ink-primary text-ink-primary hover:bg-ink-primary hover:text-bg-base text-lg font-medium transition-colors"
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

            <div className={`${revealed ? 'animate-reveal delay-2' : 'opacity-0'} relative mx-auto w-full max-w-[600px] lg:max-w-[900px] lg:mr-0 lg:ml-auto`}>
              <TractorScene className="w-full h-auto" />

              {/* Stat cards. Figures come from this project's own evaluation report, not from marketing.
                  The outer box positions and scales; the inner one bobs (the animation owns transform). */}
              <div className="absolute top-[6%] right-1 sm:top-[9%] sm:right-2 origin-top-right scale-[.62] sm:scale-[.8] lg:scale-100">
                <div className="bg-white rounded-lg shadow-md px-5 py-3 text-center animate-bob">
                  <div className="text-3xl font-semibold text-primary-600 leading-none">85%</div>
                  <div className="text-[13px] text-ink-secondary mt-1.5 leading-tight">
                    Less urea, one
                    <br />
                    demo wheat field
                  </div>
                </div>
              </div>
              <div className="absolute top-[42%] left-0 sm:left-1 origin-left scale-[.62] sm:scale-[.8] lg:scale-100">
                <div className="bg-white rounded-lg shadow-md px-5 py-3 text-center animate-bob" style={{ animationDelay: '-1.4s' }}>
                  <div className="text-3xl font-semibold text-primary-600 leading-none">4:2:1</div>
                  <div className="text-[13px] text-ink-secondary mt-1.5 leading-tight">
                    Recommended
                    <br />
                    N : P : K ratio
                  </div>
                </div>
              </div>
              <div className="hidden sm:block absolute -bottom-[3%] right-0 sm:right-1 origin-bottom-right sm:scale-[.8] lg:scale-100">
                <div className="bg-white rounded-lg shadow-md px-5 pt-4 pb-3 flex flex-col items-center animate-bob" style={{ animationDelay: '-2.6s' }}>
                  <DialGauge value={0.3} size={104} thickness={13} label="Over-application risk meter, currently low" />
                  <div className="text-[12px] text-ink-secondary mt-1">Over-application risk</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="relative -mt-16 lg:-mt-36 px-5 sm:px-8 lg:px-12 xl:px-16 scroll-mt-6">
          <div className="w-full bg-white rounded-xl shadow-lg p-7 sm:p-10 xl:p-12">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold text-ink-primary">How {BRAND.name} works</h2>
              <p className="mt-2 text-ink-secondary">
                Three steps from a lab report to a field plan. Nothing is a black box.
              </p>
            </div>
            <ol className="mt-8 grid md:grid-cols-3 gap-6">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex gap-4">
                  <span className="shrink-0 w-12 h-12 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center">
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-terracotta-600 uppercase tracking-wider">Step {i + 1}</div>
                    <h3 className="text-lg font-semibold text-ink-primary mt-0.5">{title}</h3>
                    <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The formula */}
        <section className="w-full px-5 sm:px-8 lg:px-12 xl:px-16 pt-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary-700">The method</p>
            <h2 className="text-2xl sm:text-4xl font-semibold text-ink-primary mt-1">Three terms, all on screen</h2>
            <p className="mt-3 text-ink-secondary leading-relaxed">
              Fertilizer apps often hand you a number and no reason. Here every dose is built from the same three published terms.
            </p>
          </div>

          <div className="mt-8 rounded-xl bg-bg-subtle border border-border-default p-5 sm:p-7 flex flex-wrap items-center gap-3 text-base sm:text-lg font-medium">
            <span className="px-4 py-2 rounded-md bg-white border border-border-default">Fertilizer needed</span>
            <span className="text-terracotta-600 font-semibold">=</span>
            <span className="px-4 py-2 rounded-md bg-primary-600 text-white">Standard dose</span>
            <span className="text-terracotta-600 font-semibold">+</span>
            <span className="px-4 py-2 rounded-md bg-accent-water text-white">Soil-test adjustment</span>
            <span className="text-terracotta-600 font-semibold">&minus;</span>
            <span className="px-4 py-2 rounded-md bg-terracotta-600 text-white">Credit for earlier applications</span>
          </div>

          <div className="mt-6 grid md:grid-cols-3 gap-5">
            {TERMS.map((t) => (
              <article key={t.title} className="bg-white rounded-xl border border-border-default shadow-sm p-6 flex flex-col">
                <span className={`text-xs font-semibold uppercase tracking-wider ${t.tone}`}>{t.tag}</span>
                <h3 className="text-lg font-semibold text-ink-primary mt-1">{t.title}</h3>
                <p className="text-sm text-ink-secondary mt-2 leading-relaxed flex-1">{t.body}</p>
                <p className={`text-xs font-medium mt-4 pt-3 border-t border-border-subtle ${t.tone}`}>{t.source}</p>
              </article>
            ))}
          </div>

          {/* Worked example: a real captured response, see docs/backend-api.md */}
          <div className="mt-6 rounded-xl bg-bg-sidebar text-ink-sidebar p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-white/10">
              <h3 className="text-base font-semibold text-white">Worked example: irrigated wheat, nitrogen</h3>
              <p className="text-xs text-ink-sidebar/70">A field that already had 150 kg/acre of urea applied</p>
            </div>
            <dl className="mt-5 grid sm:grid-cols-4 gap-4 text-sm">
              <div className="rounded-lg bg-white/5 p-4">
                <dt className="text-xs text-ink-sidebar/70">Standard dose</dt>
                <dd className="text-xl font-semibold text-white mt-1">123.6 kg N/ha</dd>
              </div>
              <div className="rounded-lg bg-white/5 p-4">
                <dt className="text-xs text-ink-sidebar/70">Soil-test adjustment</dt>
                <dd className="text-xl font-semibold text-accent-sun mt-1">0 kg N/ha</dd>
              </div>
              <div className="rounded-lg bg-white/5 p-4">
                <dt className="text-xs text-ink-sidebar/70">Credit for urea applied</dt>
                <dd className="text-xl font-semibold text-terracotta-100 mt-1">&minus;72.6 kg N/ha</dd>
              </div>
              <div className="rounded-lg bg-primary-600 p-4">
                <dt className="text-xs text-white/80">Fertilizer needed</dt>
                <dd className="text-xl font-semibold text-white mt-1">51.0 kg N/ha</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Coverage */}
        <section className="w-full px-5 sm:px-8 lg:px-12 xl:px-16 pt-20 pb-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary-700">Coverage</p>
            <h2 className="text-2xl sm:text-4xl font-semibold text-ink-primary mt-1">Seven Punjab field crops</h2>
            <p className="mt-3 text-ink-secondary leading-relaxed">
              Only crops with a complete published dose table are offered. A crop missing a cell in that table is left out, not guessed.
            </p>
          </div>
          <ul className="mt-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(CROP_THEME).map(([id, theme]) => (
              <li key={id} className="rounded-xl overflow-hidden border border-border-default bg-white shadow-sm">
                <div className="pt-3 px-2" style={{ backgroundColor: theme.bg }}>
                  <CropArt crop={id} className="w-full h-28" />
                </div>
                <div className="px-3 py-2.5 text-center text-sm font-medium text-ink-primary">{theme.name.replace('Golden ', '')}</div>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to={fieldPath('/soil')}
              className="inline-flex items-center gap-2 min-h-[48px] px-7 rounded-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-medium shadow-md transition-colors"
            >
              Test your soil now
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <p className="text-sm text-ink-muted">Weather from Open-Meteo. Live first, then cached, then a seasonal average.</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
