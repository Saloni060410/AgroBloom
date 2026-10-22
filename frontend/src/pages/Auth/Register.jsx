import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Mail, Lock, User, Sprout, Briefcase } from 'lucide-react'
import AuthLayout from '../../components/layout/AuthLayout.jsx'
import { useUserStore } from '../../store/useUserStore.js'
import AuthTabs from '../../components/layout/AuthTabs.jsx'
import { BRAND } from '../../components/brand/brand.js'

const ROLES = [
  { id: 'FARMER', label: 'Farmer', hint: 'I manage my own fields', icon: Sprout },
  { id: 'AGRONOMIST', label: 'Agronomist', hint: 'I advise farmers', icon: Briefcase },
]

const inputClass =
  'w-full min-h-[48px] pl-11 pr-3 rounded-md border-2 border-border-default hover:border-border-strong focus:border-primary-600 bg-white text-ink-primary placeholder:text-ink-muted focus:outline-none'

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'FARMER' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useUserStore()

  const validate = () => {
    const errors = {}
    if (!formData.name.trim()) errors.name = 'Full name is required.'
    if (!formData.email.trim()) errors.email = 'Email address is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errors.email = 'Enter a valid email address.'
    if (!formData.password) errors.password = 'Password is required.'
    else if (formData.password.length < 8) errors.password = 'Password must be at least 8 characters.'
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
      await register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
      })
      navigate(location.state?.from?.pathname || '/overview', { replace: true })
    } catch (err) {
      setApiError(err.message || 'Registration failed. Check your details and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const field = (id, label, Icon, props, error) => (
    <div>
      <label htmlFor={id} className="text-[15px] font-semibold text-ink-primary block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Icon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-primary-600" aria-hidden="true" />
        <input
          id={id}
          name={props.name}
          disabled={isSubmitting}
          value={formData[props.name]}
          onChange={handleChange}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputClass} ${props.type === 'password' ? 'pr-12' : ''}`}
          {...props}
          type={props.type === 'password' && showPassword ? 'text' : props.type}
        />
        {props.type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 -translate-y-1/2 min-h-touch min-w-touch inline-flex items-center justify-center text-ink-muted hover:text-ink-primary cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
          </button>
        )}
      </div>
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-risk-high-text">{error}</p>}
    </div>
  )

  return (
    <AuthLayout
      title={`Sign up for ${BRAND.name}`}
      subtitle="New here? Create an account to plan fertilizer for your fields"
      pageTitle={`Create your account — ${BRAND.name}`}
      footer={`${BRAND.name} © ${new Date().getFullYear()} · A research prototype, not extension advice`}
    >
      <AuthTabs mode="register" state={location.state} />

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        {apiError && (
          <div role="alert" className="p-3 rounded-md border border-risk-high-border bg-risk-high-bg text-risk-high-text flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{apiError}</span>
          </div>
        )}

        <fieldset>
          <legend className="text-[15px] font-semibold text-ink-primary mb-1.5">I am a</legend>
          <div className="grid grid-cols-2 gap-3" role="radiogroup">
            {ROLES.map(({ id, label, hint, icon: Icon }) => {
              const selected = formData.role === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFormData((p) => ({ ...p, role: id }))}
                  className={`text-left p-3 rounded-md border-2 transition-colors cursor-pointer ${
                    selected ? 'border-primary-600 bg-primary-50' : 'border-border-default hover:border-border-strong'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${selected ? 'text-primary-600' : 'text-ink-muted'}`} aria-hidden="true" />
                  <div className="mt-1 text-sm font-semibold text-ink-primary">{label}</div>
                  <div className="text-xs text-ink-muted leading-snug">{hint}</div>
                </button>
              )
            })}
          </div>
        </fieldset>

        {field('reg-name', 'Full name', User, { name: 'name', type: 'text', autoComplete: 'name', placeholder: 'Ramesh Patel' }, fieldErrors.name)}
        {field('reg-email', 'Email address', Mail, { name: 'email', type: 'email', autoComplete: 'email', placeholder: 'you@example.com' }, fieldErrors.email)}
        {field('reg-password', 'Password', Lock, { name: 'password', type: 'password', autoComplete: 'new-password', placeholder: 'At least 8 characters' }, fieldErrors.password)}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[50px] rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-base font-medium shadow-md transition-colors cursor-pointer"
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="flex flex-wrap items-center justify-between gap-2 text-sm pt-1">
          <span className="font-medium text-ink-primary">Already registered?</span>
          <Link to="/login" state={location.state} className="font-semibold text-primary-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
