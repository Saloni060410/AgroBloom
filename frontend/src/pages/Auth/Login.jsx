import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Mail, Lock } from 'lucide-react'
import AuthLayout from '../../components/layout/AuthLayout.jsx'
import { useUserStore } from '../../store/useUserStore.js'
import { BRAND } from '../../components/brand/brand.js'

const LANGUAGES = [
  { id: 'en', label: 'English', enabled: true },
  { id: 'hi', label: 'Hindi', enabled: false },
  { id: 'mr', label: 'Marathi', enabled: false },
]

const DEMO_FARMER = 'kisan@khetgpt.in'

export default function Login() {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useUserStore()

  const validate = () => {
    const errors = {}
    if (!formData.email.trim()) errors.email = 'Email address is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errors.email = 'Enter a valid email address.'
    if (!formData.password) errors.password = 'Password is required.'
    else if (formData.password.length < 6) errors.password = 'Password must be at least 6 characters.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: null }))
    if (apiError) setApiError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    setApiError(null)
    try {
      await login({ email: formData.email.trim(), password: formData.password })
      navigate(location.state?.from?.pathname || '/overview', { replace: true })
    } catch (err) {
      setApiError(err.message || 'Invalid email or password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={`Log In to ${BRAND.name}`}
      footer={`${BRAND.name} © ${new Date().getFullYear()} · A research prototype, not extension advice`}
    >
      {/* Login method tabs. Mobile OTP needs an SMS provider and a phone number on the account; neither exists yet. */}
      <div role="tablist" aria-label="Login method" className="mt-6 grid grid-cols-2 border-b-2 border-border-default">
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          disabled
          title="Mobile OTP login is not available yet"
          className="py-2.5 text-[15px] font-medium text-ink-muted cursor-not-allowed"
        >
          Mobile OTP <span className="ml-1 text-[10px] uppercase tracking-wide bg-bg-muted rounded-full px-1.5 py-0.5 align-middle">Soon</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="py-2.5 text-[15px] font-semibold text-terracotta-600 border-b-[3px] border-terracotta-600 -mb-[2px]"
        >
          Password Login
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        <fieldset>
          <legend className="text-[15px] font-semibold text-ink-primary mb-1.5">Select Language</legend>
          <div className="grid grid-cols-3 rounded-md border-2 border-border-default overflow-hidden">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={!l.enabled}
                aria-pressed={l.enabled}
                title={l.enabled ? undefined : `${l.label} is not available yet`}
                className={`min-h-[44px] text-sm font-medium ${
                  l.enabled ? 'bg-primary-50 text-ink-primary' : 'text-ink-muted cursor-not-allowed'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>

        {apiError && (
          <div role="alert" className="p-3 rounded-md border border-risk-high-border bg-risk-high-bg text-risk-high-text flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{apiError}</span>
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="text-[15px] font-semibold text-ink-primary block mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-primary-600" aria-hidden="true" />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? 'login-email-err' : undefined}
              className="w-full min-h-[48px] pl-11 pr-3 rounded-md border-2 border-primary-600 bg-white text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-600/30"
            />
          </div>
          {fieldErrors.email && <p id="login-email-err" className="mt-1 text-xs text-risk-high-text">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="text-[15px] font-semibold text-ink-primary block mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-primary-600" aria-hidden="true" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={formData.password}
              onChange={handleChange}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'login-password-err' : undefined}
              className="w-full min-h-[48px] pl-11 pr-12 rounded-md border-2 border-primary-600 bg-white text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-600/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-touch min-w-touch inline-flex items-center justify-center text-ink-muted hover:text-ink-primary cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
          {fieldErrors.password && <p id="login-password-err" className="mt-1 text-xs text-risk-high-text">{fieldErrors.password}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[50px] rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-base font-medium shadow-md transition-colors cursor-pointer"
        >
          {isSubmitting ? 'Signing in…' : 'Log In'}
        </button>

        <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
          <span className="flex-1 h-px bg-border-default" />
          OR
          <span className="flex-1 h-px bg-border-default" />
        </div>

        <button
          type="button"
          onClick={() => setFormData({ email: DEMO_FARMER, password: 'password123' })}
          className="w-full min-h-[48px] rounded-full bg-bg-muted hover:bg-border-default text-ink-primary text-base font-medium transition-colors cursor-pointer"
        >
          Fill demo farmer account
        </button>

        <p className="flex flex-wrap items-center justify-between gap-2 text-sm pt-1">
          <span className="font-medium text-ink-primary">New here?</span>
          <Link to="/register" className="font-semibold text-primary-600 hover:underline">
            Register New Farmer
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
