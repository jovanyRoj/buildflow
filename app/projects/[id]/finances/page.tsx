'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useBrivoxStore } from '@/lib/store'
import { useAuthGuard } from '@/lib/useAuthGuard'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}

function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function fmtD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  partial: 'bg-yellow-100 text-yellow-700',
  paid:    'bg-green-100 text-green-700',
}

interface Financials {
  id?: string
  project_type: 'custom' | 'spec'
  sold: boolean
  sold_at?: string
  sale_price_projected?: number
  sale_price_actual?: number
  construction_cost_budget?: number
  loan_amount?: number
  loan_interest_rate?: number
  loan_start_date?: string
  notes?: string
}

interface Computed {
  interestAccrued: number
  dailyInterestCost: number
  totalSubQuoted: number
  totalSubApproved: number
  totalMaterials: number
  projectedMargin: number
}

interface SubBudget {
  task_id: string; sub_id: string; quoted_amount?: number
  approved_amount?: number; payment_status: string; builder_notes?: string
}

export default function FinancesPage() {
  const params = useParams()
  const router = useRouter()
  const { getProject } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [financials, setFinancials] = useState<Financials | null>(null)
  const [computed, setComputed]     = useState<Computed | null>(null)
  const [subBudgets, setSubBudgets] = useState<SubBudget[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [editMode, setEditMode]     = useState(false)
  const [form, setForm]             = useState<Financials>({
    project_type: 'spec', sold: false,
  })
  const [showSold, setShowSold] = useState(false)

  const load = useCallback(async () => {
    if (!project?.id) return
    setLoading(true)
    const res = await fetch(`/api/builder/projects/${project.id}/financials`)
    const d = await res.json()
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
    const method = financials?.id ? 'PATCH' : 'POST'
    await fetch(`/api/builder/projects/${project.id}/financials`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    await load()
    setSaving(false); setEditMode(false)
  }

  async function markSold() {
    if (!project || !financials) return
    const salePrice = prompt('Enter final sale price:')
    if (!salePrice) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/financials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sold: true,
        sold_at: new Date().toISOString().split('T')[0],
        sale_price_actual: parseFloat(salePrice),
      }),
    })
    await load(); setSaving(false)
  }

  if (!ready || !project) return <Spinner />

  const marginColor = computed && computed.projectedMargin > 0
    ? 'text-green-600' : 'text-red-600'

  const totalCost = (computed?.totalSubQuoted ?? 0) + (computed?.totalMaterials ?? 0)
  const budgetUsedPct = financials?.construction_cost_budget
    ? Math.min(100, Math.round(totalCost / financials.construction_cost_budget * 100))
    : 0

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Finances"
        backHref={`/projects/${project.id}`}
        action={
          <button
            onClick={() => { setEditMode(!editMode); setForm(financials ?? { project_type: 'spec', sold: false }) }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl"
          >
            {editMode ? '✕ Cancel' : '✏️ Edit'}
          </button>
        }
      />

      {/* Project type badge */}
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${financials?.project_type === 'custom' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {financials?.project_type === 'custom' ? '🏠 Custom Home' : '🏗️ Spec Home'}
        </span>
        {financials?.sold
          ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white">✅ SOLD {financials.sold_at ?? ''}</span>
          : <button onClick={markSold} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 hover:bg-gray-200">Mark as Sold</button>
        }
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="px-5 space-y-4 pt-2">

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 font-medium mb-1">Build Cost</p>
              <p className="text-lg font-bold text-gray-900">{fmt(financials?.construction_cost_budget)}</p>
              <p className="text-xs text-gray-400 mt-1">budget</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 font-medium mb-1">Sale Price</p>
              <p className="text-lg font-bold text-gray-900">{fmt(financials?.sale_price_projected)}</p>
              <p className="text-xs text-gray-400 mt-1">{financials?.sold ? 'actual' : 'projected'}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 font-medium mb-1">Margin</p>
              <p className={`text-lg font-bold ${marginColor}`}>{fmt(computed?.projectedMargin)}</p>
              <p className="text-xs text-gray-400 mt-1">after interest</p>
            </div>
          </div>

          {/* Budget progress */}
          {financials?.construction_cost_budget && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700">Budget Used</span>
                <span className="text-sm font-bold text-gray-900">{budgetUsedPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${budgetUsedPct > 90 ? 'bg-red-500' : budgetUsedPct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${budgetUsedPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>Committed: {fmt(totalCost)}</span>
                <span>Budget: {fmt(financials.construction_cost_budget)}</span>
              </div>
              <div className="flex gap-4 mt-3 text-xs">
                <div><span className="text-gray-400">Sub Labor: </span><span className="font-semibold">{fmt(computed?.totalSubQuoted)}</span></div>
                <div><span className="text-gray-400">Materials: </span><span className="font-semibold">{fmt(computed?.totalMaterials)}</span></div>
              </div>
            </div>
          )}

          {/* Loan widget */}
          {financials?.loan_amount && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-amber-400">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🏦</span>
                <span className="text-sm font-bold text-gray-800">Construction Loan</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Loan Amount</p>
                  <p className="font-bold text-gray-900">{fmt(financials.loan_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Annual Rate</p>
                  <p className="font-bold text-gray-900">{financials.loan_interest_rate ? `${(financials.loan_interest_rate * 100).toFixed(2)}%` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Daily Cost</p>
                  <p className="font-bold text-amber-600">{computed ? fmtD(computed.dailyInterestCost) : '—'}/day</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Interest Accrued</p>
                  <p className="font-bold text-red-600">{computed ? fmt(computed.interestAccrued) : '—'}</p>
                </div>
              </div>
              {financials.loan_start_date && (
                <p className="text-xs text-gray-400 mt-2">Started {financials.loan_start_date} · Every day of delay costs {computed ? fmtD(computed.dailyInterestCost) : '—'}</p>
              )}
            </div>
          )}

          {/* Sub budgets table */}
          {subBudgets.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-800 mb-3">Sub Budgets</p>
              <div className="space-y-2">
                {subBudgets.map((sb, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-gray-700">Task #{sb.task_id.slice(-4)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_COLORS[sb.payment_status]}`}>
                        {sb.payment_status}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(sb.quoted_amount)}</p>
                      {sb.approved_amount && <p className="text-xs text-green-600">approved: {fmt(sb.approved_amount)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No financials yet */}
          {!financials && !editMode && (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <p className="text-3xl mb-3">💰</p>
              <p className="text-gray-800 font-semibold mb-1">No financial data yet</p>
              <p className="text-gray-400 text-sm mb-4">Add your budget, sale price, and loan details to track your margin in real time.</p>
              <button onClick={() => setEditMode(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
                Set Up Financials
              </button>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/projects/${project.id}/quote`}
              className="bg-white rounded-2xl p-4 shadow-sm text-center hover:bg-gray-50">
              <p className="text-2xl mb-1">📋</p>
              <p className="text-sm font-semibold text-gray-700">Project Quote</p>
              <p className="text-xs text-gray-400">Phases & estimates</p>
            </Link>
            <Link href={`/projects/${project.id}/materials`}
              className="bg-white rounded-2xl p-4 shadow-sm text-center hover:bg-gray-50">
              <p className="text-2xl mb-1">🪵</p>
              <p className="text-sm font-semibold text-gray-700">Materials</p>
              <p className="text-xs text-gray-400">Lumber, appliances, fixtures</p>
            </Link>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">Project Financials</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Project Type</label>
                <div className="flex gap-2">
                  {(['spec','custom'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, project_type: t }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${form.project_type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {t === 'spec' ? '🏗️ Spec' : '🏠 Custom'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Total Build Budget ($)</label>
                <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="860000" value={form.construction_cost_budget ?? ''}
                  onChange={e => setForm(f => ({ ...f, construction_cost_budget: parseFloat(e.target.value) || undefined }))}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Sale Price (Projected) ($)</label>
                <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="1000000" value={form.sale_price_projected ?? ''}
                  onChange={e => setForm(f => ({ ...f, sale_price_projected: parseFloat(e.target.value) || undefined }))}/>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-500 mb-3">🏦 CONSTRUCTION LOAN</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Loan Amount ($)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                      placeholder="100000" value={form.loan_amount ?? ''}
                      onChange={e => setForm(f => ({ ...f, loan_amount: parseFloat(e.target.value) || undefined }))}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Annual Rate (%)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                      placeholder="7.00" step="0.01" value={form.loan_interest_rate ? (form.loan_interest_rate * 100).toFixed(2) : ''}
                      onChange={e => setForm(f => ({ ...f, loan_interest_rate: parseFloat(e.target.value) / 100 || undefined }))}/>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Loan Start Date</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.loan_start_date ?? ''}
                    onChange={e => setForm(f => ({ ...f, loan_start_date: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditMode(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Financials'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
