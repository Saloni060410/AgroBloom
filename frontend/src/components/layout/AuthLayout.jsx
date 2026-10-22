import { Link } from 'react-router-dom'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import GreenhouseScene from '../illustrations/GreenhouseScene.jsx'
import { BRAND } from '../brand/brand.js'

/**
 * Kraft-paper backdrop with the split card: illustrated welcome on the left, the form card on
 * the right. Used by Login and Register.
 */
export default function AuthLayout({ title, pageTitle, subtitle = 'Log in to your agricultural fertilizer dashboard', children, footer }) {
  useDocumentTitle(pageTitle || `${title} — ${BRAND.name}`)
  return (
    <div className="bg-kraft-paper min-h-screen px-3 py-4 sm:px-8 sm:py-10 flex items-center justify-center">
      <main
        id="main-content"
        tabIndex={-1}
        className="w-full max-w-6xl bg-[#fdf3d6] rounded-xl shadow-lg overflow-hidden grid lg:grid-cols-2"
      >
        <section className="relative bg-[#fbf1cc] flex flex-col min-h-[300px] lg:min-h-[700px]">
          <div className="relative z-10 text-center px-6 pt-8 lg:pt-12">
            <Link to="/" className="inline-block text-4xl sm:text-[2.6rem] font-semibold text-primary-600 leading-none">
              {BRAND.name}
            </Link>
            <p className="mt-3 text-xl sm:text-2xl font-semibold text-ink-primary">{BRAND.tagline}</p>
            <p className="mt-2 text-ink-secondary">{subtitle}</p>
          </div>
          <GreenhouseScene className="absolute inset-0 w-full h-full hidden sm:block" />
        </section>

        <section className="relative flex flex-col justify-center px-5 sm:px-10 py-10 bg-[#fdf3d6]">
          <div className="w-full max-w-md mx-auto bg-white rounded-lg border-2 border-terracotta-600 shadow-card-edge p-6 sm:p-8">
            <h1 className="text-2xl sm:text-[1.7rem] font-semibold text-center text-ink-primary">{title}</h1>
            {children}
          </div>
          {footer && <p className="mt-8 text-center text-xs text-ink-muted">{footer}</p>}
        </section>
      </main>
    </div>
  )
}
