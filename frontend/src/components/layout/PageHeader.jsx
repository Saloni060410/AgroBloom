/**
 * Title block at the top of every app page: optional eyebrow, one h1 style, optional subtitle,
 * and a right-hand slot for the field switcher, weather or page actions.
 */
export default function PageHeader({ eyebrow, title, subtitle, children, className = '' }) {
  return (
    <header className={`flex flex-col md:flex-row md:items-center justify-between gap-5 animate-reveal no-print ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-semibold text-primary-700">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-[2.2rem] font-bold text-ink-primary leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-secondary max-w-2xl">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 shrink-0">{children}</div>}
    </header>
  )
}
