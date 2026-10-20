import SiteNav from './SiteNav.jsx'
import Footer from './Footer.jsx'

/** Public-page wrapper for the 404 and 500 screens. */
export default function PublicShell({ children }) {
  return (
    <div className="min-h-screen bg-paper-warm flex flex-col">
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}
