import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Logo from '../brand/Logo.jsx'
import Drawer from './Drawer.jsx'
import { useUserStore } from '../../store/useUserStore.js'
import { useActiveField } from '../../hooks/useActiveField.js'
import { firstName } from '../../utils/format.js'

/** Top bar for the public pages (landing, 404): logo, three app links, Sign In / Dashboard. */
export default function SiteNav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { fieldPath } = useActiveField()
  const { isAuthenticated, user } = useUserStore()

  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  const links = [
    { to: '/overview', label: 'Overview' },
    { to: '/dashboard', label: 'My Fields' },
    { to: fieldPath('/soil'), label: 'Soil test' },
    { to: fieldPath('/schedule'), label: 'Schedule' },
    { to: fieldPath('/history'), label: 'History' },
  ]

  const linkClass = ({ isActive }) =>
    `px-1 py-2 text-[15px] font-medium transition-colors ${
      isActive ? 'text-primary-700' : 'text-ink-primary hover:text-primary-700'
    }`

  const cta = isAuthenticated ? (
    <Link
      to="/dashboard"
      className="inline-flex items-center min-h-touch px-5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-[15px] font-medium shadow-sm transition-colors"
    >
      {firstName(user?.name)}&apos;s Dashboard
    </Link>
  ) : (
    <Link
      to="/login"
      className="inline-flex items-center min-h-touch px-6 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-[15px] font-medium shadow-sm transition-colors"
    >
      Sign In
    </Link>
  )

  return (
    <header className="relative z-30 no-print">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-700 focus:text-white focus:rounded-md"
      >
        Skip to main content
      </a>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between gap-6">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo size={40} />
        </Link>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-7">
          {links.map((l) => (
            <NavLink key={l.label} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
          {cta}
        </nav>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="lg:hidden min-h-touch min-w-touch inline-flex items-center justify-center rounded-full hover:bg-black/5 cursor-pointer"
        >
          <Menu className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu">
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              className="px-3 py-3 rounded-md text-base font-medium hover:bg-bg-subtle"
            >
              {l.label}
            </NavLink>
          ))}
          <div className="pt-3 px-3 flex">{cta}</div>
        </nav>
      </Drawer>
    </header>
  )
}
