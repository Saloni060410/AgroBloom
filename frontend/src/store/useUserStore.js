import { create } from 'zustand'
import { resetSessionData } from './resetSession.js'
import * as endpoints from '../services/endpoints.js'

export const useUserStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  error: null,

  // Safely hydrate auth state from localStorage
  hydrate: () => {
    try {
      const accessToken = localStorage.getItem('accessToken')
      const refreshToken = localStorage.getItem('refreshToken')
      const storedUser = localStorage.getItem('user')

      if (accessToken && storedUser) {
        const user = JSON.parse(storedUser)
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          isHydrated: true,
        })
        return
      } else if (import.meta.env.VITE_USE_MOCK === 'true') {
        const mockUser = { id: 'farmer-1', name: 'Ramesh Patel', email: 'farmer@khetgpt.in', role: 'farmer' }
        set({
          accessToken: 'mock-jwt-token',
          refreshToken: 'mock-refresh-token',
          user: mockUser,
          isAuthenticated: true,
          isHydrated: true,
        })
        return
      }
    } catch {
      try {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      } catch {
        // ignore
      }
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isHydrated: true,
    })
  },

  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const data = await endpoints.login(credentials)
      const { user, accessToken, refreshToken } = data

      try {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        localStorage.setItem('user', JSON.stringify(user))
      } catch {
        // ignore storage error
      }

      resetSessionData() // never start from another account's fields
      set({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
      })
      return data
    } catch (err) {
      const errorMsg = err.message || 'Login failed'
      set({ isLoading: false, error: errorMsg })
      throw err
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null })
    try {
      const data = await endpoints.register(userData)
      const { user, accessToken, refreshToken } = data

      try {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        localStorage.setItem('user', JSON.stringify(user))
      } catch {
        // ignore storage error
      }

      resetSessionData() // never start from another account's fields
      set({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isLoading: false,
      })
      return data
    } catch (err) {
      const errorMsg = err.message || 'Registration failed'
      set({ isLoading: false, error: errorMsg })
      throw err
    }
  },

  logout: async () => {
    const { refreshToken } = get()
    try {
      if (refreshToken) {
        await endpoints.logout({ refreshToken })
      }
    } catch {
      // ignore server logout errors
    } finally {
      try {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      } catch {
        // ignore
      }
      resetSessionData() // the next person on this device must not see this account's fields
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    }
  },

  clearError: () => set({ error: null }),
  setUser: (user) => set({ user }),
}))

// Auto-listen to global logout events
if (typeof window !== 'undefined') {
  window.addEventListener('khetgpt:auth:logout', () => {
    useUserStore.getState().logout()
  })
}
