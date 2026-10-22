import api from './api.js'
import { mockService } from './mock/index.js'

const isMock = import.meta.env.VITE_USE_MOCK === 'true'

// 1. Auth Endpoints
export async function register(data) {
  if (isMock) return mockService.register(data)
  return api.post('/auth/register', data)
}

export async function login(data) {
  if (isMock) return mockService.login(data)
  return api.post('/auth/login', data)
}

export async function refresh(data) {
  if (isMock) return mockService.refresh(data)
  return api.post('/auth/refresh', data)
}

export async function logout(data = {}) {
  if (isMock) return mockService.logout(data)
  return api.post('/auth/logout', data)
}

export async function getMe() {
  if (isMock) return mockService.getMe()
  return api.get('/auth/me')
}

// 2. Farms Endpoints
export async function getFarms(params = {}) {
  if (isMock) return mockService.getFarms(params)
  return api.get('/farms', { params })
}

export async function createFarm(data) {
  if (isMock) return mockService.createFarm(data)
  return api.post('/farms', data)
}

export async function getFarmById(farmId) {
  if (isMock) return mockService.getFarmById(farmId)
  return api.get(`/farms/${farmId}`)
}

export async function deleteFarm(farmId) {
  if (isMock) return mockService.deleteFarm(farmId)
  return api.delete(`/farms/${farmId}`)
}

// 3. Fields Endpoints
export async function getFields(farmId, params = {}) {
  if (isMock) return mockService.getFields(farmId, params)
  return api.get(`/farms/${farmId}/fields`, { params })
}

export async function createField(farmId, data) {
  if (isMock) return mockService.createField(farmId, data)
  return api.post(`/farms/${farmId}/fields`, data)
}

export async function getFieldById(fieldId) {
  if (isMock) return mockService.getFieldById(fieldId)
  return api.get(`/fields/${fieldId}`)
}

export async function deleteField(fieldId) {
  if (isMock) return mockService.deleteField(fieldId)
  return api.delete(`/fields/${fieldId}`)
}

export async function updateField(fieldId, data) {
  if (isMock) return mockService.updateField(fieldId, data)
  return api.patch(`/fields/${fieldId}`, data)
}

// 4. Geocode (Open-Meteo proxy)
export async function geocode(q) {
  if (isMock) return mockService.geocode(q)
  return api.get('/geocode', { params: { q } })
}

// 5. Soil Tests
export async function getSoilTests(fieldId, params = {}) {
  if (isMock) return mockService.getSoilTests(fieldId, params)
  return api.get(`/fields/${fieldId}/soil-tests`, { params })
}

export async function createSoilTest(fieldId, data) {
  if (isMock) return mockService.createSoilTest(fieldId, data)
  return api.post(`/fields/${fieldId}/soil-tests`, data)
}

// 6. Fertilizer Logs
export async function getFertilizerLogs(fieldId, params = {}) {
  if (isMock) return mockService.getFertilizerLogs(fieldId, params)
  return api.get(`/fields/${fieldId}/fertilizer-logs`, { params })
}

export async function createFertilizerLog(fieldId, data) {
  if (isMock) return mockService.createFertilizerLog(fieldId, data)
  return api.post(`/fields/${fieldId}/fertilizer-logs`, data)
}

// 7. Weather
export async function getFieldWeather(fieldId) {
  if (isMock) return mockService.getFieldWeather(fieldId)
  return api.get(`/fields/${fieldId}/weather`)
}

// 8. Recommendations
export async function createRecommendation(fieldId, payload) {
  if (isMock) return mockService.createRecommendation(fieldId, payload)
  return api.post(`/fields/${fieldId}/recommendations`, payload)
}

export async function getRecommendations(fieldId, params = {}) {
  if (isMock) return mockService.getRecommendations(fieldId, params)
  return api.get(`/fields/${fieldId}/recommendations`, { params })
}

export async function getRecommendationById(id) {
  if (isMock) return mockService.getRecommendationById(id)
  return api.get(`/recommendations/${id}`)
}

// 9. Risk Check (Farmer's custom dose)
export async function checkRisk(fieldId, data) {
  if (isMock) return mockService.checkRisk(fieldId, data)
  return api.post(`/fields/${fieldId}/risk-check`, data)
}

// 10. Trends
export async function getFieldTrends(fieldId) {
  if (isMock) return mockService.getFieldTrends(fieldId)
  return api.get(`/fields/${fieldId}/trends`)
}

import { cacheReferenceList, getCachedReferenceList } from '../utils/offlineCache.js'

// 11. Reference Tables with Offline-Friendly Cache (PRD Feature 15)
export async function getReferenceCrops() {
  if (isMock) {
    const data = await mockService.getReferenceCrops()
    cacheReferenceList('crops', data)
    return data
  }
  try {
    const res = await api.get('/reference/crops')
    cacheReferenceList('crops', res.data || res)
    return res.data || res
  } catch (err) {
    const cached = getCachedReferenceList('crops')
    if (cached?.data) return cached.data
    throw err
  }
}

export async function getReferenceSoilRatings() {
  if (isMock) {
    const data = await mockService.getReferenceSoilRatings()
    cacheReferenceList('soilRatings', data)
    return data
  }
  try {
    const res = await api.get('/reference/soil-ratings')
    cacheReferenceList('soilRatings', res.data || res)
    return res.data || res
  } catch (err) {
    const cached = getCachedReferenceList('soilRatings')
    if (cached?.data) return cached.data
    throw err
  }
}

export async function getReferenceFertilizers() {
  if (isMock) {
    const data = await mockService.getReferenceFertilizers()
    cacheReferenceList('fertilizers', data)
    return data
  }
  try {
    const res = await api.get('/reference/fertilizers')
    cacheReferenceList('fertilizers', res.data || res)
    return res.data || res
  } catch (err) {
    const cached = getCachedReferenceList('fertilizers')
    if (cached?.data) return cached.data
    throw err
  }
}
