import { Link } from 'react-router-dom'

const TABS = [
  { mode: 'login', to: '/login', label: 'Log in', hint: 'I have an account' },
  { mode: 'register', to: '/register', label: 'Sign up', hint: 'I am a new customer' },
]

/** The two ways in, one tap apart: log in (already registered) or sign up (new customer). */
export default function AuthTabs({ mode, state }) {
  return (
    <nav aria-label="Account" className="mt-5 short:mt-3 grid grid-cols-2 gap-1 p-1 rounded-full bg-bg-muted">
      {TABS.map((t) => {
        const active = t.mode === mode
        return (
          <Link
            key={t.mode}
            to={t.to}
            state={state}
            replace
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center min-h-[52px] short:min-h-[46px] rounded-full text-center leading-tight transition-colors ${
              active ? 'bg-primary-600 text-white shadow-sm' : 'text-ink-secondary hover:bg-white/70'
            }`}
          >
            <span className="text-[15px] font-semibold">{t.label}</span>
            <span className={`text-[11px] ${active ? 'text-white/85' : 'text-ink-muted'}`}>{t.hint}</span>
          </Link>
        )
      })}
    </nav>
  )
}
