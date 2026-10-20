import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Logo from '../brand/Logo.jsx'
import Drawer from './Drawer.jsx'
import UserMenu from './UserMenu.jsx'
import Footer from './Footer.jsx'
import { useActiveField } from '../../hooks/useActiveField.js'

/**
 * Top-navigation shell for the field pages. frame="forest" is the cream window on a green
 * backdrop used by the recommendation and history screens.
 */
export default function TopNavShell({ children, frame = 'plain' }) {
  const { fieldPath } = useActiveField()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: fieldPath(''), label: 'Field' , end: true },
    { to: fieldPath('/soil'), label: 'Soil Diagnostics' },
    { to: fieldPath('/recommendation'), label: 'Recommendations' },
    { to: fieldPath('/schedule'), label: 'Schedule' },
    { to: fieldPath('/history'), label: 'Field History' },
    { to: fieldPath('/risk-check'), label: 'Risk Check' },
  ]

  const linkClass = ({ isActive }) =>
    `relative whitespace-nowrap px-3 py-2 text-[14px] rounded-full transition-colors ${
      isActive ? 'bg-bg-muted text-ink-primary font-semibold' : 'text-ink-primary hover:bg-bg-subtle'
    }`

  const bar = (
    <div className="flex items-center justify-between gap-4 px-4 sm:px-8 h-[68px] no-print">
      <Link to="/" aria-label="Home" className="shrink-0">
        <Logo size={36} />
      </Link>
      <nav aria-label="Field" className="hidden lg:flex items-center gap-1 min-w-0">
        {links.map((l) => (
          <NavLink key={l.label} to={l.to} end={l.end} className={linkClass}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="hidden lg:block w-[200px]">
        <UserMenu />
      </div>
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
  )

  const drawer = (
    <Drawer open={open} onClose={() => setOpen(false)} title="Menu">
      <nav aria-label="Mobile field" className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.label}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `px-3 py-3 rounded-md text-base ${isActive ? 'bg-bg-muted font-semibold' : 'hover:bg-bg-subtle'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6 pt-4 border-t border-border-default px-2">
        <UserMenu />
      </div>
    </Drawer>
  )

  const skip = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-700 focus:text-white focus:rounded-md"
    >
      Skip to main content
    </a>
  )

  if (frame === 'forest') {
    return (
      <div className="min-h-screen bg-bg-forest px-2 py-2 sm:px-6 sm:py-6">
        {skip}
        <div className="max-w-[1240px] mx-auto bg-bg-base rounded-xl shadow-lg overflow-hidden">
          <header className="bg-white border-b border-border-subtle">{bar}</header>
          {drawer}
          <main id="main-content" tabIndex={-1} className="px-4 sm:px-8 py-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper-warm flex flex-col">
      {skip}
      <header className="bg-bg-base/95 backdrop-blur border-b border-border-default sticky top-0 z-30">{bar}</header>
      {drawer}
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
