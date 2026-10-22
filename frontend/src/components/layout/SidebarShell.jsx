import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, LayoutDashboard, Sprout, FlaskConical, CalendarDays, History } from 'lucide-react'
import { SproutMark } from '../brand/Logo.jsx'
import { BRAND } from '../brand/brand.js'
import Drawer from './Drawer.jsx'
import UserMenu from './UserMenu.jsx'
import { useActiveField } from '../../hooks/useActiveField.js'
import { useFieldStatusSync } from '../../hooks/useFieldStatusSync.js'
import { useFieldStatusStore } from '../../store/useFieldStatusStore.js'
import { doseText } from '../../utils/schedule.js'
import SoilTestPrompt from '../soil/SoilTestPrompt.jsx'

// My Fields also owns the pages you reach from a field card: its overview, plan and risk check.
const FIELDS_AREA = /^\/fields\/[^/]+(\/(recommendation|risk-check))?\/?$/

function useSidebarItems(pathname) {
  const { fieldPath, plots } = useActiveField()
  const alerts = useFieldStatusSync(plots)
  const byField = useFieldStatusStore((s) => s.byField)

  // Fields with doses due or overdue, most urgent first (the one waiting longest, then the soonest).
  const pendingFields = plots
    .filter(({ field }) => byField[field.id]?.dueCount > 0)
    .map(({ field }) => ({ id: field.id, name: field.name, status: byField[field.id], text: doseText(byField[field.id]) }))
    .sort((a, b) => a.status.due[0].days - b.status.due[0].days)

  const items = [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard, active: pathname === '/overview' },
    { to: '/dashboard', label: 'My Fields', icon: Sprout, active: pathname === '/dashboard' || FIELDS_AREA.test(pathname) },
    { to: fieldPath('/soil'), label: 'Soil test', icon: FlaskConical, active: pathname.endsWith('/soil') },
    {
      // With pending work the Schedule item opens the field that needs it most, not just the first field.
      to: pendingFields[0] ? `/fields/${pendingFields[0].id}/schedule` : fieldPath('/schedule'),
      label: 'Schedule',
      icon: CalendarDays,
      active: pathname.endsWith('/schedule'),
      badge: alerts.count,
      badgeLabel: alerts.count
        ? `${alerts.count} dose${alerts.count === 1 ? '' : 's'} due${alerts.overdue ? `, ${alerts.overdue} overdue` : ' within 7 days'}`
        : null,
      pendingFields,
    },
    { to: fieldPath('/history'), label: 'History', icon: History, active: pathname.endsWith('/history') },
  ]
  return items
}

const MAX_LISTED = 3

/** Red notification rows under the Schedule item: one per field with pending doses, each opening that field's schedule. */
function PendingList({ fields, currentPath }) {
  const shown = fields.slice(0, MAX_LISTED)
  const more = fields.length - shown.length
  return (
    <ul className="mt-1.5 flex flex-col gap-1.5 px-1" aria-label={`Fields with pending doses, ${fields.length}`}>
      {shown.map((f) => {
        const to = `/fields/${f.id}/schedule`
        return (
          <li key={f.id}>
            <Link
              to={to}
              aria-current={currentPath === to ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs leading-tight text-white bg-risk-high-text hover:brightness-110 transition ${
                currentPath === to ? 'ring-2 ring-white/70' : ''
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold truncate">{f.name}</span>
                <span className="block text-white/85">{f.text}</span>
              </span>
            </Link>
          </li>
        )
      })}
      {more > 0 && (
        <li>
          <Link to="/overview" className="block rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold text-white/90 border border-white/25 hover:bg-white/10">
            +{more} more field{more === 1 ? '' : 's'} with pending doses
          </Link>
        </li>
      )}
    </ul>
  )
}

function NavItems({ items, currentPath }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(({ to, label, icon: Icon, active, badge, badgeLabel, pendingFields }) => (
        <li key={label}>
          <Link
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1.5 px-3 py-3.5 text-center text-sm leading-tight rounded-md transition-colors ${
              active ? 'bg-white/[0.06] text-white font-semibold' : 'text-ink-sidebar/80 hover:bg-white/5 hover:text-white'
            }`}
          >
            {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary-500" aria-hidden="true" />}
            <span
              className={`relative w-14 h-14 rounded-xl inline-flex items-center justify-center ${
                active ? 'bg-primary-500/25 text-[#b9d98a]' : 'bg-white/5 text-[#cfd9bd]'
              }`}
            >
              <Icon className="w-8 h-8" strokeWidth={1.6} aria-hidden="true" />
              {badge > 0 && (
                <span
                  className="absolute -top-2 -right-2 min-w-[1.5rem] h-[1.5rem] px-1 rounded-full bg-terracotta-500 text-white text-[11px] font-bold inline-flex items-center justify-center ring-2 ring-bg-sidebar"
                  aria-hidden="true"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span>{label}</span>
            {badgeLabel && <span className="sr-only">{badgeLabel}</span>}
          </Link>
          {pendingFields?.length > 0 && <PendingList fields={pendingFields} currentPath={currentPath} />}
        </li>
      ))}
    </ul>
  )
}

/**
 * The one app shell for every signed-in page: dark sidebar with Overview, My Fields, Soil test,
 * Schedule (badge when a dose is due or overdue) and History. Used as a layout route, so it stays
 * mounted while the page inside it changes.
 */
export default function SidebarShell() {
  const { pathname } = useLocation()
  const items = useSidebarItems(pathname)
  const [open, setOpen] = useState(false)

  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  // New page, start at the top (the sidebar persists, so the browser would not do it).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  const scheduleBadge = items.find((i) => i.label === 'Schedule')?.badge || 0

  return (
    <div className="min-h-screen bg-paper-warm lg:pl-[232px]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-700 focus:text-white focus:rounded-md"
      >
        Skip to main content
      </a>

      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col bg-bg-sidebar text-ink-sidebar z-30 no-print">
        <div className="flex flex-col items-center pt-7 pb-6 gap-1">
          <SproutMark size={46} />
          <span className="text-xl font-semibold text-white tracking-tight">{BRAND.name}</span>
        </div>
        <nav aria-label="App" className="flex-1 overflow-y-auto px-3">
          <NavItems items={items} currentPath={pathname} />
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
          aria-label={scheduleBadge ? `Open menu, ${scheduleBadge} dose${scheduleBadge === 1 ? '' : 's'} due` : 'Open menu'}
          aria-expanded={open}
          className="relative min-h-touch min-w-touch inline-flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer"
        >
          <Menu className="w-6 h-6" aria-hidden="true" />
          {scheduleBadge > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-terracotta-500 ring-2 ring-bg-sidebar" aria-hidden="true" />}
        </button>
      </header>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu" dark>
        <nav aria-label="Mobile app">
          <NavItems items={items} currentPath={pathname} />
        </nav>
        <div className="mt-6 pt-4 border-t border-white/10 px-2">
          <UserMenu dark />
        </div>
      </Drawer>

      <SoilTestPrompt />

      <main id="main-content" tabIndex={-1} className="px-4 sm:px-8 lg:px-10 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
