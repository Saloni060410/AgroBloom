import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Logo from '../brand/Logo.jsx'
import Drawer from './Drawer.jsx'
import UserMenu from './UserMenu.jsx'
import Footer from './Footer.jsx'
import { useActiveField } from '../../hooks/useActiveField.js'
import { useUserStore } from '../../store/useUserStore.js'

/**
 * The one frame every page after sign-in uses: the same top bar, the same content width and
 * the same footer. Pages only supply their own content (starting with a PageHeader).
 */
export default function AppShell({ children }) {
  const { fieldPath } = useActiveField()
  const isAuthenticated = useUserStore((s) => s.isAuthenticated)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  const links = [
    { to: '/overview', label: 'Overview' },
    { to: '/dashboard', label: 'My Fields' },
    { to: fieldPath('/soil'), label: 'Soil Diagnostics' },
    { to: fieldPath('/recommendation'), label: 'Recommendations' },
    { to: fieldPath('/schedule'), label: 'Schedule' },
    { to: fieldPath('/history'), label: 'Field History' },
    { to: fieldPath('/risk-check'), label: 'Risk Check' },
  ]

  const linkClass = ({ isActive }) =>
    `whitespace-nowrap px-3 py-2 text-[14px] rounded-full transition-colors ${
      isActive ? 'bg-primary-100 text-primary-800 font-semibold' : 'text-ink-primary hover:bg-bg-muted'
    }`

  const account = (compact) =>
    isAuthenticated ? (
      <UserMenu compact={compact} />
    ) : (
      <Link
        to="/login"
        className="inline-flex items-center min-h-touch px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition-colors"
      >
        Sign In
      </Link>
    )

  return (
    <div className="min-h-screen bg-paper-warm flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-700 focus:text-white focus:rounded-md"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 bg-bg-base/95 backdrop-blur border-b border-border-default no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-5 sm:px-8 h-[68px]">
          <Link to="/" aria-label="Home" className="shrink-0">
            <Logo size={36} />
          </Link>
          <nav aria-label="App" className="hidden xl:flex items-center gap-0.5 min-w-0">
            {links.map((l) => (
              <NavLink key={l.label} to={l.to} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden xl:block shrink-0">{account(true)}</div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="xl:hidden min-h-touch min-w-touch inline-flex items-center justify-center rounded-full hover:bg-black/5 cursor-pointer"
          >
            <Menu className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu">
        <nav aria-label="Mobile app" className="flex flex-col gap-1">
          {links.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-3 rounded-md text-base ${isActive ? 'bg-primary-100 text-primary-800 font-semibold' : 'hover:bg-bg-subtle'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 pt-4 border-t border-border-default px-2">{account(false)}</div>
      </Drawer>

      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {children}
      </main>
      <Footer />
    </div>
  )
}
