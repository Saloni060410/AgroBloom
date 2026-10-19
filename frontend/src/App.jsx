import { useEffect, Suspense, lazy } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import RequireAuth from './components/layout/RequireAuth.jsx'
import RouteErrorBoundary from './components/layout/RouteErrorBoundary.jsx'
import AppShell from './components/layout/AppShell.jsx'
import { useUserStore } from './store/useUserStore.js'

import Landing from './pages/Landing.jsx'

// Everything else is code-split so the landing page stays light.
const Login = lazy(() => import('./pages/Auth/Login.jsx'))
const Register = lazy(() => import('./pages/Auth/Register.jsx'))
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const FieldProfile = lazy(() => import('./pages/FieldProfile.jsx'))
const SoilInput = lazy(() => import('./pages/SoilInput.jsx'))
const Recommendation = lazy(() => import('./pages/Recommendation.jsx'))
const Schedule = lazy(() => import('./pages/Schedule.jsx'))
const History = lazy(() => import('./pages/History.jsx'))
const RiskCheck = lazy(() => import('./pages/RiskCheck.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const ServerError = lazy(() => import('./pages/ServerError.jsx'))

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8" role="status" aria-label="Loading page">
      <div className="w-9 h-9 rounded-full border-[3px] border-primary-500 border-t-transparent animate-spin" />
    </div>
  )
}

// Every page after sign-in shares one frame; 404/500 use it too but without the sign-in gate.
const appPage = (page) => (
  <RequireAuth>
    <AppShell>{page}</AppShell>
  </RequireAuth>
)

const openPage = (page) => <AppShell>{page}</AppShell>

export default function App() {
  const hydrate = useUserStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Older links that pointed at a field id that never exists; a field is picked on the dashboard. */}
          <Route path="/recommendation" element={<Navigate to="/dashboard" replace />} />
          <Route path="/prescription" element={<Navigate to="/dashboard" replace />} />
          <Route path="/optimizer" element={<Navigate to="/" replace />} />

          <Route path="/overview" element={appPage(<Overview />)} />
          <Route path="/dashboard" element={appPage(<Dashboard />)} />

          <Route path="/fields/:fieldId" element={appPage(<FieldProfile />)} />
          <Route path="/fields/:fieldId/soil" element={appPage(<SoilInput />)} />
          <Route path="/fields/:fieldId/recommendation" element={appPage(<Recommendation />)} />
          <Route path="/fields/:fieldId/schedule" element={appPage(<Schedule />)} />
          <Route path="/fields/:fieldId/risk-check" element={appPage(<RiskCheck />)} />
          <Route path="/fields/:fieldId/history" element={appPage(<History />)} />

          <Route path="/404" element={openPage(<NotFound />)} />
          <Route path="/500" element={openPage(<ServerError />)} />
          <Route path="*" element={openPage(<NotFound />)} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}
