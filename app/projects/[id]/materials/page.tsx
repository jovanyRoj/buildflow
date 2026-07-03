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

const CATEGORIES = [
  { value: 'lumber',        label: 'Lumber',         icon: '🪵' },
  { value: 'appliances',    label: 'Appliances',     icon: '🍳' },
  { value: 'fixtures',      label: 'Fixtures',       icon: '🚿' },
  { value: 'windows',       label: 'Windows',        icon: '🪟' },
  { value: 'doors',         label: 'Doors',          icon: '🚪' },
  { value: 'flooring',      label: 'Flooring',       icon: '🟫' },
  { value: 'roofing',       label: 'Roofing',        icon: '🏠' },
  { value: 'electrical',    label: 'Electrical',     icon: '⚡' },
  { value: 'plumbing',      label: 'Plumbing',       icon: '🔧' },
  { value: 'hvac',          label: 'HVAC',           icon: '❄️' },
  { value: 'cabinets',      label: 'Cabinets',       icon: '🗄️' },
  { value: 'countertops',   label: 'Countertops',    icon: '🟩' },
  { value: 'tile',          label: 'Tile',           icon: '⬛' },
  { value: 'insulation',    label: 'Insulation',     icon: '🧱' },
  { value: 'concrete',      label: 'Concrete',       icon: '🪨' },
  { value: 'hardware',      label: 'Hardware',       icon: '🔩' },
  { value: 'paint',         label: 'Paint',          icon: '🎨' },
  { value: 'landscaping',   label: 'Landscaping',    icon: '🌿' },
  { value: 'other',         label: 'Other',          icon: '📦' },
]

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  ordered:   'bg-blue-100 text-blue-700',
  delivered: 'bg-yellow-100 text-yellow-700',
  installed: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending:   '⏳ Pending',
  ordered:   '📦 Ordered',
  delivered: '🚚 Delivered',
  installed: '✅ Installed',
}

interface Material {
  id: string; project_id: string; task_id?: string; category: string
  name: string; vendor?: string; quantity: number; unit: string
  unit_price: number; purchase_status: string; order_date?: string
  delivery_date?: string; notes?: string; created_at: string
}

const BLANK_FORM = {
  category: 'lumber', name: '', vendor: '', quantity: 1,
  unit: 'each', unit_price: 0, purchase_status: 'pending',
  order_date: '', delivery_date: '', notes: '',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function MaterialsPage() {
  const params = useParams()
  const { getProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [materials, setMaterials]   = useState<Material[]>([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState({ ...BLANK_FORM })
  const [saving, setSaving]         = useState(false)
  const [filterCat, setFilterCat]   = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editItem, setEditItem]     = useState<Material | null>(null)

  const load = useCallback(async () => {
    if (!project?.id) return
    const res = await fetch(`/api/builder/projects/${project.id}/materials`)
    const d = await res.json()
    setMaterials(d.materials ?? [])
    setLoading(false)
  }, [project?.id])

  useEffect(() => { load() }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !form.name) return
    setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, quantity: parseFloat(String(form.quantity)), unit_price: parseFloat(String(form.unit_price)) }),
    })
    await load(); setSaving(false); setShowAdd(false); setForm({ ...BLANK_FORM })
  }

  async function handleStatusChange(mat: Material, status: string) {
    await fetch(`/api/builder/projects/${project!.id}/materials`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mat.id, purchase_status: status }),
    })
    setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, purchase_status: status } : m))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/builder/projects/${project!.id}/materials?id=${id}`, { method: 'DELETE' })
    setMaterials(prev => prev.filter(m => m.id !== id))
  }

  if (!ready || !project) return <Spinner />

  const filtered = materials.filter(m =>
    (filterCat === 'all' || m.category === filterCat) &&
    (filterStatus === 'all' || m.purchase_status === filterStatus)
  )

  const totalCost = materials.reduce((s, m) => s + m.quantity * m.unit_price, 0)
  const installedCost = materials.filter(m => m.purchase_status === 'installed').reduce((s, m) => s + m.quantity * m.unit_price, 0)

  // Group by category for display
  const grouped: Record<string, Material[]> = {}
  filtered.forEach(m => {
    if (!grouped[m.category]) grouped[m.category] = []
    grouped[m.category].push(m)
  })

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) ?? { icon: '📦', label: cat }

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Materials"
        backHref={`/projects/${project.id}/finances`}
        action={
          <button onClick={() => { setShowAdd(true); setForm({ ...BLANK_FORM }) }}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
            + Add
          </button>
        }
      />

      {/* Summary */}
      <div className="px-5 pt-4 pb-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">Total Cost</p>
            <p className="text-base font-bold text-gray-900">{fmt(totalCost)}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">Installed</p>
            <p className="text-base font-bold text-green-600">{fmt(installedCost)}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">Items</p>
            <p className="text-base font-bold text-gray-900">{materials.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterStatus('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStatus === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}>
            All
          </button>
          {(['pending','ordered','delivered','installed'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterStatus === s ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : materials.length === 0 ? (
        <div className="px-5">
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">🪵</p>
            <p className="font-semibold text-gray-800 mb-1">No materials yet</p>
            <p className="text-sm text-gray-400 mb-4">Track lumber, appliances, fixtures and any material the builder purchases directly.</p>
            <button onClick={() => setShowAdd(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
              Add First Material
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 space-y-4">
          {Object.entries(grouped).map(([cat, items]) => {
            const ci = catInfo(cat)
            const catTotal = items.reduce((s, m) => s + m.quantity * m.unit_price, 0)
            return (
              <div key={cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ci.icon}</span>
                    <span className="text-sm font-bold text-gray-800">{ci.label}</span>
                    <span className="text-xs text-gray-400">({items.length})</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{fmt(catTotal)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map(mat => (
                    <div key={mat.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{mat.name}</p>
                          {mat.vendor && <p className="text-xs text-gray-400">{mat.vendor}</p>}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {mat.quantity} {mat.unit} × {fmt(mat.unit_price)} = <span className="font-bold text-gray-800">{fmt(mat.quantity * mat.unit_price)}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <select
                            value={mat.purchase_status}
                            onChange={e => handleStatusChange(mat, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[mat.purchase_status]}`}
                          >
                            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <button onClick={() => handleDelete(mat.id)} className="text-xs text-gray-300 hover:text-red-400">✕</button>
                        </div>
                      </div>
                      {mat.delivery_date && (
                        <p className="text-xs text-gray-400 mt-1">📅 Delivery: {mat.delivery_date}</p>
                      )}
                      {mat.notes && <p className="text-xs text-gray-400 mt-1 italic">{mat.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Material Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">Add Material</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.slice(0, 9).map(c => (
                    <button key={c.value} type="button"
                      onClick={() => setForm(f => ({ ...f, category: c.value }))}
                      className={`py-2 rounded-xl text-xs font-medium text-center ${form.category === c.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
                <select className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Description *</label>
                <input required type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="e.g. Whirlpool Refrigerator WRF535SWHZ" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Vendor / Supplier</label>
                <input type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="Home Depot, Lowe's, etc." value={form.vendor}
                  onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Quantity</label>
                  <input type="number" min="0.01" step="0.01" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Unit</label>
                  <select className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {['each','sqft','lf','bf','box','set','pallet','ton','lb','gallon'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Unit Price ($)</label>
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    placeholder="0" value={form.unit_price}
                    onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}/>
                </div>
              </div>
              {(form.quantity > 0 && form.unit_price > 0) && (
                <p className="text-sm font-bold text-blue-700 text-right">
                  Total: {fmt(form.quantity * form.unit_price)}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Order Date</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Delivery Date</label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                    value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notes</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  placeholder="Color, model number, special instructions..."
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={saving || !form.name}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {saving ? 'Saving...' : 'Add Material'}
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
