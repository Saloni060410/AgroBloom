import { mockData } from './data.js'

// Helper to simulate short network latency
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockService = {
  // Auth
  async register({ email, password, name, role = 'FARMER' }) {
    await delay()
    const existing = mockData.users.find(
      (u) => u.email.toLowerCase() === (email || '').toLowerCase(),
    )
    if (existing) {
      const err = new Error('An account with this email address already exists.')
      err.response = {
        status: 409,
        data: { error: 'An account with this email address already exists.' },
      }
      throw err
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email,
      name,
      role,
      passwordHash: password ? 'mock-bcrypt-hash' : null,
      createdAt: new Date().toISOString(),
    }
    mockData.users.push(newUser)
    return {
      user: newUser,
      accessToken: `mock-token-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
    }
  },

  async login({ email, password }) {
    await delay()
    const user = mockData.users.find(
      (u) => u.email.toLowerCase() === (email || '').toLowerCase(),
    )

    // Check invalid credentials per C3 contract (401: "Invalid email or password")
    if (!user || (password && password === 'wrongpassword')) {
      const err = new Error('Invalid email or password')
      err.response = {
        status: 401,
        data: { error: 'Invalid email or password' },
      }
      throw err
    }

    return {
      user,
      accessToken: `mock-token-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
    }
  },

  async refresh({ refreshToken }) {
    await delay(50)
    return {
      accessToken: `mock-token-rotated-${Date.now()}`,
      refreshToken: refreshToken ? `mock-refresh-rotated-${Date.now()}` : 'new-refresh-token',
    }
  },

  async logout() {
    await delay(50)
    return null
  },

  async getMe() {
    await delay()
    return mockData.users[0]
  },

  // Farms
  async getFarms({ page = 1, limit = 20 } = {}) {
    await delay()
    return {
      items: [...mockData.farms],
      page,
      limit,
      total: mockData.farms.length,
    }
  },

  async createFarm({ name }) {
    await delay()
    if (name === 'FAIL_TEST') {
      const err = new Error('Server error: Failed to create farm')
      err.response = { status: 500, data: { error: 'Server error: Failed to create farm' } }
      throw err
    }
    const newFarm = {
      id: `farm-${Date.now()}`,
      userId: mockData.users[0].id,
      name,
      createdAt: new Date().toISOString(),
      fieldsCount: 0,
    }
    mockData.farms.unshift(newFarm)
    return newFarm
  },

  async getFarmById(farmId) {
    await delay()
    const farm = mockData.farms.find((f) => String(f.id) === String(farmId)) || mockData.farms[0]
    const fields = mockData.fields.filter((f) => String(f.farmId) === String(farmId))
    return {
      ...farm,
      fields,
    }
  },

  async deleteField(fieldId) {
    await delay()
    mockData.fields = mockData.fields.filter((f) => String(f.id) !== String(fieldId))
  },

  async deleteFarm(farmId) {
    await delay()
    if (String(farmId) === 'FAIL_DELETE') {
      const err = new Error('Cannot delete farm: Simulated deletion constraint failure')
      err.response = { status: 400, data: { error: 'Cannot delete farm: Simulated deletion constraint failure' } }
      throw err
    }
    const idx = mockData.farms.findIndex((f) => String(f.id) === String(farmId))
    if (idx !== -1) {
      mockData.farms.splice(idx, 1)
      // Also remove associated fields in mock
      mockData.fields = mockData.fields.filter((f) => String(f.farmId) !== String(farmId))
    }
    return null
  },

  // Fields
  async getFields(farmId, { page = 1, limit = 20 } = {}) {
    await delay()
    const items = farmId
      ? mockData.fields.filter((f) => String(f.farmId) === String(farmId))
      : mockData.fields
    return {
      items,
      page,
      limit,
      total: items.length,
    }
  },

  async createField(farmId, data) {
    await delay()
    if (data.name === 'FAIL_FIELD') {
      const err = new Error('Constraint violation: Could not create field')
      err.response = { status: 500, data: { error: 'Constraint violation: Could not create field' } }
      throw err
    }
    const newField = {
      id: `field-${Date.now()}`,
      farmId,
      name: data.name,
      areaAcres: Number(data.areaAcres) || 1.0,
      latitude: data.latitude ? Number(data.latitude) : null,
      longitude: data.longitude ? Number(data.longitude) : null,
      pincode: data.pincode || null,
      cropType: data.cropType || 'wheat',
      cropVariety: data.cropVariety || null,
      growthStage: data.growthStage || 'sowing',
      sowingDate: data.sowingDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }
    mockData.fields.unshift(newField)

    // Update farm field count
    const parentFarm = mockData.farms.find((f) => String(f.id) === String(farmId))
    if (parentFarm) {
      parentFarm.fieldsCount = (parentFarm.fieldsCount || 0) + 1
    }

    return newField
  },

  async getFieldById(fieldId) {
    await delay()
    const field = mockData.fields.find((f) => String(f.id) === String(fieldId))
    if (!field) {
      // Default to first field if not found or return null
      return mockData.fields[0]
    }
    const latestSoilTest = mockData.soilTests
      .filter((st) => String(st.fieldId) === String(fieldId))
      .slice(-1)[0] || null
    const latestRecommendation = mockData.recommendations
      .filter((r) => String(r.fieldId) === String(fieldId))
      .slice(-1)[0] || null

    return {
      ...field,
      latestSoilTest,
      latestRecommendation,
    }
  },

  async updateField(fieldId, data) {
    await delay()
    if (data.name === 'FAIL_UPDATE') {
      const err = new Error('Failed to update field: Database write failure')
      err.response = { status: 500, data: { error: 'Database write failure' } }
      throw err
    }
    const field = mockData.fields.find((f) => String(f.id) === String(fieldId))
    if (field) {
      Object.assign(field, data)
      return { ...field }
    }
    return { id: fieldId, ...data }
  },

  // Geocoding (Open-Meteo proxy)
  async geocode(query) {
    await delay(100)
    if (!query || !query.trim()) {
      return []
    }

    const q = query.trim().toLowerCase()
    if (q === 'nomatch' || q === 'empty' || q === 'none') {
      return []
    }

    const PLACES = [
      { name: 'Karnal', admin: 'Haryana', latitude: 29.6857, longitude: 76.9905 },
      { name: 'Ludhiana', admin: 'Punjab', latitude: 30.9010, longitude: 75.8573 },
      { name: 'Indore', admin: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
      { name: 'Bathinda', admin: 'Punjab', latitude: 30.2110, longitude: 74.9455 },
      { name: 'Hisar', admin: 'Haryana', latitude: 29.1492, longitude: 75.7217 },
      { name: 'Ambala', admin: 'Haryana', latitude: 30.3782, longitude: 76.7767 },
      { name: 'Meerut', admin: 'Uttar Pradesh', latitude: 28.9845, longitude: 77.7064 },
      { name: 'Aligarh', admin: 'Uttar Pradesh', latitude: 27.8974, longitude: 78.0880 },
      { name: 'Varanasi', admin: 'Uttar Pradesh', latitude: 25.3176, longitude: 82.9739 },
      { name: 'Nashik', admin: 'Maharashtra', latitude: 19.9975, longitude: 73.7898 },
      { name: 'Nagpur', admin: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
      { name: 'Kota', admin: 'Rajasthan', latitude: 25.2138, longitude: 75.8648 },
      { name: 'Guntur', admin: 'Andhra Pradesh', latitude: 16.3067, longitude: 80.4365 },
      { name: 'Patna', admin: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
      { name: 'Bhopal', admin: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
      { name: 'Jaipur', admin: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
    ]

    const matches = PLACES.filter(
      (p) => p.name.toLowerCase().includes(q) || p.admin.toLowerCase().includes(q),
    )

    if (matches.length > 0) {
      return matches
    }

    // If query has at least 3 characters and is not a deliberate negative test, return a plausible match
    if (query.trim().length >= 3) {
      return [
        {
          name: query.trim().charAt(0).toUpperCase() + query.trim().slice(1),
          admin: 'Local District, India',
          latitude: 28.6139,
          longitude: 77.2090,
        },
      ]
    }

    return []
  },

  // Soil Tests
  async getSoilTests(fieldId, { page = 1, limit = 20 } = {}) {
    await delay()
    const items = mockData.soilTests.filter((st) => String(st.fieldId) === String(fieldId))
    return {
      items: items.length > 0 ? items : mockData.soilTests,
      page,
      limit,
      total: items.length || mockData.soilTests.length,
    }
  },

  async createSoilTest(fieldId, data) {
    await delay()
    const newTest = {
      id: `st-${Date.now()}`,
      fieldId,
      n: Number(data.n),
      p: Number(data.p),
      k: Number(data.k),
      ph: Number(data.ph),
      organicCarbon: Number(data.organicCarbon),
      moisture: Number(data.moisture),
      testedOn: data.testedOn || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }
    mockData.soilTests.push(newTest)
    return newTest
  },

  // Fertilizer Logs
  async getFertilizerLogs(fieldId, { page = 1, limit = 20 } = {}) {
    await delay()
    const items = mockData.fertilizerLogs.filter((fl) => String(fl.fieldId) === String(fieldId))
    return {
      items: items.length > 0 ? items : mockData.fertilizerLogs,
      page,
      limit,
      total: items.length || mockData.fertilizerLogs.length,
    }
  },

  async createFertilizerLog(fieldId, data) {
    await delay()
    const newLog = {
      id: `fl-${Date.now()}`,
      fieldId,
      type: data.type,
      quantityKgPerAcre: Number(data.quantityKgPerAcre),
      appliedOn: data.appliedOn || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }
    mockData.fertilizerLogs.push(newLog)
    return newLog
  },

  // Weather
  async getFieldWeather(fieldId) {
    await delay()
    return mockData.weather[fieldId] || mockData.weather['1']
  },

  // Recommendations
  async createRecommendation(fieldId, payload = {}) {
    await delay(350)

    if (fieldId === 'sim-502' || payload.simulate502) {
      const err = new Error('Recommendation service is temporarily unavailable (ML Deficit Engine offline).')
      err.status = 502
      throw err
    }

    const field = mockData.fields.find((f) => String(f.id) === String(fieldId))
    const soilTest = mockData.soilTests.find((st) => String(st.fieldId) === String(fieldId))

    // 409: missing soil test or crop
    if (field && !field.cropType && !payload.cropType) {
      const err = new Error('Field is missing a configured crop type. Please set the crop in the field profile before generating a recommendation.')
      err.status = 409
      err.details = [{ field: 'cropType', message: 'Crop type is missing' }]
      throw err
    }

    if (!soilTest && !payload.soilTestId && fieldId !== '1' && fieldId !== '2' && fieldId !== '3') {
      const err = new Error('Field is missing a recorded soil test. Please record a soil test before requesting a recommendation.')
      err.status = 409
      err.details = [{ field: 'soilTestId', message: 'Soil test is missing' }]
      throw err
    }

    const templateRec = mockData.recommendations.find((r) => String(r.fieldId) === String(fieldId))
    if (templateRec) {
      const newRec = {
        ...templateRec,
        id: `rec-${Date.now()}`,
        createdAt: new Date().toISOString(),
      }
      mockData.recommendations.unshift(newRec)
      return newRec
    }

    const newRec = {
      id: `rec-${Date.now()}`,
      fieldId: String(fieldId),
      soilTestId: soilTest?.id || 'st-001',
      cropType: payload.cropType || field?.cropType || 'wheat',
      cropVariety: payload.cropVariety || field?.cropVariety || 'HD-2967',
      growthStage: payload.growthStage || field?.growthStage || 'vegetative',
      fertilizerType: 'urea',
      quantityKgPerAcre: 86.8,
      schedule: [
        { stage: 'sowing', fertilizerType: 'dap', quantityKgPerAcre: 70.4, applyBy: '2026-11-05' },
        { stage: 'sowing', fertilizerType: 'mop', quantityKgPerAcre: 20.2, applyBy: '2026-11-05' },
        { stage: 'sowing', fertilizerType: 'urea', quantityKgPerAcre: 10.6, applyBy: '2026-11-05' },
        { stage: 'crown_root_initiation', fertilizerType: 'urea', quantityKgPerAcre: 38.1, applyBy: '2026-11-26' },
        { stage: 'jointing', fertilizerType: 'urea', quantityKgPerAcre: 38.1, applyBy: '2026-12-25' },
      ],
      risk: {
        level: 'medium',
        reason: "Last season's fertilizer was about 1.5 times what this crop needs.",
        soilHealthImpact: 'Nitrogen beyond crop demand acidifies soil over time and leaches into groundwater.',
        yieldImpact: 'Extra nitrogen adds cost without adding yield and can make wheat fall over before harvest.',
        overApplicationPct: 32.2,
      },
      topFactors: [
        'Soil nitrogen is low (210 kg/ha), so 130 kg/ha of nitrogen fertilizer is needed after counting what the soil supplies.',
        'Soil phosphorus is low (9 kg/ha), so DAP goes on at sowing.',
        "Your last-season use was about 1.5 times what this crop needs, so this plan is smaller.",
      ],
      nutrientBalance: {
        n: { cropDemandKgHa: 120, soilSupplyKgHa: 55, deficitKgHa: 65, useEfficiency: 0.5, priorCreditKgHa: 0, fertilizerNeededKgHa: 130 },
        p: { cropDemandKgHa: 60, soilSupplyKgHa: 20, deficitKgHa: 40, useEfficiency: 0.5, priorCreditKgHa: 0, fertilizerNeededKgHa: 80 },
        k: { cropDemandKgHa: 40, soilSupplyKgHa: 25, deficitKgHa: 15, useEfficiency: 0.5, priorCreditKgHa: 0, fertilizerNeededKgHa: 30 },
      },
      formula: 'fertilizer needed = (crop demand - soil supply) / use efficiency - credit from recent applications',
      cost: {
        estimatedCostPerAcre: 3100,
        previousCostPerAcre: 3340,
        savingPerAcre: 240,
        savingTotal: 600,
      },
      impact: {
        overApplicationReductionPct: 32.2,
      },
      weatherSource: 'live',
      weatherStale: false,
      modelVersion: 'fixture-0.0.0+rules-fixture',
      createdAt: new Date().toISOString(),
    }
    mockData.recommendations.unshift(newRec)
    return newRec
  },

  async getRecommendations(fieldId, { page = 1, limit = 5 } = {}) {
    await delay()
    const all = mockData.recommendations.filter((r) => String(r.fieldId) === String(fieldId))
    const sorted = [...all].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    const p = Math.max(1, Number(page) || 1)
    const l = Math.max(1, Number(limit) || 5)
    const startIndex = (p - 1) * l
    const items = sorted.slice(startIndex, startIndex + l)
    return {
      items,
      page: p,
      limit: l,
      total: sorted.length,
    }
  },

  async getRecommendationById(recId) {
    await delay()
    return (
      mockData.recommendations.find((r) => String(r.id) === String(recId)) ||
      mockData.recommendations[0]
    )
  },

  // Risk Check (User's own planned dose - PRD FR12)
  async checkRisk(fieldId, { plannedApplication }) {
    await delay(180)

    // 409 Case: No soil test or crop yet (Field 4 simulation)
    if (String(fieldId) === '4') {
      const err = new Error('Field has no soil test recorded yet. Please record a soil test before checking risk.')
      err.response = {
        status: 409,
        data: {
          error: 'Field has no soil test recorded yet. Please record a soil test before checking risk.',
          code: 'PREREQUISITE_MISSING',
        },
      }
      throw err
    }

    // Convert kg/acre to kg/ha (1 acre = 0.4047 ha => 1 kg/acre = 2.471 kg/ha)
    let appliedN = 0
    let appliedP = 0
    let appliedK = 0

    const plans = plannedApplication || []
    plans.forEach((item) => {
      const qAcre = Number(item.quantityKgPerAcre) || 0
      const qHa = qAcre * 2.471
      const type = (item.fertilizerType || '').toLowerCase()

      if (type.includes('urea')) {
        appliedN += qHa * 0.46
      } else if (type.includes('dap')) {
        appliedN += qHa * 0.18
        appliedP += qHa * 0.46
      } else if (type.includes('mop')) {
        appliedK += qHa * 0.60
      } else if (type.includes('npk_10_26_26')) {
        appliedN += qHa * 0.10
        appliedP += qHa * 0.26
        appliedK += qHa * 0.26
      } else if (type.includes('ssp')) {
        appliedP += qHa * 0.16
      }
    })

    const recommendedN = 120
    const recommendedP = 60
    const recommendedK = 40

    const ratioN = recommendedN > 0 ? appliedN / recommendedN : 1
    const ratioP = recommendedP > 0 ? appliedP / recommendedP : 1
    const ratioK = recommendedK > 0 ? appliedK / recommendedK : 1

    let level = 'low'
    let reason = 'Planned fertilizer doses are well-balanced and match crop nutrient uptake demand.'
    let soilHealthImpact = 'Balanced replenishment maintains steady soil microbial activity without residual salt stress.'
    let yieldImpact = 'Optimal nutrient availability supports sturdy vegetative growth and full ear development.'
    let overApplicationPct = null

    if (ratioN > 1.35 || ratioP > 1.45) {
      level = 'high'
      overApplicationPct = Math.round((Math.max(ratioN, ratioP) - 1) * 100)
      reason = `Planned dose exceeds recommended nutrient threshold by ${overApplicationPct}%.`
      soilHealthImpact = 'Excessive soluble nitrogen acidifies topsoil and leaches nitrates into the groundwater.'
      yieldImpact = 'Severe risk of crop lodging, succulent weak stems, and heavy susceptibility to leaf rust and pests.'
    } else if (ratioN > 1.15 || ratioP > 1.2 || ratioN < 0.65) {
      level = 'medium'
      if (ratioN < 0.65) {
        reason = `Planned dose delivers only ${Math.round(ratioN * 100)}% of crop demand, leaving a serious nitrogen deficit.`
        soilHealthImpact = 'Continued under-fertilization mines native soil fertility and reduces organic matter turnover.'
        yieldImpact = 'Crop will exhibit pale foliage, restricted tillering, and stunted biomass development.'
      } else {
        overApplicationPct = Math.round((ratioN - 1) * 100)
        reason = `Planned nitrogen application is ${overApplicationPct}% above the agronomist target.`
        soilHealthImpact = 'Sub-optimal nutrient recovery in topsoil with moderate leaching during heavy irrigation.'
        yieldImpact = 'Extra fertilizer expenditure yields diminishing returns without measurable yield enhancement.'
      }
    }

    return {
      risk: {
        level,
        reason,
        soilHealthImpact,
        yieldImpact,
        overApplicationPct,
      },
      nutrientBalance: {
        n: {
          appliedKgHa: Math.round(appliedN * 10) / 10,
          recommendedKgHa: recommendedN,
          ratio: Math.round(ratioN * 100) / 100,
        },
        p: {
          appliedKgHa: Math.round(appliedP * 10) / 10,
          recommendedKgHa: recommendedP,
          ratio: Math.round(ratioP * 100) / 100,
        },
        k: {
          appliedKgHa: Math.round(appliedK * 10) / 10,
          recommendedKgHa: recommendedK,
          ratio: Math.round(ratioK * 100) / 100,
        },
      },
    }
  },

  // Trends
  async getFieldTrends(fieldId) {
    await delay()
    return mockData.trends[fieldId] || { soilTests: [], applied: [], recommendations: [] }
  },

  // Reference Tables
  async getReferenceCrops() {
    await delay()
    return mockData.reference.crops
  },

  async getReferenceSoilRatings() {
    await delay()
    return mockData.reference.soilRatings
  },

  async getReferenceFertilizers() {
    await delay()
    return mockData.reference.fertilizers
  },
}
