import { useEffect, Suspense, lazy } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import RequireAuth from './components/layout/RequireAuth.jsx'
import RouteErrorBoundary from './components/layout/RouteErrorBoundary.jsx'
import SidebarShell from './components/layout/SidebarShell.jsx'
import PublicShell from './components/layout/PublicShell.jsx'
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

const publicPage = (page) => <PublicShell>{page}</PublicShell>

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

          {/* Every signed-in page shares one sidebar shell, which stays mounted between pages. */}
          <Route
            element={
              <RequireAuth>
                <SidebarShell />
              </RequireAuth>
            }
          >
            <Route path="/overview" element={<Overview />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/fields/:fieldId" element={<FieldProfile />} />
            <Route path="/fields/:fieldId/soil" element={<SoilInput />} />
            <Route path="/fields/:fieldId/recommendation" element={<Recommendation />} />
            <Route path="/fields/:fieldId/schedule" element={<Schedule />} />
            <Route path="/fields/:fieldId/risk-check" element={<RiskCheck />} />
            <Route path="/fields/:fieldId/history" element={<History />} />
          </Route>

          <Route path="/404" element={publicPage(<NotFound />)} />
          <Route path="/500" element={publicPage(<ServerError />)} />
          <Route path="*" element={publicPage(<NotFound />)} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}
