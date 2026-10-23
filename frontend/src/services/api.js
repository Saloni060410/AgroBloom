import axios from 'axios'

export const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
// 10s is plenty for a server that is always running. A host that sleeps idle services needs about
// a minute to wake the API and then the ML service, so a deployment can raise it at build time.
const timeout = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000

const api = axios.create({
  baseURL,
  timeout,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Normalizes errors into { status, message, details }
export function normalizeError(error) {
  if (error.response) {
    const status = error.response.status
    const data = error.response.data || {}
    const message =
      data.error || data.message || error.message || 'A server error occurred'
    const details = data.details || null
    return { status, message, details }
  } else if (error.request) {
    return {
      status: 0,
      message: 'Network error. Could not connect to the KhetGPT server.',
      details: null,
    }
  }
  return {
    status: 500,
    message: error.message || 'An unexpected error occurred.',
    details: null,
  }
}

// Attach access token to requests
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('accessToken')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // localStorage may be unavailable in restricted environments
    }
    return config
  },
  (error) => Promise.reject(normalizeError(error)),
)

// Handle 401 token refresh queue
let isRefreshing = false
let refreshSubscribers = []

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb)
}

function onRefreshed(newAccessToken) {
  refreshSubscribers.forEach((cb) => cb(newAccessToken))
  refreshSubscribers = []
}

function onRefreshFailed(error) {
  refreshSubscribers.forEach((cb) => cb(null, error))
  refreshSubscribers = []
}

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config

    if (!originalRequest) {
      return Promise.reject(normalizeError(error))
    }

    const status = error.response?.status

    // If 401 Unauthorized
    if (status === 401 && !originalRequest._retry) {
      const requestUrl = originalRequest.url || ''

      // Do not attempt refresh on auth endpoints to prevent loops
      if (
        requestUrl.includes('/auth/refresh') ||
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/register')
      ) {
        return Promise.reject(normalizeError(error))
      }

      originalRequest._retry = true

      // If a refresh is already in progress, wait for it
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token, err) => {
            if (err) {
              reject(err)
            } else {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            }
          })
        })
      }

      isRefreshing = true

      let refreshToken = null
      try {
        refreshToken = localStorage.getItem('refreshToken')
      } catch {
        refreshToken = null
      }

      if (!refreshToken) {
        isRefreshing = false
        // Broadcast logout event
        window.dispatchEvent(new CustomEvent('khetgpt:auth:logout'))
        return Promise.reject(normalizeError(error))
      }

      try {
        // Call refresh endpoint directly using raw axios
        const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken })
        const { accessToken, refreshToken: newRefreshToken } = res.data

        if (accessToken) {
          localStorage.setItem('accessToken', accessToken)
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken)
          }

          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
          originalRequest.headers.Authorization = `Bearer ${accessToken}`

          onRefreshed(accessToken)
          isRefreshing = false

          return api(originalRequest)
        }
      } catch (refreshErr) {
        isRefreshing = false
        const normalizedRefreshErr = normalizeError(refreshErr)
        onRefreshFailed(normalizedRefreshErr)

        // Clear tokens and notify app
        try {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('user')
        } catch {
          // ignore storage error
        }
        window.dispatchEvent(new CustomEvent('khetgpt:auth:logout'))

        return Promise.reject(normalizedRefreshErr)
      }
    }

    return Promise.reject(normalizeError(error))
  },
)

export default api
