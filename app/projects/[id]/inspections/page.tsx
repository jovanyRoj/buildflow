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

const INSPECTION_TYPES = [
  { value: 'foundation',        label: 'Foundation' },
  { value: 'framing',           label: 'Framing' },
  { value: 'electrical_rough',  label: 'Electrical Rough' },
  { value: 'plumbing_rough',    label: 'Plumbing Rough' },
  { value: 'mechanical',        label: 'Mechanical' },
  { value: 'insulation',        label: 'Insulation' },
  { value: 'drywall',           label: 'Drywall' },
  { value: 'electrical_final',  label: 'Electrical Final' },
  { value: 'plumbing_final',    label: 'Plumbing Final' },
  { value: 'mechanical_final',  label: 'Mechanical Final' },
  { value: 'final',             label: 'Final' },
  { value: 'other',             label: 'Other' },
]

const RESULT_COLORS: Record<string, string> = {
  passed:    'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  pending:   'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
}
const RESULT_LABELS: Record<string, string> = {
  passed:    '✅ Passed',
  failed:    '❌ Failed',
  pending:   '⏳ Pending',
  scheduled: '📅 Scheduled',
}

interface Inspection {
  id: string; project_id: string; task_id?: string
  inspection_type: string; inspection_date?: string; scheduled_date?: string
  inspector_name?: string; inspector_badge?: string; result: string
  correction_required?: string; reinspection_date?: string; cost?: number; notes?: string
  created_at: string
}

const BLANK = {
  inspection_type: 'foundation', scheduled_date: '', inspection_date: '',
  inspector_name: '', inspector_badge: '', result: 'scheduled',
  correction_required: '', reinspection_date: '', cost: '', notes: '',
}

export default function InspectionsPage() {
  const params = useParams()
  const { getProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [form, setForm]               = useState({ ...BLANK })
  const [saving, setSaving]           = useState(false)
  const [filterResult, setFilterResult] = useState('all')

  const load = useCallback(async () => {
    if (!project?.id) return
    const res = await fetch(`/api/builder/projects/${project.id}/inspections`)
    const d = await res.json()
    setInspections(d.inspections ?? [])
    setLoading(false)
  }, [project?.id])

  useEffect(() => { load() }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/inspections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        inspection_date: form.inspection_date || undefined,
        scheduled_date: form.scheduled_date || undefined,
        reinspection_date: form.reinspection_date || undefined,
        correction_required: form.correction_required || undefined,
      }),
    })
    await load(); setSaving(false); setShowAdd(false); setForm({ ...BLANK })
  }

  async function updateResult(insp: Inspection, result: string) {
    await fetch(`/api/builder/projects/${project!.id}/inspections`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: insp.id, result }),
    })
    setInspections(prev => prev.map(i => i.id === insp.id ? { ...i, result } : i))
  }

  if (!ready || !project) return <Spinner />

  const filtered = inspections.filter(i => filterResult === 'all' || i.result === filterResult)
  const passedCount  = inspections.filter(i => i.result === 'passed').length
  const failedCount  = inspections.filter(i => i.result === 'failed').length
  const pendingCount = inspections.filter(i => i.result === 'pending' || i.result === 'scheduled').length

  const typeLabel = (val: string) => INSPECTION_TYPES.find(t => t.value === val)?.label ?? val

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Inspections"
        backHref={`/projects/${project.id}`}
        action={
          <button onClick={() => { setShowAdd(true); setForm({ ...BLANK }) }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
            + Log
          </button>
        }
      />

      {/* Summary */}
      <div className="px-5 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-lg font-bold text-green-600">{passedCount}</p>
            <p className="text-xs text-gray-400">Passed</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-lg font-bold text-red-600">{failedCount}</p>
            <p className="text-xs text-gray-400">Failed</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-lg font-bold text-gray-700">{pendingCount}</p>
            <p className="text-xs text-gray-400">Pending</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="px-5 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all','passed','failed','scheduled','pending'].map(s => (
            <button key={s} onClick={() => setFilterResult(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize ${filterResult === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}>
              {s === 'all' ? 'All' : RESULT_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <div className="px-5">
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold text-gray-800 mb-1">No inspections logged</p>
            <p className="text-sm text-gray-400 mb-4">Log county inspections — foundation, framing, electrical, plumbing, and final.</p>
            <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
              Log First Inspection
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {filtered.map(insp => (
            <div key={insp.id} className={`bg-white rounded-2xl p-4 shadow-sm ${insp.result === 'failed' ? 'border-l-4 border-red-400' : insp.result === 'passed' ? 'border-l-4 border-green-400' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{typeLabel(insp.inspection_type)}</p>
                  {insp.inspector_name && <p className="text-xs text-gray-400">{insp.inspector_name}{insp.inspector_badge ? ` · ${insp.inspector_badge}` : ''}</p>}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {insp.scheduled_date && <p className="text-xs text-gray-400">📅 Scheduled: {insp.scheduled_date}</p>}
                    {insp.inspection_date && <p className="text-xs text-gray-400">✓ Done: {insp.inspection_date}</p>}
                  </div>
                </div>
                <select
                  value={insp.result}
                  onChange={e => updateResult(insp, e.target.value)}
                  className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${RESULT_COLORS[insp.result]}`}
                >
                  {Object.entries(RESULT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {insp.result === 'failed' && insp.correction_required && (
                <div className="mt-2 p-2 bg-red-50 rounded-xl">
                  <p className="text-xs font-semibold text-red-700">Fix required:</p>
                  <p className="text-xs text-red-600">{insp.correction_required}</p>
                  {insp.reinspection_date && <p className="text-xs text-red-500 mt-1">Reinspection: {insp.reinspection_date}</p>}
                </div>
              )}
              {insp.cost && <p className="text-xs text-gray-400 mt-2">Fee: ${insp.cost}</p>}
              {insp.notes && <p className="text-xs text-gray-400 mt-1 italic">{insp.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Log Inspection Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">Log Inspection</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Type *</label>
                <select required className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  value={form.inspection_type} onChange={e => setForm(f => ({ ...f, inspection_type: e.target.value }))}>
                  {INSPECTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Result</label>
                <div className="flex gap-2">
                  {Object.entries(RESULT_LABELS).map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => setForm(f => ({ ...f, result: v }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium ${form.result === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Scheduled</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Actual Date</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Inspector Name</label>
                  <input type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    placeholder="John Martinez" value={form.inspector_name}
                    onChange={e => setForm(f => ({ ...f, inspector_name: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Badge #</label>
                  <input type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    placeholder="OK-4421" value={form.inspector_badge}
                    onChange={e => setForm(f => ({ ...f, inspector_badge: e.target.value }))}/>
                </div>
              </div>
              {form.result === 'failed' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-red-500 block mb-1.5">Correction Required *</label>
                    <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-sm resize-none"
                      placeholder="Describe what needs to be fixed..." value={form.correction_required}
                      onChange={e => setForm(f => ({ ...f, correction_required: e.target.value }))}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Reinspection Date</label>
                    <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                      value={form.reinspection_date} onChange={e => setForm(f => ({ ...f, reinspection_date: e.target.value }))}/>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Fee ($)</label>
                  <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    placeholder="125" value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notes</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Saving...' : 'Log Inspection'}
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
