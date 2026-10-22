import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import * as endpoints from '../services/endpoints.js'
import { useUserStore } from '../store/useUserStore.js'
import { usePlotStore } from '../store/usePlotStore.js'
import { useFieldStatusStore } from '../store/useFieldStatusStore.js'
import { buildAllFieldsSlip } from '../utils/slip.js'
import { formatDate, titleCase, roundQty } from '../utils/format.js'
import { BRAND } from '../components/brand/brand.js'

const rupees = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

/**
 * One purchase slip for every field: what still has to be bought, field by field for a quick look,
 * then the combined totals per product and the bill at the end. Opens the print dialog by itself when
 * reached from the Schedule page's "Print all fields" button (?print=1).
 */
export default function ScheduleAll() {
  useDocumentTitle(`Purchase slip, all fields — ${BRAND.name}`)
  const [params] = useSearchParams()
  const user = useUserStore((s) => s.user)
  const { plots, loadPlots } = usePlotStore()
  const byField = useFieldStatusStore((s) => s.byField)
  const statusKey = useFieldStatusStore((s) => s.key)
  const [fertilizers, setFertilizers] = useState(null)
  const [fertError, setFertError] = useState(false)
  const printed = useRef(false)

  useEffect(() => {
    loadPlots()
    endpoints.getReferenceFertilizers().then(setFertilizers).catch(() => setFertError(true))
  }, [loadPlots])

  const ready = Boolean(statusKey) && plots.length > 0 && fertilizers !== null
  const slip = useMemo(
    () => (ready ? buildAllFieldsSlip({ plots, statusByField: byField, fertilizers }) : null),
    [ready, plots, byField, fertilizers],
  )

  // From the Schedule page's print button: open the print dialog once the slip is on screen.
  useEffect(() => {
    if (slip && slip.fields.length > 0 && params.get('print') === '1' && !printed.current) {
      const t = setTimeout(() => {
        printed.current = true
        window.print()
      }, 400)
      return () => clearTimeout(t)
    }
    return undefined
  }, [slip, params])

  const today = formatDate(new Date())

  return (
    <div className="max-w-4xl mx-auto">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <Link to={plots[0] ? `/fields/${plots[0].field.id}/schedule` : '/overview'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline min-h-touch">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to schedule
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!slip || slip.fields.length === 0}
          className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium shadow-md cursor-pointer"
        >
          <Printer className="w-4 h-4" aria-hidden="true" /> Print slip
        </button>
      </div>

      {fertError && (
        <p role="alert" className="no-print mb-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text px-4 py-3 text-sm">
          The fertilizer price list could not be loaded, so the bill cannot be worked out. Try again in a moment.
        </p>
      )}

      {!slip && !fertError && (
        <div className="space-y-4 animate-pulse" aria-hidden="true">
          <div className="h-24 bg-white/70 rounded-lg border border-border-default" />
          <div className="h-64 bg-white/70 rounded-lg border border-border-default" />
        </div>
      )}

      {slip && slip.fields.length === 0 && (
        <div className="bg-white rounded-lg border border-border-default shadow-sm p-10 text-center space-y-2">
          <h1 className="text-xl font-semibold text-ink-primary">Nothing to buy right now</h1>
          <p className="text-sm text-ink-secondary">Every dose in every field&rsquo;s plan is logged as applied, or no field has a plan yet.</p>
        </div>
      )}

      {slip && slip.fields.length > 0 && (
        <article className="bg-white rounded-lg border border-border-default shadow-md p-6 sm:p-10 print:shadow-none print:border-0 print:p-0 text-ink-primary">
          <header className="pb-4 border-b-2 border-ink-primary flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary-700">{BRAND.name}</p>
              <h1 className="text-2xl font-bold">Fertilizer purchase slip, all fields</h1>
            </div>
            <dl className="text-sm text-right">
              <div><dt className="inline text-ink-muted">Farmer: </dt><dd className="inline font-semibold">{user?.name || '-'}</dd></div>
              <div><dt className="inline text-ink-muted">Date: </dt><dd className="inline font-semibold">{today}</dd></div>
              <div><dt className="inline text-ink-muted">Fields on this slip: </dt><dd className="inline font-semibold">{slip.fields.length}</dd></div>
            </dl>
          </header>

          <section aria-labelledby="by-field" className="mt-6">
            <h2 id="by-field" className="text-lg font-bold">1. What each field needs</h2>
            <div className="mt-3 space-y-5">
              {slip.fields.map((f) => (
                <section key={f.field.id} className="border border-border-strong rounded-md overflow-hidden break-inside-avoid">
                  <h3 className="bg-bg-muted px-4 py-2 font-semibold flex flex-wrap justify-between gap-2">
                    <span>{f.field.name}{f.field.cropType ? ` · ${titleCase(f.field.cropType)}` : ''}</span>
                    <span className="font-normal text-sm">{f.acres ? `${f.acres} acres` : 'Area not set'}</span>
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-muted border-b border-border-default">
                        <th scope="col" className="px-4 py-2 font-semibold">Stage</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Apply by</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Product</th>
                        <th scope="col" className="px-2 py-2 font-semibold text-right">kg/acre</th>
                        <th scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">Total kg</th>
                        <th scope="col" className="px-4 py-2 font-semibold text-right">Bags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.rows.map((r, i) => (
                        <tr key={`${r.productId}-${i}`} className="border-b border-border-subtle last:border-0">
                          <td className="px-4 py-2">{titleCase(r.stage)}</td>
                          <td className="px-2 py-2">{r.applyBy ? formatDate(r.applyBy) : r.timingNote || '-'}</td>
                          <td className="px-2 py-2 font-medium">{r.product}</td>
                          <td className="px-2 py-2 text-right">{roundQty(r.perAcre)}</td>
                          <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">{r.totalKg != null ? roundQty(r.totalKg) : '-'}</td>
                          <td className="px-4 py-2 text-right">{r.bags != null ? r.bags.toFixed(1) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-bg-subtle font-semibold">
                        <td className="px-4 py-2" colSpan={4}>Field total</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{roundQty(f.subtotalKg)} kg</td>
                        <td className="px-4 py-2 text-right">{f.subtotalAmount != null ? rupees(f.subtotalAmount) : f.pricedAmount ? `${rupees(f.pricedAmount)}+` : '-'}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {f.missingArea && <p className="px-4 py-2 text-xs text-risk-high-text">Set this field&rsquo;s area to get totals; only per-acre amounts are known.</p>}
                </section>
              ))}
            </div>
          </section>

          <section aria-labelledby="bill" className="mt-8 break-inside-avoid">
            <h2 id="bill" className="text-lg font-bold">2. Bill: total to buy, all fields together</h2>
            <table className="mt-3 w-full text-sm border border-border-strong">
              <thead>
                <tr className="bg-bg-muted text-left text-xs uppercase tracking-wide">
                  <th scope="col" className="px-4 py-2 font-semibold">Product</th>
                  <th scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">Total kg</th>
                  <th scope="col" className="px-2 py-2 font-semibold text-right">Bags to buy</th>
                  <th scope="col" className="px-2 py-2 font-semibold text-right">Rate per kg</th>
                  <th scope="col" className="px-4 py-2 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.products.map((p) => (
                  <tr key={p.id} className="border-t border-border-default align-top">
                    <td className="px-4 py-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-xs text-ink-muted">{p.byField.map((b) => `${b.name} ${roundQty(b.kg)} kg`).join(' · ')}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">{roundQty(p.totalKg)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{p.bags != null ? `${p.bags} × ${p.bagSizeKg} kg` : '-'}</td>
                    <td className="px-2 py-2 text-right">{p.rate != null ? `₹${p.rate}` : 'no price'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{p.amount != null ? rupees(p.amount) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-primary bg-bg-subtle text-base font-bold">
                  <td className="px-4 py-3" colSpan={4}>Grand total{slip.unpriced.length ? ' (priced items only)' : ''}</td>
                  <td className="px-4 py-3 text-right">{rupees(slip.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <h3 className="mt-5 text-sm font-semibold">By field</h3>
            <ul className="mt-1 text-sm divide-y divide-border-subtle border border-border-default">
              {slip.fields.map((f) => (
                <li key={f.field.id} className="px-4 py-1.5 flex justify-between gap-3">
                  <span>{f.field.name}</span>
                  <span className="font-semibold">{f.subtotalAmount != null ? rupees(f.subtotalAmount) : f.pricedAmount ? `${rupees(f.pricedAmount)}+` : '-'}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 text-xs text-ink-muted space-y-1">
              {slip.unpriced.length > 0 && <p>No price is on file for {slip.unpriced.join(', ')}, so it is not in the totals. Ask your dealer for the rate.</p>}
              {slip.fieldsMissingArea.length > 0 && <p>Area is not set for {slip.fieldsMissingArea.join(', ')}, so those fields are missing from the totals.</p>}
              <p>Rates are the reference prices on file{slip.products.find((p) => p.priceDate)?.priceDate ? ` (dated ${formatDate(slip.products.find((p) => p.priceDate).priceDate)})` : ''} and may differ at the shop. Bags are rounded up. Doses come from published PAU tables adjusted by each field&rsquo;s soil test; confirm final rates with your local agriculture officer.</p>
            </div>
          </section>
        </article>
      )}
    </div>
  )
}
