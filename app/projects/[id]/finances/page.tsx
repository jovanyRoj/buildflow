'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useBrivoxStore } from '@/lib/store'
import { useAuthGuard } from '@/lib/useAuthGuard'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const currencyD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
function fmt(n: number | null | undefined)  { return (!n && n !== 0) ? '—' : currency.format(n) }
function fmtD(n: number | null | undefined) { return (!n && n !== 0) ? '—' : currencyD.format(n) }
function pctColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400'
  if (pct >= 20) return 'text-green-600'
  if (pct >= 8)  return 'text-orange-500'
  return 'text-red-600'
}
function pctBg(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 border-gray-200'
  if (pct >= 20) return 'bg-green-50 border-green-200'
  if (pct >= 8)  return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}
const PAY: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  partial: 'bg-yellow-100 text-yellow-700',
  paid:    'bg-green-100 text-green-700',
}

interface Financials {
  id?: string; project_type: 'custom'|'spec'; sold: boolean; sold_at?: string
  sale_price_projected?: number; sale_price_actual?: number
  construction_cost_budget?: number; loan_amount?: number
  loan_interest_rate?: number; loan_start_date?: string; notes?: string
  sqft?: number; construction_cost_per_sqft?: number; sale_price_per_sqft?: number
}
interface Computed {
  interestAccrued: number; dailyInterestCost: number
  totalSubQuoted: number; totalSubApproved: number; totalMaterials: number
  projectedMargin: number
  sqftConstructionCost: number|null; sqftSalePrice: number|null
  sqftMargin: number|null; realMargin: number|null; realMarginPct: number|null
}
interface SubBudget {
  task_id: string; sub_id: string; quoted_amount?: number
  approved_amount?: number; payment_status: string
}

// Returns updated form fields when sqft inputs change (auto-populates budget & sale)
function applyAutoCalc(
  form: Financials,
  changes: Partial<Financials>
): Financials {
  const merged: Financials = { ...form, ...changes }
  const { sqft, construction_cost_per_sqft, sale_price_per_sqft } = merged
  if (sqft && construction_cost_per_sqft) {
    merged.construction_cost_budget = Math.round(sqft * construction_cost_per_sqft)
  }
  if (sqft && sale_price_per_sqft) {
    merged.sale_price_projected = Math.round(sqft * sale_price_per_sqft)
  }
  return merged
}

export default function FinancesPage() {
  const params = useParams()
  const { getProject } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [financials, setFinancials] = useState<Financials|null>(null)
  const [computed,   setComputed]   = useState<Computed|null>(null)
  const [subBudgets, setSubBudgets] = useState<SubBudget[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [editMode,   setEditMode]   = useState(false)
  const [form,       setForm]       = useState<Financials>({ project_type: 'spec', sold: false })

  const load = useCallback(async () => {
    if (!project?.id) return
    setLoading(true)
    const r = await fetch(`/api/builder/projects/${project.id}/financials`)
    const d = await r.json()
    setFinancials(d.financials ?? null)
    setComputed(d.computed ?? null)
    setSubBudgets(d.subBudgets ?? [])
    if (d.financials) setForm(d.financials)
    setLoading(false)
  }, [project?.id])
  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!project) return
    setSaving(true)
    const res = await fetch(`/api/builder/projects/${project.id}/financials`, {
      method: financials?.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[finance save]', err)
    }
    await load(); setSaving(false); setEditMode(false)
  }

  async function markSold() {
    if (!project || !financials) return
    const sp = prompt('Enter final sale price:')
    if (!sp) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/financials`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold: true, sold_at: new Date().toISOString().split('T')[0], sale_price_actual: parseFloat(sp) }),
    })
    await load(); setSaving(false)
  }

  if (!ready) return <Spinner />
  if (!project) return (
    <div className="flex items-center justify-center min-h-screen bg-[#F4F6F9]">
      <div className="text-center text-gray-500">
        <p className="text-4xl mb-3">💰</p>
        <p className="font-semibold text-[#1A2B4A]">Proyecto no encontrado</p>
        <a href="/projects" className="text-blue-600 text-sm mt-2 block">← Volver a proyectos</a>
      </div>
    </div>
  )

  const hasSqft    = !!(financials?.sqft && financials.sqft > 0)
  const rPct       = computed?.realMarginPct ?? null
  // If house is sold, show real sale price; otherwise show projected (sqft × rate or stored value)
  const saleRef    = financials?.sold
    ? (financials?.sale_price_actual ?? null)
    : (computed?.sqftSalePrice ?? financials?.sale_price_projected ?? null)
  const totalCost  = (computed?.totalSubQuoted ?? 0) + (computed?.totalMaterials ?? 0)
  const budgetPct  = financials?.construction_cost_budget
    ? Math.min(100, Math.round(totalCost / financials.construction_cost_budget * 100)) : 0

  // Auto-calc indicators: is the field currently matching the sqft computation?
  const autoBudget = !!(form.sqft && form.construction_cost_per_sqft &&
    form.construction_cost_budget === Math.round(form.sqft * form.construction_cost_per_sqft))
  const autoSale   = !!(form.sqft && form.sale_price_per_sqft &&
    form.sale_price_projected === Math.round(form.sqft * form.sale_price_per_sqft))

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar title="Finances" backHref={`/projects/${project.id}`}
        action={
          <button onClick={() => { setEditMode(!editMode); setForm(financials ?? { project_type: 'spec', sold: false }) }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
            {editMode ? '✕ Cancel' : '✏️ Edit'}
          </button>
        }
      />

      {/* Type + Sold */}
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${financials?.project_type === 'custom' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {financials?.project_type === 'custom' ? '🏠 Custom Home' : '🏗️ Spec Home'}
        </span>
        {financials?.sold
          ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white">✅ SOLD {financials.sold_at ?? ''}</span>
          : financials && <button onClick={markSold} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">Mark as Sold</button>
        }
      </div>

      {loading
        ? <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
        : <div className="px-5 space-y-4 pt-2">

          {financials ? (<>

            {/* ── 1. PROJECT SETUP ─────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📋 Project Setup</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {financials.sqft && (
                  <div>
                    <p className="text-xs text-gray-400">Square Footage</p>
                    <p className="text-sm font-bold text-gray-800">{financials.sqft.toLocaleString()} sqft</p>
                  </div>
                )}
                {financials.construction_cost_per_sqft && (
                  <div>
                    <p className="text-xs text-gray-400">Build Cost / sqft</p>
                    <p className="text-sm font-bold text-orange-600">{fmt(financials.construction_cost_per_sqft)}/sqft</p>
                  </div>
                )}
                {financials.sale_price_per_sqft && (
                  <div>
                    <p className="text-xs text-gray-400">Sale Price / sqft</p>
                    <p className="text-sm font-bold text-blue-600">{fmt(financials.sale_price_per_sqft)}/sqft</p>
                  </div>
                )}
                {financials.construction_cost_budget && (
                  <div>
                    <p className="text-xs text-gray-400">Build Budget</p>
                    <p className="text-sm font-bold text-gray-800">{fmt(financials.construction_cost_budget)}</p>
                  </div>
                )}
                {financials.sale_price_projected && (
                  <div>
                    <p className="text-xs text-gray-400">Projected Sale</p>
                    <p className="text-sm font-bold text-blue-700">{fmt(financials.sale_price_projected)}</p>
                  </div>
                )}
                {financials.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Notes</p>
                    <p className="text-sm text-gray-700">{financials.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. MARKET ANALYSIS ─────────────────────── */}
            {hasSqft && computed && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-blue-500">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📐 Market Analysis — {financials!.sqft?.toLocaleString()} sqft</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                    <p className="text-xs text-gray-400 mb-0.5">Build Cost</p>
                    <p className="text-base font-black text-orange-600">{fmt(computed.sqftConstructionCost)}</p>
                    <p className="text-xs text-orange-400">{fmt(financials!.construction_cost_per_sqft)}/sqft</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-xs text-gray-400 mb-0.5">Sale Price</p>
                    <p className="text-base font-black text-blue-600">{fmt(computed.sqftSalePrice)}</p>
                    <p className="text-xs text-blue-400">{fmt(financials!.sale_price_per_sqft)}/sqft</p>
                  </div>
                  <div className={`text-center p-3 rounded-xl border ${(computed.sqftMargin ?? 0) >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-xs text-gray-400 mb-0.5">Mkt Margin</p>
                    <p className={`text-base font-black ${(computed.sqftMargin ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(computed.sqftMargin)}</p>
                    <p className="text-xs text-gray-400">area rates</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── 3. REAL P&L ────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">💡 Real P&L — Based on Actual Sub Quotes</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"/>
                    <span className="text-xs font-semibold text-gray-600">Projected Sale Price</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{fmt(saleRef)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"/>
                    <span className="text-xs font-semibold text-gray-600">Sub Labor Estimates</span>
                    <span className="text-xs text-gray-400">({subBudgets.length} subs)</span>
                  </div>
                  <span className="text-sm font-bold text-red-600">−{fmt(computed?.totalSubQuoted)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400"/>
                    <span className="text-xs font-semibold text-gray-600">Materials</span>
                  </div>
                  <span className="text-sm font-bold text-red-500">−{fmt(computed?.totalMaterials)}</span>
                </div>
                {(computed?.interestAccrued ?? 0) > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-400"/>
                      <span className="text-xs font-semibold text-gray-600">Loan Interest</span>
                    </div>
                    <span className="text-sm font-bold text-orange-500">−{fmt(computed?.interestAccrued)}</span>
                  </div>
                )}
                <div className={`flex items-center justify-between rounded-xl p-3 border mt-1 ${pctBg(rPct)}`}>
                  <div>
                    <p className="text-xs font-bold text-gray-600">NET PROFIT / LOSS</p>
                    {rPct !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${rPct >= 20 ? 'bg-green-200 text-green-800' : rPct >= 8 ? 'bg-orange-200 text-orange-800' : 'bg-red-200 text-red-800'}`}>
                        {rPct >= 20 ? '✅ Buena ganancia' : rPct >= 8 ? '⚠️ Margen de riesgo' : '🔴 Pérdida / riesgo alto'}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${pctColor(rPct)}`}>{fmt(computed?.realMargin)}</p>
                    {rPct !== null && <p className={`text-sm font-bold ${pctColor(rPct)}`}>{rPct.toFixed(1)}%</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 4. SUB ESTIMATES ──────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">👷 Sub Estimates</p>
                <span className="text-xs font-bold text-gray-700">{fmt(computed?.totalSubQuoted)} total</span>
              </div>
              {subBudgets.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No sub estimates received yet</p>
              ) : (
                <div className="space-y-2">
                  {subBudgets.map((sb, i) => {
                    const isPaid    = sb.payment_status === 'paid'
                    const isPartial = sb.payment_status === 'partial'
                    return (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${isPaid ? 'bg-green-50 border-green-100' : isPartial ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">Task #{sb.task_id.slice(-4)}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY[sb.payment_status] ?? PAY.pending}`}>{sb.payment_status}</span>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${isPaid ? 'text-green-600' : 'text-gray-800'}`}>{fmt(sb.quoted_amount)}</p>
                          {sb.approved_amount && <p className="text-xs text-green-600">✓ {fmt(sb.approved_amount)}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {financials.construction_cost_budget && (
                <div className="mt-4 pt-3 border-t border-gray-50">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Committed vs Budget</span>
                    <span className={budgetPct > 90 ? 'text-red-600 font-bold' : budgetPct > 70 ? 'text-orange-500 font-bold' : 'text-green-600 font-bold'}>{budgetPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${budgetPct}%` }}/>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{fmt(totalCost)}</span><span>of {fmt(financials.construction_cost_budget)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── 5. LOAN ────────────────────────────────── */}
            {financials.loan_amount && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-orange-400">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">🏦 Construction Loan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-gray-400">Loan Amount</p><p className="text-sm font-bold text-gray-800">{fmt(financials.loan_amount)}</p></div>
                  <div><p className="text-xs text-gray-400">Annual Rate</p><p className="text-sm font-bold text-gray-800">{financials.loan_interest_rate ? `${(financials.loan_interest_rate * 100).toFixed(2)}%` : '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Daily Cost</p><p className="text-sm font-bold text-orange-600">{fmtD(computed?.dailyInterestCost)}/day</p></div>
                  <div><p className="text-xs text-gray-400">Interest Accrued</p><p className="text-sm font-bold text-red-600">{fmt(computed?.interestAccrued)}</p></div>
                </div>
                {financials.loan_start_date && <p className="text-xs text-gray-400 mt-2">Since {financials.loan_start_date}</p>}
              </div>
            )}

          </>) : (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <p className="text-4xl mb-3">💰</p>
              <p className="text-gray-800 font-semibold mb-1">No financial data yet</p>
              <p className="text-gray-400 text-sm mb-4">Agrega sqft, tasas del área y préstamo para que KORVIA calcule el margen real.</p>
              <button onClick={() => setEditMode(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">Configurar Finanzas</button>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/projects/${project.id}/quote`} className="bg-white rounded-2xl p-4 shadow-sm text-center hover:bg-gray-50">
              <p className="text-2xl mb-1">📋</p><p className="text-sm font-semibold text-gray-700">Project Quote</p><p className="text-xs text-gray-400">Phases & estimates</p>
            </Link>
            <Link href={`/projects/${project.id}/materials`} className="bg-white rounded-2xl p-4 shadow-sm text-center hover:bg-gray-50">
              <p className="text-2xl mb-1">🪵</p><p className="text-sm font-semibold text-gray-700">Materials</p><p className="text-xs text-gray-400">Lumber, appliances, fixtures</p>
            </Link>
          </div>
        </div>
      }

      {/* ── EDIT MODAL ─────────────────────────────────────────────── */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">✏️ Editar Finanzas</h3>
            <div className="space-y-4">

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tipo de Proyecto</label>
                <div className="flex gap-2">
                  {(['spec','custom'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, project_type: t }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${form.project_type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {t === 'spec' ? '🏗️ Spec' : '🏠 Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── SQFT ANALYSIS ── */}
              <div className="border border-blue-100 rounded-2xl p-4 bg-blue-50/40">
                <p className="text-xs font-bold text-blue-600 mb-1">📐 ANÁLISIS SQFT — KORVIA</p>
                <p className="text-xs text-blue-400 mb-3">KORVIA calculará y guardará el presupuesto y precio de venta automáticamente</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Pies Cuadrados (sqft)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
                      placeholder="ej. 2400" value={form.sqft ?? ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || undefined
                        setForm(f => applyAutoCalc(f, { sqft: v }))
                      }}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Costo Construcción / sqft ($)</label>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
                        placeholder="225" step="0.01" value={form.construction_cost_per_sqft ?? ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || undefined
                          setForm(f => applyAutoCalc(f, { construction_cost_per_sqft: v }))
                        }}/>
                      <p className="text-xs text-gray-400 mt-0.5">tasa del área</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Precio Venta / sqft ($)</label>
                      <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm"
                        placeholder="350" step="0.01" value={form.sale_price_per_sqft ?? ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || undefined
                          setForm(f => applyAutoCalc(f, { sale_price_per_sqft: v }))
                        }}/>
                      <p className="text-xs text-gray-400 mt-0.5">tasa del área</p>
                    </div>
                  </div>
                  {/* Live preview */}
                  {form.sqft && form.construction_cost_per_sqft && form.sale_price_per_sqft && (() => {
                    const b = form.sqft! * form.construction_cost_per_sqft!
                    const s = form.sqft! * form.sale_price_per_sqft!
                    const m = s - b; const p = (m / s * 100)
                    return (
                      <div className={`rounded-xl p-3 border ${p >= 20 ? 'bg-green-50 border-green-200' : p >= 8 ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-orange-600">Build: {fmt(b)}</span>
                          <span className="text-blue-600">Sale: {fmt(s)}</span>
                          <span className={p >= 20 ? 'text-green-600' : p >= 8 ? 'text-orange-600' : 'text-red-600'}>{m > 0 ? '+' : ''}{fmt(m)} ({p.toFixed(0)}%)</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Budget — auto-populated from sqft */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
                  Presupuesto Total de Construcción ($)
                  {autoBudget && <span className="text-xs font-normal px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">⚡ auto KORVIA</span>}
                </label>
                <input type="number" className={`w-full px-3 py-2.5 rounded-xl border text-sm ${autoBudget ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
                  placeholder="860000" value={form.construction_cost_budget ?? ''}
                  onChange={e => setForm(f => ({ ...f, construction_cost_budget: parseFloat(e.target.value) || undefined }))}/>
                {autoBudget && <p className="text-xs text-blue-400 mt-0.5">Calculado: {form.sqft?.toLocaleString()} sqft × {fmt(form.construction_cost_per_sqft)}/sqft. Puedes editarlo.</p>}
              </div>

              {/* Sale price — auto-populated from sqft */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
                  Precio de Venta Proyectado ($)
                  {autoSale && <span className="text-xs font-normal px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">⚡ auto KORVIA</span>}
                </label>
                <input type="number" className={`w-full px-3 py-2.5 rounded-xl border text-sm ${autoSale ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
                  placeholder="1000000" value={form.sale_price_projected ?? ''}
                  onChange={e => setForm(f => ({ ...f, sale_price_projected: parseFloat(e.target.value) || undefined }))}/>
                {autoSale && <p className="text-xs text-blue-400 mt-0.5">Calculado: {form.sqft?.toLocaleString()} sqft × {fmt(form.sale_price_per_sqft)}/sqft. Puedes editarlo.</p>}
              </div>

              {/* Loan */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 mb-3">🏦 PRÉSTAMO DE CONSTRUCCIÓN</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Monto del Préstamo ($)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                      placeholder="100000" value={form.loan_amount ?? ''}
                      onChange={e => setForm(f => ({ ...f, loan_amount: parseFloat(e.target.value) || undefined }))}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tasa Anual (%)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                      placeholder="7.00" step="0.01"
                      value={form.loan_interest_rate ? (form.loan_interest_rate * 100).toFixed(2) : ''}
                      onChange={e => setForm(f => ({ ...f, loan_interest_rate: parseFloat(e.target.value) / 100 || undefined }))}/>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Fecha de Inicio del Préstamo</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.loan_start_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, loan_start_date: e.target.value }))}/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notas (opcional)</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditMode(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
