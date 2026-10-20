import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, LayoutDashboard, Sprout, FlaskConical, CalendarDays, BarChart3 } from 'lucide-react'
import { SproutMark } from '../brand/Logo.jsx'
import { BRAND } from '../brand/brand.js'
import Drawer from './Drawer.jsx'
import UserMenu from './UserMenu.jsx'
import { useActiveField } from '../../hooks/useActiveField.js'

function useSidebarItems() {
  const { fieldPath } = useActiveField()
  return [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/dashboard', label: 'My Fields', icon: Sprout },
    { to: fieldPath('/soil'), label: 'Soil Tests', icon: FlaskConical },
    { to: fieldPath('/schedule'), label: 'Fertilizer Schedule', icon: CalendarDays },
    { to: fieldPath('/history'), label: 'Reports', icon: BarChart3 },
  ]
}

function NavItems({ items }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(({ to, label, icon: Icon }) => (
        <li key={label}>
          <NavLink
            to={to}
            end
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1.5 px-3 py-3.5 text-center text-[13px] leading-tight rounded-md transition-colors ${
                isActive ? 'bg-white/[0.06] text-white font-semibold' : 'text-ink-sidebar/80 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary-500" aria-hidden="true" />}
                <span
                  className={`w-11 h-11 rounded-lg inline-flex items-center justify-center ${
                    isActive ? 'bg-primary-500/25 text-[#b9d98a]' : 'bg-white/5 text-[#cfd9bd]'
                  }`}
                >
                  <Icon className="w-6 h-6" strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/** Dark sidebar app shell: Overview, My Fields, Soil Tests, Fertilizer Schedule, Reports. */
export default function SidebarShell({ children }) {
  const items = useSidebarItems()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  return (
    <div className="min-h-screen bg-paper-warm lg:pl-[216px]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-700 focus:text-white focus:rounded-md"
      >
        Skip to main content
      </a>

      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[216px] flex-col bg-bg-sidebar text-ink-sidebar z-30 no-print">
        <div className="flex flex-col items-center pt-7 pb-6 gap-1">
          <SproutMark size={46} />
          <span className="text-xl font-semibold text-white tracking-tight">{BRAND.name}</span>
        </div>
        <nav aria-label="App" className="flex-1 overflow-y-auto px-3">
          <NavItems items={items} />
        </nav>
        <div className="p-4 border-t border-white/10">
          <UserMenu dark />
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-bg-sidebar text-white flex items-center justify-between px-4 h-16 no-print">
        <span className="inline-flex items-center gap-2">
          <SproutMark size={34} />
          <span className="font-semibold text-lg">{BRAND.name}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer"
        >
          <Menu className="w-6 h-6" aria-hidden="true" />
        </button>
      </header>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu" dark>
        <nav aria-label="Mobile app">
          <NavItems items={items} />
        </nav>
        <div className="mt-6 pt-4 border-t border-white/10 px-2">
          <UserMenu dark />
        </div>
      </Drawer>

      <main id="main-content" tabIndex={-1} className="px-4 sm:px-8 lg:px-10 py-6 sm:py-8 max-w-[1240px]">
        {children}
      </main>
    </div>
  )
}
