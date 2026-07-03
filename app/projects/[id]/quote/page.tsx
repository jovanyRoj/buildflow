'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useBuildFlowStore } from '@/lib/store'
import { useAuthGuard } from '@/lib/useAuthGuard'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}
function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const ITEM_TYPES = [
  { value: 'labor',     label: '👷 Labor' },
  { value: 'material',  label: '🪵 Material' },
  { value: 'permit',    label: '📋 Permit' },
  { value: 'equipment', label: '🏗️ Equipment' },
  { value: 'other',     label: '📦 Other' },
]

interface QuoteItem { id: string; phase_id: string; item_type: string; description: string; estimated_amount: number; actual_amount?: number }
interface Phase { id: string; phase_name: string; phase_order: number; budget_amount: number; quoted_total: number; status: string; notes?: string; bf_quote_items: QuoteItem[] }
interface Quote { id: string; total_budget: number; contingency_pct: number; status: string; notes?: string }

export default function QuotePage() {
  const params = useParams()
  const { getProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [quote, setQuote]   = useState<Quote | null>(null)
  const [phases, setPhases] = useState<Phase[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [setupForm, setSetupForm] = useState({ total_budget: '', contingency_pct: '10', notes: '' })
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [phaseForm, setPhaseForm] = useState({ phase_name: '', budget_amount: '', notes: '' })
  const [showAddItem, setShowAddItem] = useState<string | null>(null) // phase id
  const [itemForm, setItemForm] = useState({ item_type: 'labor', description: '', estimated_amount: '' })
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!project?.id) return
    const res = await fetch(`/api/builder/projects/${project.id}/quote`)
    const d = await res.json()
    setQuote(d.quote ?? null)
    setPhases(d.phases ?? [])
    setLoading(false)
  }, [project?.id])

  useEffect(() => { load() }, [load])

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_budget: parseFloat(setupForm.total_budget),
        contingency_pct: parseFloat(setupForm.contingency_pct),
        notes: setupForm.notes,
      }),
    })
    await load(); setSaving(false); setShowSetup(false)
  }

  async function handleAddPhase(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setSaving(true)
    const count = phases.length
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_phase',
        phase_name: phaseForm.phase_name,
        budget_amount: parseFloat(phaseForm.budget_amount) || 0,
        phase_order: count + 1,
        notes: phaseForm.notes,
      }),
    })
    await load(); setSaving(false); setShowAddPhase(false)
    setPhaseForm({ phase_name: '', budget_amount: '', notes: '' })
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !showAddItem) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_item',
        phase_id: showAddItem,
        item_type: itemForm.item_type,
        description: itemForm.description,
        estimated_amount: parseFloat(itemForm.estimated_amount) || 0,
      }),
    })
    await load(); setSaving(false); setShowAddItem(null)
    setItemForm({ item_type: 'labor', description: '', estimated_amount: '' })
  }

  async function handleDeletePhase(phaseId: string) {
    if (!project) return
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_phase', id: phaseId }),
    })
    setPhases(prev => prev.filter(p => p.id !== phaseId))
  }

  async function handleDeleteItem(itemId: string) {
    if (!project) return
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_item', id: itemId }),
    })
    await load()
  }

  if (!ready || !project) return <Spinner />

  const totalAllocated = phases.reduce((s, p) => s + p.budget_amount, 0)
  const totalQuoted    = phases.reduce((s, p) => s + (p.bf_quote_items ?? []).reduce((ss, i) => ss + i.estimated_amount, 0), 0)
  const contingency    = quote ? quote.total_budget * (quote.contingency_pct / 100) : 0

  const statusColor = (phase: Phase) => {
    const phaseTotal = (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
    if (phaseTotal > phase.budget_amount) return 'bg-red-100 text-red-700'
    if (phaseTotal >= phase.budget_amount * 0.9) return 'bg-yellow-100 text-yellow-700'
    return 'bg-green-100 text-green-700'
  }
  const statusLabel = (phase: Phase) => {
    const phaseTotal = (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
    if (phaseTotal > phase.budget_amount) return '🔴 Over Budget'
    if (phaseTotal >= phase.budget_amount * 0.9) return '🟡 Near Limit'
    return '🟢 On Budget'
  }

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Project Quote"
        backHref={`/projects/${project.id}/finances`}
        action={
          quote ? (
            <button onClick={() => setShowAddPhase(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
              + Phase
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : !quote ? (
        <div className="px-5 pt-6">
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-gray-800 mb-1">No project quote yet</p>
            <p className="text-sm text-gray-400 mb-4">Set up your pre-construction budget organized by phase. This is your financial map before inviting subs.</p>
            <button onClick={() => setShowSetup(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
              Create Quote
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-4 space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-gray-800">Budget Summary</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${quote.status === 'locked' ? 'bg-gray-800 text-white' : quote.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {quote.status.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Total Budget</p>
                <p className="font-bold text-gray-900 text-base">{fmt(quote.total_budget)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Contingency ({quote.contingency_pct}%)</p>
                <p className="font-bold text-amber-600">{fmt(contingency)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Allocated to Phases</p>
                <p className={`font-bold ${totalAllocated > quote.total_budget ? 'text-red-600' : 'text-gray-900'}`}>{fmt(totalAllocated)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Quoted in Items</p>
                <p className={`font-bold ${totalQuoted > quote.total_budget ? 'text-red-600' : 'text-gray-900'}`}>{fmt(totalQuoted)}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${totalQuoted > quote.total_budget ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, (totalQuoted / quote.total_budget) * 100)}%` }}/>
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{Math.round((totalQuoted / quote.total_budget) * 100)}% of budget quoted</p>
            </div>
          </div>

          {/* Default phases if none */}
          {phases.length === 0 && (
            <div className="bg-blue-50 rounded-2xl p-4 text-center">
              <p className="text-sm text-blue-700 font-medium mb-2">Add construction phases to your quote</p>
              <p className="text-xs text-blue-500">e.g. Foundation, Framing, MEP Rough, Envelope, Finishes</p>
            </div>
          )}

          {/* Phases */}
          {phases.map(phase => {
            const phaseTotal = (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
            const isExpanded = expandedPhase === phase.id
            return (
              <div key={phase.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center">{phase.phase_order}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{phase.phase_name}</p>
                      <p className="text-xs text-gray-400">{(phase.bf_quote_items ?? []).length} items</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(phase)}`}>{statusLabel(phase)}</span>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(phaseTotal)}</p>
                      <p className="text-xs text-gray-400">of {fmt(phase.budget_amount)}</p>
                    </div>
                    <span className="text-gray-300 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {(phase.bf_quote_items ?? []).length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {phase.bf_quote_items.map(item => (
                          <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs">{ITEM_TYPES.find(t => t.value === item.item_type)?.label?.split(' ')[0] ?? '📦'}</span>
                              <div>
                                <p className="text-xs font-medium text-gray-700">{item.description}</p>
                                <span className="text-xs text-gray-400">{item.item_type}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{fmt(item.estimated_amount)}</span>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-gray-200 hover:text-red-400 text-xs">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-xs text-gray-400">No items yet. Add labor, materials, permits...</p>
                    )}
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-50">
                      <button onClick={() => { setShowAddItem(phase.id); setItemForm({ item_type: 'labor', description: '', estimated_amount: '' }) }}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl">
                        + Add Item
                      </button>
                      <button onClick={() => handleDeletePhase(phase.id)}
                        className="px-3 py-2 bg-red-50 text-red-500 text-xs font-semibold rounded-xl">
                        Delete Phase
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Create Project Quote</h3>
            <form onSubmit={handleSetup} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Total Construction Budget ($) *</label>
                <input required type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="860000" value={setupForm.total_budget}
                  onChange={e => setSetupForm(f => ({ ...f, total_budget: e.target.value }))}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Contingency % (buffer for overruns)</label>
                <input type="number" min="0" max="30" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  value={setupForm.contingency_pct}
                  onChange={e => setSetupForm(f => ({ ...f, contingency_pct: e.target.value }))}/>
                {setupForm.total_budget && <p className="text-xs text-gray-400 mt-1">= {fmt(parseFloat(setupForm.total_budget) * parseFloat(setupForm.contingency_pct) / 100)} contingency</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notes</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  value={setupForm.notes} onChange={e => setSetupForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowSetup(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Saving...' : 'Create Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Phase Modal */}
      {showAddPhase && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Add Construction Phase</h3>
            <form onSubmit={handleAddPhase} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Phase Name *</label>
                <input required type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="Foundation, Framing, MEP Rough..." value={phaseForm.phase_name}
                  onChange={e => setPhaseForm(f => ({ ...f, phase_name: e.target.value }))}/>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Foundation','Framing','Envelope','MEP Rough','Insulation','Drywall','MEP Finish','Flooring','Cabinets & Countertops','Finishes','Landscaping'].map(s => (
                    <button key={s} type="button" onClick={() => setPhaseForm(f => ({ ...f, phase_name: s }))}
                      className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-blue-50 hover:text-blue-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Budget for this phase ($)</label>
                <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="45000" value={phaseForm.budget_amount}
                  onChange={e => setPhaseForm(f => ({ ...f, budget_amount: e.target.value }))}/>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddPhase(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Saving...' : 'Add Phase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Add Cost Item</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Type</label>
                <div className="flex gap-2 flex-wrap">
                  {ITEM_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setItemForm(f => ({ ...f, item_type: t.value }))}
                      className={`px-3 py-2 rounded-xl text-xs font-medium ${itemForm.item_type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Description *</label>
                <input required type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="Concrete pour, framing labor, electrical permit..." value={itemForm.description}
                  onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Estimated Amount ($)</label>
                <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="0" value={itemForm.estimated_amount}
                  onChange={e => setItemForm(f => ({ ...f, estimated_amount: e.target.value }))}/>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddItem(null)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
