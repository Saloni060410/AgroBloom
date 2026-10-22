import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { titleCase } from '../../utils/format.js'

const TAG_TONE = {
  red: 'bg-risk-high-bg text-risk-high-text border-risk-high-border',
  amber: 'bg-risk-med-bg text-risk-med-text border-risk-med-border',
}

/**
 * Which-field dropdown. Farms with several crops are a heading with their crops beneath it; a farm
 * with one crop is a single row. `notesFor(fieldId)` returns small tags for a row, as
 * [{ text, tone: 'red' | 'amber' }]. A listbox popover with keyboard support (arrows, Home/End,
 * Enter, Escape), not a native select, so the farm headings and tags can be styled.
 */
export default function PlotPicker({
  plots,
  value,
  onChange,
  notesFor = () => [],
  label = 'Switch field',
  fallbackLabel = 'Choose a field',
  className = '',
  triggerClassName = '',
  panelClassName = '',
}) {
  const uid = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const groups = useMemo(() => {
    const out = []
    for (const { farm, field } of plots) {
      const group = out.find((g) => String(g.farm.id) === String(farm.id))
      if (group) group.fields.push(field)
      else out.push({ farm, fields: [field] })
    }
    return out
  }, [plots])
  const options = useMemo(
    () => groups.flatMap((g) => g.fields.map((field) => ({ field, farm: g.farm, multi: g.fields.length > 1 }))),
    [groups],
  )
  const selected = options.find((o) => String(o.field.id) === String(value)) || null
  const cropOf = (field) => (field.cropType ? titleCase(field.cropType) : '')
  const triggerText = selected
    ? selected.multi
      ? `${selected.farm.name} · ${cropOf(selected.field)}`
      : `${selected.field.name}${cropOf(selected.field) ? ` (${cropOf(selected.field)})` : ''}`
    : fallbackLabel

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the keyboard-highlighted row in view inside the scrolling list.
  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => String(o.field.id) === String(value))))
    setOpen(true)
  }
  const choose = (index) => {
    const option = options[index]
    setOpen(false)
    triggerRef.current?.focus()
    if (option && String(option.field.id) !== String(value)) onChange(option.field.id)
  }

  const onKeyDown = (e) => {
    const last = options.length - 1
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openMenu()
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(last, i + 1) : Math.max(0, i - 1)))
    } else if (e.key === 'Home' && open) {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End' && open) {
      e.preventDefault()
      setActive(last)
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      choose(active)
    }
  }

  let index = -1
  const row = (option, primary, secondary) => {
    index += 1
    const i = index
    const isSelected = String(option.field.id) === String(value)
    const notes = notesFor(option.field.id)
    return (
      <li
        key={option.field.id}
        id={`${uid}-o${i}`}
        role="option"
        aria-selected={isSelected}
        data-active={i === active}
        onMouseEnter={() => setActive(i)}
        onClick={() => choose(i)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer ${i === active ? 'bg-primary-50' : ''}`}
      >
        <span className="w-4 shrink-0 text-primary-700">{isSelected && <Check className="w-4 h-4" aria-hidden="true" />}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm truncate ${isSelected ? 'font-semibold' : 'font-medium'} text-ink-primary`}>{primary}</span>
          {secondary && <span className="block text-xs text-ink-muted truncate">{secondary}</span>}
        </span>
        <span className="flex flex-wrap justify-end gap-1 shrink-0">
          {notes.map((n) => (
            <span key={n.text} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TAG_TONE[n.tone] || TAG_TONE.amber}`}>
              {n.text}
            </span>
          ))}
        </span>
      </li>
    )
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-o${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex items-center justify-between gap-3 min-h-[44px] pl-4 pr-3.5 rounded-full border-2 border-border-default hover:border-border-strong bg-white text-sm font-medium text-ink-primary cursor-pointer focus:outline-none focus-visible:border-primary-600 ${triggerClassName}`}
      >
        <span className="truncate">{triggerText}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          aria-label={label}
          className={`absolute left-0 z-40 mt-2 w-max min-w-full max-w-[min(26rem,calc(100vw-2rem))] max-h-[22rem] overflow-y-auto rounded-lg border border-border-default bg-white p-1.5 shadow-lg ${panelClassName}`}
        >
          {groups.map((g) =>
            g.fields.length > 1 ? (
              <li key={g.farm.id} role="presentation" className="pt-1.5 first:pt-0">
                <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g.farm.name}</div>
                <ul role="group" aria-label={g.farm.name}>
                  {g.fields.map((field) => row(options.find((o) => o.field.id === field.id), cropOf(field) || field.name, null))}
                </ul>
              </li>
            ) : (
              row(options.find((o) => o.field.id === g.fields[0].id), g.fields[0].name, cropOf(g.fields[0]))
            ),
          )}
        </ul>
      )}
    </div>
  )
}
