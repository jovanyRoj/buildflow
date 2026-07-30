'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useBrivoxStore } from '@/lib/store'
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
function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

const ITEM_TYPES = [
  { value: 'labor',     label: '👷 Labor' },
  { value: 'material',  label: '🪵 Material' },
  { value: 'permit',    label: '📋 Permit' },
  { value: 'equipment', label: '🏗️ Equipment' },
  { value: 'other',     label: '📦 Other' },
]

const ACTION_LABELS: Record<string, string> = {
  created: '✅ Creado', updated: '✏️ Editado',
  archived: '📦 Archivado', restored: '↩ Restaurado', deleted: '🗑 Eliminado',
}

interface QuoteItem {
  id: string; phase_id: string; item_type: string; description: string
  estimated_amount: number; actual_amount?: number; is_archived?: boolean
}
interface Phase {
  id: string; phase_name: string; phase_order: number; budget_amount: number
  quoted_total: number; status: string; notes?: string
  bf_quote_items: QuoteItem[]; archived_items?: QuoteItem[]
  is_archived?: boolean; archived_at?: string
}
interface Quote { id: string; total_budget: number; contingency_pct: number; status: string; notes?: string }

export default function QuotePage() {
  const params   = useParams()
  const { getProject } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project  = getProject(params.id as string)

  // ── data ──────────────────────────────────────────────────────────────────
  const [quote,          setQuote]          = useState<Quote | null>(null)
  const [phases,         setPhases]         = useState<Phase[]>([])
  const [archivedPhases, setArchivedPhases] = useState<Phase[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [loadingTemplate,setLoadingTemplate]= useState(false)
  const [subTasks,       setSubTasks]       = useState<any[]>([])
  const [registeredSubs, setRegisteredSubs] = useState<any[]>([])
  const [restoringTask,  setRestoringTask]  = useState<Record<string,boolean>>({})
  const [restoredSubs,   setRestoredSubs]   = useState<Set<string>>(new Set())
  const [financials,     setFinancials]     = useState<any>(null)
  const [subNegotiate,   setSubNegotiate]   = useState<Record<string, string>>({})
  const [notifySending,  setNotifySending]  = useState<Record<string, boolean>>({})
  const [agreeSending,   setAgreeSending]   = useState<Record<string, boolean>>({})

  // ── UI toggles ────────────────────────────────────────────────────────────
  const [expandedPhase,   setExpandedPhase]   = useState<string | null>(null)
  const [showSetup,       setShowSetup]       = useState(false)
  const [showAddPhase,    setShowAddPhase]    = useState(false)
  const [showAddItem,     setShowAddItem]     = useState<string | null>(null)
  const [showArchived,    setShowArchived]    = useState(false)

  // ── drag-and-drop reorder ─────────────────────────────────────────────────
  const [dragPhaseId, setDragPhaseId] = useState<string | null>(null)
  const [dragOverId,  setDragOverId]  = useState<string | null>(null)

  // ── inline phase-order edit ───────────────────────────────────────────────
  const [editOrderPhase, setEditOrderPhase] = useState<string | null>(null)
  const [editOrderVal,   setEditOrderVal]   = useState('')

  // ── fallback negotiation (when no sub auto-matched to phase) ──────────────
  const [fallbackSubId, setFallbackSubId] = useState<Record<string, string>>({})

  // ── form states ───────────────────────────────────────────────────────────
  const [setupForm,    setSetupForm]    = useState({ total_budget: '', contingency_pct: '10', notes: '' })
  const [phaseForm,    setPhaseForm]    = useState({ phase_name: '', budget_amount: '', notes: '' })
  const [itemForm,     setItemForm]     = useState({ item_type: 'labor', description: '', estimated_amount: '' })

  // ── inline edit states ────────────────────────────────────────────────────
  const [editPhase,     setEditPhase]     = useState<string | null>(null)
  const [editPhaseForm, setEditPhaseForm] = useState({ phase_name: '', budget_amount: '' })
  const [savingPhase,   setSavingPhase]   = useState<string | null>(null)
  const [editItem,      setEditItem]      = useState<string | null>(null)
  const [editItemForm,  setEditItemForm]  = useState({ description: '', estimated_amount: '', item_type: 'labor' })
  const [savingItem,    setSavingItem]    = useState<string | null>(null)

  // ── history modal ─────────────────────────────────────────────────────────
  const [historyModal,   setHistoryModal]   = useState<{ entity_type: string; entity_id: string; entity_name: string } | null>(null)
  const [historyEntries, setHistoryEntries] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── data load ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!project?.id) return
    const [res, finRes] = await Promise.all([
      fetch(`/api/builder/projects/${project.id}/quote?include_archived=true`),
      fetch(`/api/builder/projects/${project.id}/financials`),
    ])
    const d = await res.json()
    setQuote(d.quote ?? null)
    const all: Phase[] = d.phases ?? []
    setPhases(all.filter(p => !p.is_archived))
    setArchivedPhases(all.filter(p => p.is_archived))
    if (finRes.ok) {
      const fd = await finRes.json()
      setFinancials(fd.financials ?? null)
    }
    setLoading(false)
  }, [project?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!project?.id) return
    const fetchSubData = () => {
      fetch(`/api/builder/project-context/${project.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d?.tasks) return
          setSubTasks(
            d.tasks
              .filter((t: any) => !!(t.assigned_to || t.subcontractor_phone))
              .map((t: any) => ({
                ...t,
                builderAmt:           t.builder_estimate?.amount     ?? 0,
                subAmt:               t.sub_estimate?.amount         ?? 0,
                subProposedAmount:    t.sub_proposed_amount          ?? null,
                builderProposedAmount:t.builder_proposed_amount      ?? null,
                finalAgreedAmount:    t.final_agreed_amount          ?? null,
              }))
          )
          setRegisteredSubs(d.subs ?? [])
        })
        .catch(() => {})
    }
    fetchSubData()
    const id = setInterval(fetchSubData, 30000)
    return () => clearInterval(id)
  }, [project?.id])

  // ── CRUD helpers ──────────────────────────────────────────────────────────
  async function quoteAction(body: Record<string, unknown>) {
    if (!project) return
    return fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function handleReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = phases.findIndex(p => p.id === fromId)
    const toIdx   = phases.findIndex(p => p.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const reordered = [...phases]
    const [moved]   = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((p, i) => ({ ...p, phase_order: i + 1 }))
    setPhases(updated) // optimistic update
    await quoteAction({
      action: 'reorder_phases',
      phases: updated.map(p => ({ id: p.id, phase_order: p.phase_order })),
    })
  }

  async function handleReorderByNumber(phaseId: string, newOrder: number) {
    const total   = phases.length
    const clamped = Math.max(1, Math.min(total, newOrder))
    const fromIdx = phases.findIndex(p => p.id === phaseId)
    const toIdx   = clamped - 1
    setEditOrderPhase(null)
    if (fromIdx < 0 || fromIdx === toIdx) return
    const reordered = [...phases]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((p, i) => ({ ...p, phase_order: i + 1 }))
    setPhases(updated)
    await quoteAction({
      action: 'reorder_phases',
      phases: updated.map(p => ({ id: p.id, phase_order: p.phase_order })),
    })
  }

  async function handleFallbackAgreed(phase: Phase) {
    const subId  = fallbackSubId[phase.id]
    const agreed = parseFloat(subNegotiate[phase.id] ?? '')
    if (!subId || !agreed) return
    const selectedSub = registeredSubs.find(s => s.id === subId)
    if (!selectedSub || !project) return
    setAgreeSending(p => ({ ...p, [phase.id]: true }))
    // Find or create a linked task for this sub
    let taskId: string | null = subTasks.find(t =>
      t.subcontractor_phone === selectedSub.phone ||
      (t.assigned_to ?? '').toLowerCase() === (selectedSub.company ?? '').toLowerCase()
    )?.id ?? null
    if (!taskId) {
      try {
        await fetch('/api/builder/restore-task', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, subId }),
        })
        const d = await fetch(`/api/builder/project-context/${project.id}`).then(r => r.ok ? r.json() : null)
        if (d?.tasks) {
          const newTasks = d.tasks
            .filter((t: any) => !!(t.assigned_to || t.subcontractor_phone))
            .map((t: any) => ({ ...t, builderAmt: t.builder_estimate?.amount ?? 0, subAmt: t.sub_estimate?.amount ?? 0, subProposedAmount: t.sub_proposed_amount ?? null, builderProposedAmount: t.builder_proposed_amount ?? null, finalAgreedAmount: t.final_agreed_amount ?? null }))
          setSubTasks(newTasks)
          setRegisteredSubs(d.subs ?? [])
          taskId = newTasks.find((t: any) =>
            t.subcontractor_phone === selectedSub.phone ||
            (t.assigned_to ?? '').toLowerCase() === (selectedSub.company ?? '').toLowerCase()
          )?.id ?? null
        }
      } catch {}
    }
    setAgreeSending(p => ({ ...p, [phase.id]: false }))
    await handleMarkAgreed(phase.id, {
      company: selectedSub.company ?? '',
      amount: agreed,
      taskId,
      subId,
    })
    setFallbackSubId(p => { const n = { ...p }; delete n[phase.id]; return n })
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault(); if (!project) return; setSaving(true)
    await fetch(`/api/builder/projects/${project.id}/quote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_budget: parseFloat(setupForm.total_budget),
        contingency_pct: parseFloat(setupForm.contingency_pct),
        notes: setupForm.notes,
      }),
    })
    await load(); setSaving(false); setShowSetup(false)
  }

  async function handleLoadTemplate() {
    if (!project) return; setLoadingTemplate(true)
    try { await quoteAction({ action: 'load_template' }); await load() }
    finally { setLoadingTemplate(false) }
  }

  async function handleAddPhase(e: React.FormEvent) {
    e.preventDefault(); if (!project) return; setSaving(true)
    await quoteAction({
      action: 'add_phase', phase_name: phaseForm.phase_name,
      budget_amount: parseFloat(phaseForm.budget_amount) || 0,
      phase_order: phases.length + 1, notes: phaseForm.notes,
    })
    await load(); setSaving(false); setShowAddPhase(false)
    setPhaseForm({ phase_name: '', budget_amount: '', notes: '' })
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault(); if (!project || !showAddItem) return; setSaving(true)
    await quoteAction({
      action: 'add_item', phase_id: showAddItem,
      item_type: itemForm.item_type, description: itemForm.description,
      estimated_amount: parseFloat(itemForm.estimated_amount) || 0,
    })
    await load(); setSaving(false); setShowAddItem(null)
    setItemForm({ item_type: 'labor', description: '', estimated_amount: '' })
  }

  async function handleUpdatePhase(phaseId: string) {
    if (!project) return; setSavingPhase(phaseId)
    await quoteAction({
      action: 'update_phase', id: phaseId,
      phase_name: editPhaseForm.phase_name,
      budget_amount: parseFloat(editPhaseForm.budget_amount) || 0,
    })
    await load(); setEditPhase(null); setSavingPhase(null)
  }

  async function handleUpdateItem(itemId: string) {
    if (!project) return; setSavingItem(itemId)
    await quoteAction({
      action: 'update_item', id: itemId,
      description: editItemForm.description,
      estimated_amount: parseFloat(editItemForm.estimated_amount) || 0,
      item_type: editItemForm.item_type,
    })
    await load(); setEditItem(null); setSavingItem(null)
  }

  async function handleArchivePhase(phase: Phase) {
    if (!project) return
    if (!confirm(`¿Archivar la fase "${phase.phase_name}"?\n\nSus items y presupuesto se conservan — puedes restaurarla en cualquier momento.`)) return
    await quoteAction({ action: 'archive_phase', id: phase.id })
    await load()
  }

  async function handleRestorePhase(phaseId: string) {
    if (!project) return
    await quoteAction({ action: 'restore_phase', id: phaseId })
    await load()
  }

  async function handleArchiveItem(item: QuoteItem) {
    if (!project) return
    await quoteAction({ action: 'archive_item', id: item.id })
    await load()
  }

  async function handleRestoreItem(itemId: string) {
    if (!project) return
    await quoteAction({ action: 'restore_item', id: itemId })
    await load()
  }

  async function openHistory(entityType: string, entityId: string, entityName: string) {
    if (!project) return
    setHistoryModal({ entity_type: entityType, entity_id: entityId, entity_name: entityName })
    setLoadingHistory(true)
    const res = await fetch(`/api/builder/projects/${project.id}/audit?entityType=${entityType}&entityId=${entityId}`)
    const d = await res.json()
    setHistoryEntries(d.entries ?? [])
    setLoadingHistory(false)
  }

  // ── phase/sub helpers ─────────────────────────────────────────────────────
  function buildPhaseKws(phaseName: string): string[] {
    const PHASE_KEYWORDS: Record<string, string[]> = {
      'site': ['survey', 'site', 'clear', 'grad', 'demo', 'excavat'],
      'survey': ['survey', 'land', 'stake', 'bound', 'plat', 'topograph'],
      'excavat': ['excavat', 'dig', 'grade', 'earthwork', 'demo', 'clear'],
      'foundation': ['foundation', 'excavat', 'footing', 'slab', 'concret', 'pour'],
      'framing': ['fram', 'lumber', 'stud', 'beam', 'sheath'],
      'roofing': ['roof', 'shingle', 'tile', 'gutter', 'fascia'],
      'windows': ['window', 'door', 'glazing'],
      'exterior': ['siding', 'exterior', 'envelope', 'soffit', 'trim'],
      'electrical': ['electric', 'wiring', 'panel', 'circuit', 'outlet'],
      'plumbing': ['plumb', 'pipe', 'water', 'drain', 'sewage'],
      'hvac': ['hvac', 'heat', 'cool', 'air', 'duct', 'ventil', 'mechanical'],
      'insulation': ['insulat', 'foam', 'batt', 'spray'],
      'drywall': ['drywall', 'sheetrock', 'gypsum', 'plaster', 'texture'],
      'paint': ['paint', 'primer', 'stain', 'coat'],
      'flooring': ['floor', 'tile', 'carpet', 'hardwood', 'laminate', 'vinyl'],
      'cabinet': ['cabinet', 'countertop', 'vanity', 'millwork'],
      'fixture': ['fixture', 'appliance', 'faucet', 'toilet', 'sink', 'light'],
      'landscap': ['landscap', 'lawn', 'irrigat', 'tree', 'sod', 'fence'],
      'permit': ['permit', 'inspect', 'certificate', 'occupancy'],
      'mep': ['electric', 'plumb', 'hvac', 'mechanic', 'final'],
    }
    const pl = phaseName.toLowerCase()
    let kws: string[] = []
    for (const [key, words] of Object.entries(PHASE_KEYWORDS)) {
      if (pl.includes(key)) kws = [...kws, ...words]
    }
    if (!kws.length) kws = pl.split(/[\s&\/\-,]+/).filter(w => w.length > 3)
    return kws
  }

  function getPhaseSubData(phaseName: string): { company: string; amount: number; taskName?: string; subProposedAmount?: number|null; builderProposedAmount?: number|null; finalAgreedAmount?: number|null; subId?: string|null }[] {
    // ── Helpers ──────────────────────────────────────────────────────────────
    // Strip accents so "topógrafo" ↔ "topográfico" share the same root prefix
    const norm = (s: string) =>
      (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

    // Generic words that appear in many phase/task names and cause false matches
    const SKIP = new Set([
      'trabajo','trabajos','obra','obras','servicio','servicios',
      'instalacion','instalaciones','sistema','sistemas','interior','interio',
      'general','varios','otros','trabajo','labor','labors',
      'work','works','service','services','install','other',
    ])

    // Extract specific, non-generic 7-char prefix keys from a text
    const prefixKeys = (text: string): string[] =>
      norm(text).split(/[\s&\/\-,\.]+/)
        .filter(w => w.length > 4 && !SKIP.has(w))
        .map(w => w.slice(0, 7))

    // Two word sets match if any pair of prefix keys share a common 5-char stem
    const overlaps = (keysA: string[], keysB: string[]): boolean =>
      keysA.some(a => keysB.some(b => a.startsWith(b.slice(0,5)) || b.startsWith(a.slice(0,5))))

    const phaseKeys = [...new Set(prefixKeys(phaseName))]
    if (!phaseKeys.length) return []

    const results: { company: string; amount: number; taskName?: string; subProposedAmount?: number|null; builderProposedAmount?: number|null; finalAgreedAmount?: number|null; taskId?: string|null; subId?: string|null }[] = []
    const seen = new Set<string>()

    // Primary: match subTasks by task name (phase-specific root overlap)
    for (const t of subTasks) {
      if (overlaps(phaseKeys, prefixKeys(t.name ?? ''))) {
        const company = t.sub_company || t.assigned_to || '—'
        const key = norm(company)
        if (!seen.has(key)) {
          seen.add(key)
          const regSub = registeredSubs.find((r: any) => r.phone === t.subcontractor_phone || (r.company ?? '').toLowerCase() === key)
          results.push({ company, amount: t.subAmt ?? 0, taskName: t.name, subProposedAmount: t.subProposedAmount ?? null, builderProposedAmount: t.builderProposedAmount ?? null, finalAgreedAmount: t.finalAgreedAmount ?? null, taskId: t.id ?? null, subId: regSub?.id ?? null })
        }
      }
    }

    // Fallback: match registered subs by trade against phase keys
    for (const sub of registeredSubs) {
      const cl = norm(sub.company ?? '')
      if (!seen.has(cl) && (overlaps(phaseKeys, prefixKeys(sub.trade ?? '')) || overlaps(phaseKeys, prefixKeys(sub.company ?? '')))) {
        seen.add(cl)
        const linked = subTasks.find(t => t.subcontractor_phone === sub.phone)
        results.push({ company: sub.company, amount: linked?.subAmt ?? 0, taskName: linked?.name, subProposedAmount: linked?.subProposedAmount ?? null, builderProposedAmount: linked?.builderProposedAmount ?? null, finalAgreedAmount: linked?.finalAgreedAmount ?? null, taskId: linked?.id ?? null, subId: sub?.id ?? null })
      }
    }
    return results
  }

  // Simple keyword overlap helper for Subs Vinculados trade matching
  function tradeOverlap(taskName: string, trade: string): boolean {
    if (!taskName || !trade) return false
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const keys = (s: string) => norm(s).split(/[\s&\/\-,\.]+/).filter(w => w.length > 4).map(w => w.slice(0, 7))
    const a = keys(taskName)
    const b = keys(trade)
    return b.length > 0 && a.some(x => b.some(y => x.startsWith(y.slice(0, 5)) || y.startsWith(x.slice(0, 5))))
  }

  const orphanedSubs = registeredSubs.filter(sub => {
    if (restoredSubs.has(sub.id)) return false
    const phone   = (sub.phone   ?? '').trim()
    const company = (sub.company ?? '').toLowerCase().trim()
    const trade   = (sub.trade   ?? '').toLowerCase().trim()
    return !subTasks.some(t => {
      if (phone && t.subcontractor_phone === phone) return true
      const al = (t.assigned_to ?? '').toLowerCase()
      const cl = (t.sub_company ?? '').toLowerCase()
      return (al && (al.includes(company) || company.includes(al))) ||
             (al && trade && al.includes(trade)) ||
             (cl && (cl.includes(company) || company.includes(cl)))
    })
  })

  async function restoreTask(sub: any) {
    if (!project?.id) return
    setRestoringTask(p => ({ ...p, [sub.id]: true }))
    try {
      const res = await fetch('/api/builder/restore-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, subId: sub.id }),
      })
      if (res.ok) {
        setRestoredSubs(prev => new Set([...prev, sub.id]))
        fetch(`/api/builder/project-context/${project.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d?.tasks) return
            setSubTasks(
              d.tasks
                .filter((t: any) => !!(t.assigned_to || t.subcontractor_phone))
                .map((t: any) => ({ ...t, builderAmt: t.builder_estimate?.amount ?? 0, subAmt: t.sub_estimate?.amount ?? 0, subProposedAmount: t.sub_proposed_amount ?? null, builderProposedAmount: t.builder_proposed_amount ?? null, finalAgreedAmount: t.final_agreed_amount ?? null }))
            )
            setRegisteredSubs(d.subs ?? [])
          })
          .catch(() => {})
      }
    } catch {}
    setRestoringTask(p => ({ ...p, [sub.id]: false }))
  }

  async function handleNotifySub(
    phaseId: string, phaseName: string,
    subInfo: { company: string; amount: number; taskName?: string }
  ) {
    const agreedStr = subNegotiate[phaseId]
    const agreed = parseFloat(agreedStr ?? '')
    if (!agreedStr || isNaN(agreed) || agreed <= 0) {
      alert('Ingresa un monto negociado válido mayor a $0')
      return
    }
    // Resolve task_id and sub_id from matched data
    const subTask = subTasks.find(t =>
      (subInfo.taskName && t.name === subInfo.taskName) ||
      (t.sub_company ?? '').toLowerCase() === (subInfo.company ?? '').toLowerCase() ||
      (t.assigned_to ?? '').toLowerCase() === (subInfo.company ?? '').toLowerCase()
    )
    const sub = registeredSubs.find(s =>
      s.phone === subTask?.subcontractor_phone ||
      (s.company ?? '').toLowerCase() === (subInfo.company ?? '').toLowerCase()
    )
    setNotifySending(p => ({ ...p, [phaseId]: true }))
    try {
      await fetch(`/api/builder/projects/${project!.id}/quote`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify_sub_agreed',
          task_id: subTask?.id ?? null,
          sub_id: sub?.id ?? null,
          sub_phone: sub?.phone ?? subTask?.subcontractor_phone ?? null,
          sub_company: subInfo.company,
          phase_name: phaseName,
          agreed_amount: agreed,
        }),
      })
      setSubNegotiate(p => { const n = { ...p }; delete n[phaseId]; return n })
      alert(`✅ KORVIA notificó a ${subInfo.company} — monto acordado: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(agreed)}`)
      // Refresh sub data
      const d = await fetch(`/api/builder/project-context/${project!.id}`).then(r => r.ok ? r.json() : null)
      if (d?.tasks) {
        setSubTasks(
          d.tasks
            .filter((t: any) => !!(t.assigned_to || t.subcontractor_phone))
            .map((t: any) => ({
              ...t,
              builderAmt:            t.builder_estimate?.amount    ?? 0,
              subAmt:                t.sub_estimate?.amount        ?? 0,
              subProposedAmount:     t.sub_proposed_amount         ?? null,
              builderProposedAmount: t.builder_proposed_amount     ?? null,
              finalAgreedAmount:     t.final_agreed_amount         ?? null,
            }))
        )
        setRegisteredSubs(d.subs ?? [])
      }
    } catch {
      alert('Error al enviar la notificación')
    }
    setNotifySending(p => ({ ...p, [phaseId]: false }))
  }

  async function handleMarkAgreed(phaseId: string, s: { company: string; amount: number; taskId?: string|null; subId?: string|null }) {
    if (!project) return
    const agreed = parseFloat(subNegotiate[phaseId] ?? String(s.amount))
    if (!agreed) return
    setAgreeSending(p => ({ ...p, [phaseId]: true }))
    try {
      await quoteAction({
        action: 'mark_agreed',
        task_id: s.taskId ?? null,
        sub_id: s.subId ?? null,
        agreed_amount: agreed,
        phase_name: '',
        sub_company: s.company,
      })
      await new Promise(r => setTimeout(r, 500))
      // Refresh sub data from project-context
      const d = await fetch(`/api/builder/project-context/${project.id}`).then(r => r.ok ? r.json() : null)
      if (d?.tasks) {
        setSubTasks(
          d.tasks
            .filter((t: any) => !!(t.assigned_to || t.subcontractor_phone))
            .map((t: any) => ({
              ...t,
              builderAmt:            t.builder_estimate?.amount    ?? 0,
              subAmt:                t.sub_estimate?.amount        ?? 0,
              subProposedAmount:     t.sub_proposed_amount         ?? null,
              builderProposedAmount: t.builder_proposed_amount     ?? null,
              finalAgreedAmount:     t.final_agreed_amount         ?? null,
            }))
        )
        setRegisteredSubs(d.subs ?? [])
      }
      setSubNegotiate(p => { const n = { ...p }; delete n[phaseId]; return n })
    } catch {}
    setAgreeSending(p => ({ ...p, [phaseId]: false }))
  }

  if (!ready) return <Spinner />
  if (!project) return (
    <div className="flex items-center justify-center min-h-screen bg-[#F4F6F9]">
      <div className="text-center text-gray-500">
        <p className="text-4xl mb-3">🏗️</p>
        <p className="font-semibold text-[#1A2B4A]">Proyecto no encontrado</p>
        <a href="/projects" className="text-blue-600 text-sm mt-2 block">← Volver a proyectos</a>
      </div>
    </div>
  )

  const totalAllocated = phases.reduce((s, p) => s + p.budget_amount, 0)
  const totalQuoted    = phases.reduce((s, p) => s + (p.bf_quote_items ?? []).reduce((ss, i) => ss + i.estimated_amount, 0), 0)
  const contingency    = quote ? quote.total_budget * (quote.contingency_pct / 100) : 0
  const totalReal      = subTasks.reduce((s, t) => s + (t.subAmt ?? 0), 0)

  // ── Sale / Build price from Finance ──────────────────────────────────────
  const isSold = !!financials?.sold
  const salePrice = isSold
    ? (financials?.sale_price_actual ?? null)
    : (financials?.sale_price_projected ??
       (financials?.sqft && financials?.sale_price_per_sqft
        ? Math.round(financials.sqft * financials.sale_price_per_sqft)
        : null))
  const buildCost = financials?.construction_cost_budget ??
    (financials?.sqft && financials?.construction_cost_per_sqft
     ? Math.round(financials.sqft * financials.construction_cost_per_sqft)
     : null)
  const margin = salePrice && buildCost && buildCost > 0
    ? Math.round(((salePrice - buildCost) / salePrice) * 100)
    : null

  const statusColor = (phase: Phase, realTotal: number) => {
    const amt = realTotal > 0 ? realTotal : (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
    if (phase.budget_amount === 0) return amt > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
    if (amt > phase.budget_amount) return 'bg-red-100 text-red-700'
    if (amt >= phase.budget_amount * 0.8) return 'bg-yellow-100 text-yellow-700'
    if (realTotal > 0) return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-500'
  }
  const statusLabel = (phase: Phase, realTotal: number) => {
    const amt = realTotal > 0 ? realTotal : (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
    if (amt === 0) return '🟢 On Track'
    if (phase.budget_amount === 0) return '🔴 Sin presupuesto'
    if (amt > phase.budget_amount) {
      const over = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amt - phase.budget_amount)
      return `🔴 ${over} over`
    }
    if (amt >= phase.budget_amount * 0.8) return '🟡 Near Limit'
    return '🟢 On Track'
  }

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Budget & Costs"
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

      {/* ── Sale / Build Price Banner ──────────────────────────────────────── */}
      {(salePrice || buildCost) && (
        <div className={`mx-4 mt-3 rounded-2xl p-3.5 ${isSold ? 'bg-green-50 border border-green-200' : 'bg-indigo-50 border border-indigo-100'}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${isSold ? 'text-green-600' : 'text-indigo-500'}`}>
                {isSold ? '🏠 CASA VENDIDA — Precio Real' : '📊 Precio Proyectado de Venta'}
              </p>
              <p className={`text-xl font-extrabold ${isSold ? 'text-green-700' : 'text-indigo-700'}`}>
                {salePrice ? fmt(salePrice) : '—'}
              </p>
              {!isSold && financials?.sqft && financials?.sale_price_per_sqft && (
                <p className="text-[10px] text-indigo-400 mt-0.5">
                  {financials.sqft.toLocaleString()} sqft × ${financials.sale_price_per_sqft}/sqft
                </p>
              )}
            </div>
            <div className="text-right">
              {buildCost && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium">🏗️ Costo de Construcción</p>
                  <p className="text-base font-bold text-gray-700">{fmt(buildCost)}</p>
                </div>
              )}
              {margin !== null && (
                <p className={`text-[10px] font-bold mt-0.5 ${margin >= 20 ? 'text-green-600' : margin >= 8 ? 'text-orange-500' : 'text-red-500'}`}>
                  {margin}% margen
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : !quote ? (
        <div className="px-5 pt-6 space-y-3">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-gray-800 mb-1">No project quote yet</p>
            <p className="text-sm text-gray-400 mb-4">Set up your pre-construction budget organized by phase.</p>
            <button onClick={() => setShowSetup(true)} className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl">
              Create Blank Quote
            </button>
          </div>
          <div className="bg-gradient-to-br from-[#1A2B4A] to-[#2B4A8A] rounded-2xl p-6 shadow-sm text-white">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🏠</span>
              <div>
                <p className="font-bold text-base">Use House Template</p>
                <p className="text-xs text-blue-200">18 phases · ~$350K starter estimate</p>
              </div>
            </div>
            <p className="text-xs text-blue-100 mb-4 leading-relaxed">
              Pre-filled with all phases for a complete single-family home — fully customizable.
            </p>
            <button onClick={handleLoadTemplate} disabled={loadingTemplate}
              className="w-full py-3 bg-white text-[#1A2B4A] text-sm font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-2">
              {loadingTemplate
                ? <><div className="w-4 h-4 border-2 border-[#1A2B4A] border-t-transparent rounded-full animate-spin"/> Building template...</>
                : '🏠 Load House Template'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-4 space-y-4">

          {/* Budget Summary */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-gray-800">Budget Summary</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${quote.status === 'locked' ? 'bg-gray-800 text-white' : quote.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {quote.status.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Total Budget</p>
                <p className="text-base font-extrabold text-gray-900">{fmt(quote.total_budget)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-0.5">Allocated to Phases</p>
                <p className={`text-base font-extrabold ${totalAllocated > quote.total_budget ? 'text-red-600' : 'text-amber-500'}`}>{fmt(totalAllocated)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide mb-0.5">Contingency ({quote.contingency_pct}%)</p>
                <p className="text-base font-extrabold text-orange-500">{fmt(contingency)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wide mb-0.5">Costos Comprometidos</p>
                <p className={`text-base font-extrabold ${totalReal > quote.total_budget ? 'text-red-600' : 'text-green-600'}`}>
                  {totalReal > 0 ? fmt(totalReal) : <span className="text-gray-300 text-sm font-medium">$0 — pendiente</span>}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide mb-0.5">KORVIA Estimado (items)</p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-base font-extrabold ${totalQuoted > quote.total_budget ? 'text-red-600' : 'text-purple-600'}`}>
                    {totalQuoted > 0 ? fmt(totalQuoted) : <span className="text-gray-300 text-sm font-medium">$0 — sin items</span>}
                  </p>
                  {totalQuoted > 0 && quote.total_budget > 0 && (
                    <span className={`text-xs font-semibold ${totalQuoted > quote.total_budget ? 'text-red-500' : 'text-purple-400'}`}>
                      {((totalQuoted / quote.total_budget) * 100).toFixed(0)}% del budget
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Progress bar */}
            {(() => {
              const total = quote.total_budget || 1
              const pReal  = Math.min(100, (totalReal / total) * 100)
              const pAlloc = Math.min(100 - pReal, Math.max(0, ((totalAllocated - totalReal) / total) * 100))
              const pCont  = Math.min(100 - pReal - pAlloc, (contingency / total) * 100)
              const pRest  = Math.max(0, 100 - pReal - pAlloc - pCont)
              return (
                <div>
                  <div className="h-4 rounded-full overflow-hidden flex gap-0.5 bg-gray-100">
                    {pReal  > 0 && <div className="h-full bg-green-400 transition-all duration-700 rounded-l-full" style={{ width: `${pReal}%` }}/>}
                    {pAlloc > 0 && <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${pAlloc}%` }}/>}
                    {pCont  > 0 && <div className="h-full bg-orange-400 transition-all duration-700" style={{ width: `${pCont}%` }}/>}
                    {pRest  > 0 && <div className="h-full bg-gray-200 transition-all duration-700 rounded-r-full" style={{ width: `${pRest}%` }}/>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {[['bg-green-400','Real'],['bg-amber-400','Allocated'],['bg-orange-400','Contingency'],['bg-gray-200','Remaining']].map(([c,l]) => (
                      <span key={l} className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className={`w-2 h-2 rounded-full ${c} inline-block`}/>{l}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Empty phases — offer template */}
          {phases.length === 0 && (
            <div className="bg-gradient-to-br from-[#1A2B4A] to-[#2B4A8A] rounded-2xl p-5 shadow-sm text-white">
              <p className="font-bold text-sm mb-1">🏠 Start with the House Template</p>
              <p className="text-xs text-blue-200 mb-4 leading-relaxed">
                Instantly load 18 construction phases with line items and suggested budgets.
              </p>
              <button onClick={handleLoadTemplate} disabled={loadingTemplate}
                className="w-full py-2.5 bg-white text-[#1A2B4A] text-sm font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-2">
                {loadingTemplate
                  ? <><div className="w-4 h-4 border-2 border-[#1A2B4A] border-t-transparent rounded-full animate-spin"/> Building template...</>
                  : '🏠 Load House Template'}
              </button>
              <p className="text-xs text-blue-300 text-center mt-2">or use "+ Phase" above to add manually</p>
            </div>
          )}

          {/* Needs Attention banner */}
          {phases.length > 0 && (() => {
            const overBudget = phases.filter(p => {
              const rt = getPhaseSubData(p.phase_name).reduce((s,t) => s+(t.amount??0),0)
              return rt > p.budget_amount && p.budget_amount > 0
            })
            const noEstimate = phases.filter(p =>
              getPhaseSubData(p.phase_name).every(t => !t.amount || t.amount === 0) &&
              getPhaseSubData(p.phase_name).length > 0
            )
            if (!overBudget.length && !noEstimate.length) return null
            return (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">⚠️ Necesita Atención</p>
                <div className="space-y-1.5">
                  {overBudget.map(p => {
                    const rt = getPhaseSubData(p.phase_name).reduce((s,t) => s+(t.amount??0),0)
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-red-700">🔴 {p.phase_name}</span>
                        <span className="text-xs font-bold text-red-600">+{fmt(rt - p.budget_amount)} sobre presupuesto</span>
                      </div>
                    )
                  })}
                  {noEstimate.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                      <span className="text-xs font-semibold text-orange-600">🟡 {p.phase_name}</span>
                      <span className="text-xs text-orange-500">Esperando estimado del sub</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Subs Vinculados Panel ────────────────────────────────────── */}
          {registeredSubs.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-bold text-gray-800">🔗 Subs Vinculados al Proyecto</p>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {registeredSubs.length} sub{registeredSubs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {registeredSubs.map(sub => {
                  const linkedTasks = subTasks.filter(t =>
                    t.subcontractor_phone === sub.phone ||
                    (t.assigned_to ?? '').toLowerCase() === (sub.company ?? '').toLowerCase() ||
                    tradeOverlap(t.name ?? '', sub.trade ?? '')
                  )
                  const hasAnyFinal = linkedTasks.some(t => t.finalAgreedAmount != null)
                  const totalFinal  = linkedTasks.reduce((s, t) => s + (t.finalAgreedAmount ?? t.subAmt ?? 0), 0)
                  const matchedPhases = phases.filter(p =>
                    getPhaseSubData(p.phase_name).some(ps =>
                      (ps.company ?? '').toLowerCase() === (sub.company ?? '').toLowerCase()
                    )
                  )
                  return (
                    <div key={sub.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(sub.company ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">{sub.company}</p>
                          <p className="text-[10px] text-gray-400 capitalize">
                            {sub.trade} · {matchedPhases.length} fase{matchedPhases.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${totalFinal > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                          {totalFinal > 0 ? fmt(totalFinal) : '—'}
                        </p>
                        <p className="text-[9px] text-gray-400">
                          {totalFinal > 0 ? (hasAnyFinal ? 'acordado' : 'cotizado') : 'sin cotización'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Active Phases ─────────────────────────────────────────────── */}
          {phases.map(phase => {
            const phaseTotal     = (phase.bf_quote_items ?? []).reduce((s, i) => s + i.estimated_amount, 0)
            const isExpanded     = expandedPhase === phase.id
            const isEditingPhase = editPhase === phase.id
            const phaseSubs      = getPhaseSubData(phase.phase_name)
            const phaseRealTotal = phaseSubs.reduce((s, t) => s + (t.amount ?? 0), 0)
            const archivedItems  = phase.archived_items ?? []

            return (
              <div
                key={phase.id}
                draggable
                onDragStart={() => setDragPhaseId(phase.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(phase.id) }}
                onDrop={() => {
                  if (dragPhaseId) handleReorder(dragPhaseId, phase.id)
                  setDragPhaseId(null); setDragOverId(null)
                }}
                onDragEnd={() => { setDragPhaseId(null); setDragOverId(null) }}
                className={[
                  'bg-white rounded-2xl shadow-sm overflow-hidden transition-all',
                  dragPhaseId === phase.id ? 'opacity-40 scale-[0.98]' : '',
                  dragOverId === phase.id && dragPhaseId !== phase.id ? 'ring-2 ring-blue-400 ring-offset-2' : '',
                ].join(' ')}
              >

                {/* Phase header */}
                {isEditingPhase ? (
                  // ── Inline edit form for phase ──────────────────────────
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                    <p className="text-xs font-bold text-blue-600 mb-2">✏️ Editando fase</p>
                    <div className="space-y-2">
                      <input
                        className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white text-sm font-medium text-gray-900"
                        value={editPhaseForm.phase_name}
                        onChange={e => setEditPhaseForm(f => ({ ...f, phase_name: e.target.value }))}
                        placeholder="Nombre de la fase"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 shrink-0">Budget $</span>
                        <input
                          className="flex-1 px-3 py-2 rounded-xl border border-blue-200 bg-white text-sm text-gray-900"
                          type="number"
                          value={editPhaseForm.budget_amount}
                          onChange={e => setEditPhaseForm(f => ({ ...f, budget_amount: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditPhase(null)}
                          className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600">
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleUpdatePhase(phase.id)}
                          disabled={savingPhase === phase.id}
                          className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-60">
                          {savingPhase === phase.id ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ── SIEMPRE VISIBLE: Header + Comparación KORVIA vs Sub ── */}
                    <div className="px-4 pt-3 pb-3 border-b border-gray-100">
                      {/* Fila: número + nombre + estado */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5">
                          {/* Drag handle */}
                          <span
                            title="Drag to reorder"
                            className="text-gray-300 cursor-grab active:cursor-grabbing select-none text-base leading-none mr-0.5 shrink-0"
                            style={{ touchAction: 'none' }}
                          >⠿</span>
                          {editOrderPhase === phase.id ? (
                            <input
                              type="number" min="1" max={phases.length}
                              autoFocus
                              value={editOrderVal}
                              onChange={e => setEditOrderVal(e.target.value)}
                              onBlur={() => { const n = parseInt(editOrderVal); if (!isNaN(n)) handleReorderByNumber(phase.id, n); else setEditOrderPhase(null) }}
                              onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(editOrderVal); if (!isNaN(n)) handleReorderByNumber(phase.id, n); else setEditOrderPhase(null) } else if (e.key === 'Escape') setEditOrderPhase(null) }}
                              className="w-7 h-7 bg-blue-600 text-white rounded-xl text-xs font-bold text-center p-0 border-0 focus:ring-2 focus:ring-blue-300 shrink-0"
                              style={{ appearance: 'textfield' }}
                            />
                          ) : (
                            <span
                              onClick={() => { setEditOrderPhase(phase.id); setEditOrderVal(String(phase.phase_order)) }}
                              title="Toca para cambiar el orden"
                              className="w-7 h-7 bg-[#1A2B4A] text-white rounded-xl text-xs font-bold flex items-center justify-center shrink-0 cursor-pointer hover:bg-blue-700 transition-colors select-none"
                            >{phase.phase_order}</span>
                          )}
                          <div>
                            <p className="text-sm font-bold text-gray-900 leading-tight">{phase.phase_name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{(phase.bf_quote_items ?? []).length} items · budget {fmt(phase.budget_amount)}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${statusColor(phase, phaseRealTotal)}`}>{statusLabel(phase, phaseRealTotal)}</span>
                      </div>

                    {/* ── PLANTILLA KORVIA: Comparación por fase ── */}
                    <div>
                      {phaseSubs.length > 0 ? phaseSubs.map((s, i) => (
                        <div key={i} className="space-y-2.5">
                          {/* Sub name */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Sub asignado:</span>
                            <span className="text-xs font-bold text-gray-800">🧑‍🔧 {s.company}</span>
                            {s.taskName && <span className="text-[10px] text-gray-400 truncate">· {s.taskName}</span>}
                          </div>
                          {/* Two big comparison cards */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-indigo-600 border border-indigo-500 rounded-2xl p-3 text-center">
                              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-wide mb-1">🤖 KORVIA Est.</p>
                              <p className="text-xl font-extrabold text-white">{phaseTotal > 0 ? fmt(phaseTotal) : '—'}</p>
                              <p className="text-[9px] text-indigo-200 mt-0.5">{(phase.bf_quote_items ?? []).length} item{(phase.bf_quote_items ?? []).length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className={`rounded-2xl border p-3 text-center ${s.amount > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">👷 Sub Real</p>
                              <p className={`text-xl font-extrabold ${s.amount > 0 ? 'text-green-600' : 'text-gray-300'}`}>{s.amount > 0 ? fmt(s.amount) : '—'}</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">{s.amount > 0 ? 'cotización enviada' : 'sin cotización'}</p>
                            </div>
                          </div>
                          {/* Delta badge */}
                          {phaseTotal > 0 && s.amount > 0 && (() => {
                            const d   = s.amount - phaseTotal
                            const pct = Math.round((s.amount / phaseTotal - 1) * 100)
                            return (
                              <div className={`text-center py-1.5 rounded-xl text-[10px] font-bold ${d > 0 ? 'bg-red-50 text-red-500' : d < 0 ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                                {d > 0
                                  ? `⚠️ Sub cotizó ${fmt(d)} sobre KORVIA (+${pct}%)`
                                  : d < 0
                                  ? `✅ Sub cotizó ${fmt(Math.abs(d))} bajo KORVIA (${pct}%)`
                                  : '✅ Igual al estimado KORVIA'}
                              </div>
                            )
                          })()}
                          {/* ── 4-Value Comparison ─────────────────────────── */}
                          <div className="space-y-2">
                            {/* Row: 4 cards */}
                            <div className="grid grid-cols-4 gap-1.5">
                              {/* 1. KORVIA Est */}
                              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2 text-center">
                                <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-wide mb-0.5">🤖 KORVIA</p>
                                <p className="text-xs font-extrabold text-indigo-700">{phaseTotal > 0 ? fmt(phaseTotal) : '—'}</p>
                              </div>
                              {/* 2. Sub First Est */}
                              <div className={`rounded-xl border p-2 text-center ${s.amount > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">👷 Sub Est.</p>
                                <p className={`text-xs font-extrabold ${s.amount > 0 ? 'text-green-700' : 'text-gray-300'}`}>{s.amount > 0 ? fmt(s.amount) : '—'}</p>
                              </div>
                              {/* 3. Builder Propuesta */}
                              <div className={`rounded-xl border p-2 text-center ${s.builderProposedAmount != null ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">🏗 Builder</p>
                                <p className={`text-xs font-extrabold ${s.builderProposedAmount != null ? 'text-orange-700' : 'text-gray-300'}`}>{s.builderProposedAmount != null ? fmt(s.builderProposedAmount) : '—'}</p>
                              </div>
                              {/* 4. Acordado Final */}
                              <div className={`rounded-xl border p-2 text-center ${s.finalAgreedAmount != null ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">✅ Acordado</p>
                                <p className={`text-xs font-extrabold ${s.finalAgreedAmount != null ? 'text-emerald-700' : 'text-gray-300'}`}>{s.finalAgreedAmount != null ? fmt(s.finalAgreedAmount) : '—'}</p>
                              </div>
                            </div>

                            {/* Sub counter-proposal pill */}
                            {s.subProposedAmount != null && s.finalAgreedAmount == null && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-[9px] font-bold text-blue-400 uppercase">💬 Sub contra-propone</p>
                                  <p className="text-sm font-extrabold text-blue-700">{fmt(s.subProposedAmount)}</p>
                                </div>
                                <button onClick={() => setSubNegotiate(p => ({ ...p, [phase.id]: String(s.subProposedAmount) }))}
                                  className="text-[10px] px-2.5 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-500 transition shrink-0">
                                  Usar propuesta
                                </button>
                              </div>
                            )}

                            {/* Negotiation input */}
                            {s.finalAgreedAmount == null && (
                              <div className="bg-white rounded-xl border border-indigo-100 p-2.5">
                                <p className="text-[10px] font-bold text-indigo-500 mb-1.5">🤖 KORVIA — Propuesta del Builder</p>
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                    <input type="number" placeholder="0"
                                      value={subNegotiate[phase.id] ?? ''}
                                      onChange={e => setSubNegotiate(p => ({ ...p, [phase.id]: e.target.value }))}
                                      className="w-full pl-5 pr-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50/30 text-sm font-semibold text-gray-900 focus:outline-none focus:border-indigo-400"/>
                                  </div>
                                  <button onClick={() => handleNotifySub(phase.id, phase.phase_name, s)}
                                    disabled={notifySending[phase.id] || !subNegotiate[phase.id]}
                                    className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1 shrink-0">
                                    {notifySending[phase.id]
                                      ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>…</>
                                      : '📤 Notificar sub'}
                                  </button>
                                </div>
                                <div className="mt-2">
                                  <button onClick={() => handleMarkAgreed(phase.id, s)}
                                    disabled={agreeSending[phase.id] || !subNegotiate[phase.id]}
                                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                                    {agreeSending[phase.id]
                                      ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>…</>
                                      : '✅ Finalizar Acuerdo'}
                                  </button>
                                </div>
                                <p className="text-[9px] text-gray-400 mt-1">Notificar envía la propuesta · Finalizar bloquea el acuerdo</p>
                              </div>
                            )}

                            {/* Final agreed locked banner */}
                            {s.finalAgreedAmount != null && (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                                <p className="text-[10px] font-bold text-emerald-500 mb-1">✅ Acuerdo Finalizado</p>
                                <p className="text-xl font-extrabold text-emerald-700">{fmt(s.finalAgreedAmount)}</p>
                                <p className="text-[9px] text-emerald-400 mt-0.5">Este monto está acordado por builder y sub</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )) : (
                        /* No sub auto-matched — show KORVIA card + manual link panel */
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-indigo-600 border border-indigo-500 rounded-2xl p-3 text-center">
                              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-wide mb-1">🤖 KORVIA Est.</p>
                              <p className="text-xl font-extrabold text-white">{phaseTotal > 0 ? fmt(phaseTotal) : '—'}</p>
                              <p className="text-[9px] text-indigo-200 mt-0.5">{(phase.bf_quote_items ?? []).length} item{(phase.bf_quote_items ?? []).length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">👷 Sub Real</p>
                              <p className="text-xl font-extrabold text-gray-300">—</p>
                              <p className="text-[9px] text-gray-300 mt-0.5">sin sub vinculado</p>
                            </div>
                          </div>
                          {registeredSubs.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-100 p-2.5 space-y-2">
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">🔗 Vincular sub y finalizar acuerdo</p>
                              <select
                                value={fallbackSubId[phase.id] ?? ''}
                                onChange={e => setFallbackSubId(p => ({ ...p, [phase.id]: e.target.value }))}
                                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 bg-white focus:outline-none focus:border-indigo-400"
                              >
                                <option value="">Selecciona un sub…</option>
                                {registeredSubs.map(s => (
                                  <option key={s.id} value={s.id}>{s.company}{s.trade ? ` · ${s.trade}` : ''}</option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                                  <input type="number" placeholder="Monto acordado"
                                    value={subNegotiate[phase.id] ?? ''}
                                    onChange={e => setSubNegotiate(p => ({ ...p, [phase.id]: e.target.value }))}
                                    className="w-full pl-5 pr-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <button
                                  onClick={() => handleFallbackAgreed(phase)}
                                  disabled={agreeSending[phase.id] || !fallbackSubId[phase.id] || !subNegotiate[phase.id]}
                                  className="px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1 shrink-0 hover:bg-emerald-500 transition"
                                >
                                  {agreeSending[phase.id]
                                    ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>…</>
                                    : '✅ Acordado'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    </div>{/* end always-visible section */}

                    {/* ── KORVIA Items colapsable ── */}
                    <div className="border-t border-gray-50">
                      <button
                        onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/30">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                          🤖 Estimados KORVIA · {(phase.bf_quote_items ?? []).length} items
                        </span>
                        <span className="text-[10px] text-gray-400">{isExpanded ? '▲ ocultar' : '▼ ver detalle'}</span>
                      </button>
                    {isExpanded && (
                    <div>

                    {/* Active Quote items */}
                    {(phase.bf_quote_items ?? []).length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {phase.bf_quote_items.map(item => (
                          <div key={item.id}>
                            {editItem === item.id ? (
                              // ── Inline item edit ──────────────────────
                              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                                <p className="text-xs font-bold text-amber-600 mb-2">✏️ Editando item</p>
                                <div className="space-y-2">
                                  <div className="flex gap-1.5 flex-wrap">
                                    {ITEM_TYPES.map(t => (
                                      <button key={t.value} type="button"
                                        onClick={() => setEditItemForm(f => ({ ...f, item_type: t.value }))}
                                        className={`px-2.5 py-1 rounded-xl text-xs font-medium ${editItemForm.item_type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {t.label}
                                      </button>
                                    ))}
                                  </div>
                                  <input
                                    className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm text-gray-900"
                                    value={editItemForm.description}
                                    onChange={e => setEditItemForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Descripción"
                                  />
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 shrink-0">$ Estimado</span>
                                    <input
                                      className="flex-1 px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm text-gray-900"
                                      type="number"
                                      value={editItemForm.estimated_amount}
                                      onChange={e => setEditItemForm(f => ({ ...f, estimated_amount: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditItem(null)}
                                      className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600">
                                      Cancelar
                                    </button>
                                    <button onClick={() => handleUpdateItem(item.id)}
                                      disabled={savingItem === item.id}
                                      className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold disabled:opacity-60">
                                      {savingItem === item.id ? 'Guardando…' : 'Guardar'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-xs shrink-0">{ITEM_TYPES.find(t => t.value === item.item_type)?.label?.split(' ')[0] ?? '📦'}</span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-gray-700 truncate">{item.description}</p>
                                    <span className="text-xs text-gray-400">{item.item_type}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <span className="text-sm font-semibold text-gray-900">{fmt(item.estimated_amount)}</span>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setEditItemForm({ description: item.description, estimated_amount: String(item.estimated_amount), item_type: item.item_type })
                                      setEditItem(item.id)
                                    }}
                                    className="text-gray-300 hover:text-blue-500 text-xs px-1">✏️</button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleArchiveItem(item) }}
                                    className="text-gray-200 hover:text-amber-400 text-xs px-1" title="Archivar">📦</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-4 py-3 text-xs text-gray-400">No items yet. Add labor, materials, permits…</p>
                    )}

                    {/* Archived items within phase (collapsible) */}
                    {archivedItems.length > 0 && (
                      <div className="border-t border-dashed border-gray-200">
                        <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                          📦 {archivedItems.length} item{archivedItems.length > 1 ? 's' : ''} archivado{archivedItems.length > 1 ? 's' : ''}
                        </p>
                        <div className="divide-y divide-gray-50">
                          {archivedItems.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-4 py-2.5 opacity-50">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs shrink-0">{ITEM_TYPES.find(t => t.value === item.item_type)?.label?.split(' ')[0] ?? '📦'}</span>
                                <p className="text-xs text-gray-500 line-through truncate">{item.description}</p>
                              </div>
                              <div className="flex items-center gap-2 ml-2 shrink-0">
                                <span className="text-xs text-gray-400">{fmt(item.estimated_amount)}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); handleRestoreItem(item.id) }}
                                  className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-lg font-medium">↩</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    </div>
                    )}
                    </div>{/* end KORVIA items section */}

                    {/* Phase action bar */}
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-50 bg-gray-50/30">
                      <button
                        onClick={() => { setShowAddItem(phase.id); setItemForm({ item_type: 'labor', description: '', estimated_amount: '' }) }}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl">
                        + Item
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setEditPhaseForm({ phase_name: phase.phase_name, budget_amount: String(phase.budget_amount) })
                          setEditPhase(phase.id)
                        }}
                        className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl">
                        ✏️
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openHistory('phase', phase.id, phase.phase_name) }}
                        className="px-3 py-2 bg-gray-100 text-gray-500 text-xs font-semibold rounded-xl">
                        🕐
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleArchivePhase(phase) }}
                        className="px-3 py-2 bg-amber-50 text-amber-600 text-xs font-semibold rounded-xl">
                        📦
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {/* ── Archived Phases Section ───────────────────────────────────── */}
          {archivedPhases.length > 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowArchived(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  📦 {archivedPhases.length} fase{archivedPhases.length > 1 ? 's' : ''} archivada{archivedPhases.length > 1 ? 's' : ''}
                </span>
                <span className="text-gray-400 text-xs">{showArchived ? '▲ Ocultar' : '▼ Ver'}</span>
              </button>
              {showArchived && (
                <div className="divide-y divide-gray-200 border-t border-dashed border-gray-200">
                  {archivedPhases.map(phase => (
                    <div key={phase.id} className="flex items-center justify-between px-4 py-3 opacity-60">
                      <div>
                        <p className="text-sm font-semibold text-gray-600 line-through">{phase.phase_name}</p>
                        <p className="text-xs text-gray-400">
                          budget {fmt(phase.budget_amount)} · {(phase.bf_quote_items ?? []).length + (phase.archived_items ?? []).length} items
                          {phase.archived_at && ` · archivada ${timeAgo(phase.archived_at)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestorePhase(phase.id)}
                        className="text-xs px-3 py-1.5 bg-green-100 text-green-700 font-semibold rounded-xl shrink-0 ml-3">
                        ↩ Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Orphaned Subs Recovery Panel ─────────────────────────────── */}
          {orphanedSubs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
                <span className="text-lg">🔄</span>
                <div>
                  <p className="text-sm font-bold text-amber-900">Sub{orphanedSubs.length > 1 ? 's' : ''} sin tarea vinculada</p>
                  <p className="text-xs text-amber-600">{orphanedSubs.length} sub{orphanedSubs.length > 1 ? 's' : ''} registrado{orphanedSubs.length > 1 ? 's' : ''} — la tarea fue eliminada.</p>
                </div>
              </div>
              {orphanedSubs.map(sub => (
                <div key={sub.id} className="flex items-center justify-between px-4 py-3 border-b border-amber-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{sub.company}</p>
                    <p className="text-xs text-amber-600 capitalize">{sub.trade} · {sub.phone || 'sin teléfono'}</p>
                  </div>
                  <button onClick={() => restoreTask(sub)} disabled={restoringTask[sub.id]}
                    className="text-xs px-3 py-2 bg-amber-500 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center gap-1.5 shrink-0">
                    {restoringTask[sub.id]
                      ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block"/>Restaurando…</>
                      : '↩ Restaurar Tarea'}
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ── Setup Modal ──────────────────────────────────────────────────────── */}
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

      {/* ── Add Phase Modal ───────────────────────────────────────────────────── */}
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

      {/* ── Add Item Modal ────────────────────────────────────────────────────── */}
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

      {/* ── History Modal ─────────────────────────────────────────────────────── */}
      {historyModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setHistoryModal(null)}>
          <div className="bg-white w-full rounded-t-3xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-900">🕐 Historial de cambios</p>
                <p className="text-xs text-gray-400 mt-0.5">{historyModal.entity_name}</p>
              </div>
              <button onClick={() => setHistoryModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">Sin historial de cambios aún.</p>
                  <p className="text-xs text-gray-300 mt-1">Los cambios se registrarán automáticamente.</p>
                </div>
              ) : historyEntries.map(entry => (
                <div key={entry.id} className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-700">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    <span className="text-[10px] text-gray-400">{timeAgo(entry.created_at)}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-1.5">
                    por {entry.performed_by_name ?? entry.performed_by_type}
                    {entry.reason && ` · ${entry.reason}`}
                  </p>
                  {entry.changed_fields && Object.keys(entry.changed_fields).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(entry.changed_fields).map(([field, change]: [string, any]) => (
                        <div key={field} className="text-[10px] bg-white rounded-lg px-2 py-1">
                          <span className="font-semibold text-gray-600">{field}: </span>
                          <span className="text-red-400 line-through">{String(change.from ?? '—')}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600 font-medium">{String(change.to ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
