import { Check } from 'lucide-react'

/**
 * Stack of "done, undo?" toasts. Each has a countdown bar that matches durationMs; the caller owns
 * the timer and removes the item when it fires or when Undo is pressed.
 */
export default function UndoToasts({ items, durationMs }) {
  if (!items.length) return null
  return (
    <div
      className="no-print fixed z-50 bottom-4 left-1/2 -translate-x-1/2 lg:left-[calc(50%+116px)] w-[min(26rem,calc(100vw-2rem))] flex flex-col gap-2"
      role="region"
      aria-label="Recent actions"
    >
      {items.map((t) => (
        <div key={t.id} role="status" className="relative overflow-hidden rounded-lg bg-bg-sidebar text-white shadow-lg animate-reveal">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-8 h-8 rounded-full bg-primary-500/30 text-[#b9d98a] inline-flex items-center justify-center shrink-0" aria-hidden="true">
              <Check className="w-4 h-4" />
            </span>
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={t.onUndo}
              className="min-h-[40px] px-3 rounded-full text-sm font-semibold text-accent-sun hover:bg-white/10 cursor-pointer"
            >
              Undo
            </button>
          </div>
          <span
            className="absolute bottom-0 left-0 h-1 bg-accent-sun"
            style={{ animation: `shrinkBar ${durationMs}ms linear forwards` }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  )
}
