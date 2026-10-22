import { matchLogsToLines } from './schedule.js'

/**
 * Builds the single purchase slip for every field: what still has to be bought, field by field, then
 * the combined totals per product and the bill.
 *
 *  - Only plan lines that are not yet logged as applied are included.
 *  - Quantities are per acre in the plan; totals multiply by the field's area. A field with no area
 *    set cannot be totalled and is flagged instead of guessed.
 *  - Prices come from the reference fertilizer list. A product with no price is left out of the money
 *    totals and named, never given an invented price.
 *
 * @param plots        [{ field }]
 * @param statusByField { [fieldId]: { recommendation, logs } }
 * @param fertilizers  [{ id, name, price_inr_per_kg, price_date, bag_size_kg }]
 * @param nameOf       (fertilizerId) => display name, used when a product is missing from the list
 */
export function buildAllFieldsSlip({ plots, statusByField, fertilizers, nameOf = (id) => id }) {
  const ref = Object.fromEntries((fertilizers || []).map((f) => [f.id, f]))
  const productTotals = new Map()
  const fields = []

  for (const { field } of plots) {
    const status = statusByField[field.id]
    const rec = status?.recommendation
    if (!rec) continue
    const matches = matchLogsToLines(rec, status.logs || [])
    const acres = field.areaAcres > 0 ? field.areaAcres : null

    const rows = (rec.schedule || [])
      .map((line, i) => ({ line, applied: Boolean(matches[i]) }))
      .filter((x) => !x.applied)
      .map(({ line }) => {
        const product = ref[line.fertilizer_type]
        const totalKg = acres ? line.quantity_kg_per_acre * acres : null
        return {
          stage: line.stage,
          applyBy: line.apply_by || null,
          timingNote: line.timing_note || null,
          productId: line.fertilizer_type,
          product: product?.name || nameOf(line.fertilizer_type),
          perAcre: line.quantity_kg_per_acre,
          totalKg,
          bags: totalKg != null && product?.bag_size_kg ? totalKg / product.bag_size_kg : null,
          amount: totalKg != null && product?.price_inr_per_kg != null ? totalKg * product.price_inr_per_kg : null,
        }
      })
    if (!rows.length) continue

    for (const r of rows) {
      if (r.totalKg == null) continue
      const entry = productTotals.get(r.productId) || { id: r.productId, name: r.product, totalKg: 0, byField: new Map() }
      entry.totalKg += r.totalKg
      entry.byField.set(field.name, (entry.byField.get(field.name) || 0) + r.totalKg)
      productTotals.set(r.productId, entry)
    }

    fields.push({
      field,
      acres,
      rows,
      missingArea: acres == null,
      subtotalKg: rows.reduce((n, r) => n + (r.totalKg || 0), 0),
      subtotalAmount: rows.every((r) => r.amount != null) ? rows.reduce((n, r) => n + r.amount, 0) : null,
      pricedAmount: rows.reduce((n, r) => n + (r.amount || 0), 0),
    })
  }

  const products = [...productTotals.values()]
    .map((p) => {
      const info = ref[p.id]
      const rate = info?.price_inr_per_kg ?? null
      return {
        id: p.id,
        name: p.name,
        totalKg: p.totalKg,
        bagSizeKg: info?.bag_size_kg ?? null,
        bags: info?.bag_size_kg ? Math.ceil(p.totalKg / info.bag_size_kg) : null,
        rate,
        priceDate: info?.price_date ?? null,
        amount: rate != null ? p.totalKg * rate : null,
        byField: [...p.byField.entries()].map(([name, kg]) => ({ name, kg })),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    fields,
    products,
    grandTotal: products.reduce((n, p) => n + (p.amount || 0), 0),
    unpriced: products.filter((p) => p.amount == null).map((p) => p.name),
    fieldsMissingArea: fields.filter((f) => f.missingArea).map((f) => f.field.name),
  }
}
