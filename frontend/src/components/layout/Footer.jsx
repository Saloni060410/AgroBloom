import { Link } from 'react-router-dom'
import Logo from '../brand/Logo.jsx'
import { useActiveField } from '../../hooks/useActiveField.js'

export default function Footer({ dark = false, className = '' }) {
  const { fieldPath } = useActiveField()
  const tone = dark ? 'text-white/70' : 'text-ink-muted'
  return (
    <footer className={`no-print border-t ${dark ? 'border-white/15' : 'border-border-default bg-bg-subtle/60'} ${className}`}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo size={34} variant={dark ? 'light' : 'dark'} />
          <p className={`text-sm leading-relaxed max-w-md ${tone}`}>
            A research prototype built from published Punjab Agricultural University and ICAR-IISS tables. It is not extension advice. Check final rates with your district Krishi Vigyan Kendra or Block Agriculture Officer.
          </p>
        </div>
        <nav aria-label="Footer" className="text-sm space-y-2">
          <div className={`font-semibold ${dark ? 'text-white' : 'text-ink-primary'}`}>App</div>
          <ul className={`space-y-1.5 ${tone}`}>
            <li><Link className="hover:underline" to="/overview">Overview</Link></li>
            <li><Link className="hover:underline" to="/dashboard">My Fields</Link></li>
            <li><Link className="hover:underline" to={fieldPath('/soil')}>Soil test</Link></li>
            <li><Link className="hover:underline" to={fieldPath('/schedule')}>Schedule</Link></li>
            <li><Link className="hover:underline" to={fieldPath('/history')}>History</Link></li>
          </ul>
        </nav>
        <div className="text-sm space-y-2">
          <div className={`font-semibold ${dark ? 'text-white' : 'text-ink-primary'}`}>Data</div>
          <ul className={`space-y-1.5 ${tone}`}>
            <li>PAU Package of Practices</li>
            <li>ICAR-IISS STCR</li>
            <li>Open-Meteo weather</li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
