import { useCallback, useEffect, useRef, useState } from 'react'
import IntroScene from './IntroScene.jsx'
import Logo from '../brand/Logo.jsx'

// Mirrors --intro-delay + --intro-drive in styles/index.css: the tractor is off screen again by
// then, and the screen opens.
const SPLIT_AT_MS = 7100
const SPLIT_MS = 1100

/**
 * Full-screen opening scene. When the tractor has crossed the screen it splits down the middle and
 * the two halves slide apart, revealing the page underneath. `onSplit` fires as the halves start to
 * move (start the page's own entrance), `onDone` once they are gone.
 *
 * The scene is mounted twice, each copy cropped to one half; both start together, so they stay in
 * step. Skip (button or Escape) jumps straight to the split.
 */
export default function FarmIntro({ onSplit, onDone }) {
  const [splitting, setSplitting] = useState(false)
  const started = useRef(false)
  const timers = useRef([])
  const callbacks = useRef({ onSplit, onDone })

  useEffect(() => {
    callbacks.current = { onSplit, onDone }
  })

  const startSplit = useCallback(() => {
    if (started.current) return
    started.current = true
    setSplitting(true)
    callbacks.current.onSplit?.()
    timers.current.push(setTimeout(() => callbacks.current.onDone?.(), SPLIT_MS + 50))
  }, [])

  useEffect(() => {
    const pending = timers.current
    pending.push(setTimeout(startSplit, SPLIT_AT_MS))
    const onKey = (e) => {
      if (e.key === 'Escape') startSplit()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      pending.forEach(clearTimeout)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [startSplit])

  const half = (side) => (
    <div
      className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} w-1/2 overflow-hidden`}
      style={{
        transform: splitting ? `translateX(${side === 'left' ? '-100%' : '100%'})` : 'translateX(0)',
        transition: `transform ${SPLIT_MS}ms cubic-bezier(.72, 0, .24, 1)`,
        boxShadow: splitting ? '0 0 60px rgba(30, 40, 20, .45)' : 'none',
        willChange: 'transform',
      }}
    >
      <div className="absolute inset-y-0" style={{ width: '200%', left: side === 'left' ? 0 : '-100%' }}>
        <IntroScene className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  )

  return (
    <div className="intro-root fixed inset-0 z-[100]" role="region" aria-label="Welcome animation">
      {half('left')}
      {half('right')}

      <div
        className="intro-fade absolute top-5 left-5 sm:top-7 sm:left-8 transition-opacity duration-500"
        style={{ opacity: splitting ? 0 : undefined }}
      >
        <Logo size={44} />
      </div>

      <button
        type="button"
        onClick={startSplit}
        className="absolute bottom-5 right-5 sm:bottom-7 sm:right-8 min-h-[44px] px-5 rounded-full bg-white/85 hover:bg-white text-ink-primary text-sm font-medium shadow-md cursor-pointer transition-opacity duration-300"
        style={{ opacity: splitting ? 0 : 1, pointerEvents: splitting ? 'none' : 'auto' }}
      >
        Skip intro
      </button>
    </div>
  )
}
