import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  isOpen = false,
  onClose,
  title,
  description,
  children,
  className = '',
}) {
  const modalRef = useRef(null)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose?.()
      }
    }

    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-primary/60 backdrop-blur-sm transition-opacity duration-normal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-desc' : undefined}
        className={`
          w-full max-w-lg bg-bg-base border border-border-default rounded-xl shadow-lg
          p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-fast
          ${className}
        `}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 id="modal-title" className="text-xl font-bold text-ink-primary tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p id="modal-desc" className="text-sm text-ink-secondary mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-touch min-w-touch -mr-2 -mt-2 inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="text-ink-primary text-base leading-relaxed">{children}</div>
      </div>
    </div>
  )
}
