'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday } from 'date-fns'

const FILE_CATEGORIES = [
  { value: 'foundation', label: 'Foundation', icon: '🏗️' },
  { value: 'framing',    label: 'Framing',    icon: '🪵' },
  { value: 'roof',       label: 'Roof',       icon: '🏠' },
  { value: 'windows',    label: 'Windows',    icon: '🪟' },
  { value: 'renders',    label: 'Renders',    icon: '🎨' },
  { value: 'cabinets',   label: 'Cabinets',   icon: '🚪' },
  { value: 'permits',    label: 'Permits',    icon: '📋' },
  { value: 'other',      label: 'Other',      icon: '📁' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Not started',    color: 'bg-gray-100 text-gray-500' },
  active:      { label: 'Ready to start', color: 'bg-blue-100 text-blue-600' },
  in_progress: { label: 'In progress',    color: 'bg-orange-100 text-orange-600' },
  delayed:     { label: 'Delayed',        color: 'bg-red-100 text-red-600' },
  completed:   { label: 'Completed',      color: 'bg-green-100 text-green-700' },
}

const SUB_STATUS_OPTIONS = [
  { value: 'in_progress',     label: '🟢 On Track',       color: 'border-green-400 bg-green-50 text-green-700' },
  { value: 'completed',       label: '✅ Completed',       color: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
  { value: 'pending',         label: '⏳ Pending',         color: 'border-gray-300 bg-gray-50 text-gray-600' },
  { value: 'delayed',         label: '🔴 Delayed',         color: 'border-red-400 bg-red-50 text-red-700' },
  { value: 'fail_inspection', label: '❌ Fail Inspection', color: 'border-red-500 bg-red-100 text-red-800' },
]

const MATERIALS_OPTIONS = [
  { value: 'not_ordered', label: '📦 Not yet ordered',     color: 'border-red-200 bg-red-50 text-red-700' },
  { value: 'ordered',     label: '🚚 Ordered / En route',  color: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'on_site',     label: '✅ Materials on site',   color: 'border-green-200 bg-green-50 text-green-700' },
  { value: 'not_needed',  label: '—  No materials needed', color: 'border-gray-200 bg-gray-50 text-gray-600' },
]

interface PortalMessage { id: string; sender: 'sub' | 'korvia'; content: string; created_at: string }
interface CommitForm {
  sub_start_date: string; sub_end_date: string; sub_notes: string
  sub_crew_size: string; sub_materials_status: string; sub_confirmed: boolean
  sub_quoted_cost: string
}
interface DateEdit { sub_start_date: string; sub_end_date: string; sub_notes?: string }
interface KorviaChat { message: string; sending: boolean; reply: string | null; downstreamNotified: number; downstreamAction: string }

function formatBytes(b: number) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
function fmtMoney(n: number | null | undefined) {
  if (!n && n !== 0) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function daysLabel(dateStr?: string | null) {
  if (!dateStr) return null
  try {
    const d = parseISO(dateStr)
    if (isToday(d)) return { text: 'Today', cls: 'text-orange-500' }
    const diff = differenceInDays(d, new Date())
    if (diff < 0) return { text: `${Math.abs(diff)}d ago`, cls: 'text-red-500' }
    return { text: `in ${diff}d`, cls: 'text-blue-500' }
  } catch { return null }
}

export default function GuestPortal() {
  const { projectId, subId } = useParams() as { projectId: string; subId: string }
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'info' | 'tasks' | 'messages' | 'files'>('info')

  // ── Security gate ──────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false)
  const [authed, setAuthed]           = useState(false)
  const [nameInput, setNameInput]     = useState('')
  const [authAttempts, setAuthAttempts] = useState(0)
  const [authError, setAuthError]     = useState('')

  // ── Portal messages ────────────────────────────────────────────────────────
  const [messages, setMessages]   = useState<PortalMessage[]>([])
  const [msgInput, setMsgInput]   = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Commitment modal ───────────────────────────────────────────────────────
  const [editTask, setEditTask]   = useState<any | null>(null)
  const [form, setForm]           = useState<CommitForm | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})

  // ── Status selector ────────────────────────────────────────────────────────
  const [statusSaving, setStatusSaving] = useState<string | null>(null)

  // ── Inline date edits ──────────────────────────────────────────────────────
  const [dateEdits, setDateEdits]   = useState<Record<string, DateEdit>>({})
  const [dateSaving, setDateSaving] = useState<string | null>(null)
  const [dateSaved, setDateSaved]   = useState<string | null>(null)

  // ── KORVIA per-task chat ────────────────────────────────────────────────────
  const [korviaChats, setKorviaChats] = useState<Record<string, KorviaChat>>({})
  const [korviaOpen, setKorviaOpen]   = useState<string | null>(null)

  // ── Fetch project data ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/portal/${projectId}/${subId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setMessages(d.messages ?? [])
        const edits: Record<string, DateEdit> = {}
        for (const t of d.tasks ?? []) {
          edits[t.id] = { sub_start_date: t.sub_start_date ?? '', sub_end_date: t.sub_end_date ?? '', sub_notes: t.sub_notes ?? '' }
        }
        setDateEdits(edits)
      })
      .catch(() => setError('Could not load project'))
      .finally(() => setLoading(false))
  }, [projectId, subId])

  // ── Check sessionStorage auth ──────────────────────────────────────────────
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`portal_auth_${subId}`) === '1') setAuthed(true)
    } catch {}
    setAuthChecked(true)
  }, [subId])

  // ── Auto-scroll messages to bottom ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Identity verification ──────────────────────────────────────────────────
  function handleAuth() {
    if (!data || authAttempts >= 3) return
    const entered = nameInput.trim().toLowerCase()
    const sub = data.sub
    const normName    = (sub.name    ?? '').trim().toLowerCase()
    const normCompany = (sub.company ?? '').trim().toLowerCase()
    // Flexible: exact, partial, or first-word match for name/company
    const matchName    = normName.includes(entered) || entered.includes(normName.split(' ')[0])
    const matchCompany = normCompany.includes(entered) || entered.includes(normCompany.split(' ')[0])
    const cleanPhone   = (sub.phone   ?? '').replace(/\D/g, '')
    const cleanEntered = nameInput.trim().replace(/\D/g, '')
    const matchPhone   = cleanEntered.length >= 4 && cleanPhone.endsWith(cleanEntered)
    if (entered.length >= 2 && (matchName || matchCompany || matchPhone)) {
      try { sessionStorage.setItem(`portal_auth_${subId}`, '1') } catch {}
      setAuthed(true)
    } else {
      const next = authAttempts + 1
      setAuthAttempts(next)
      if (next >= 3) setAuthError('Access locked. Contact your builder for a new link.')
      else setAuthError(`Incorrect. ${3 - next} attempt(s) remaining.`)
      setNameInput('')
    }
  }

  // ── Send portal message ────────────────────────────────────────────────────
  async function sendMessage() {
    if (!msgInput.trim() || msgSending) return
    setMsgSending(true)
    const content = msgInput.trim()
    setMsgInput('')
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', content }),
      })
      const json = await res.json()
      if (json.ok) {
        if (json.message)   setMessages(m => [...m, json.message])
        if (json.korviaReply) setMessages(m => [...m, json.korviaReply])
      }
    } catch { setMsgInput(content) }
    finally  { setMsgSending(false) }
  }

  // ── Commitment modal helpers ───────────────────────────────────────────────
  function openCommit(task: any) {
    setEditTask(task)
    setForm({
      sub_start_date:       task.sub_start_date ?? '',
      sub_end_date:         task.sub_end_date   ?? '',
      sub_notes:            task.sub_notes      ?? '',
      sub_crew_size:        task.sub_crew_size   ? String(task.sub_crew_size) : '',
      sub_materials_status: task.sub_materials_status ?? '',
      sub_confirmed:        task.sub_confirmed  ?? false,
      sub_quoted_cost:      task.sub_quoted_cost ? String(task.sub_quoted_cost) : '',
    })
  }

  async function handleSave() {
    if (!editTask || !form) return
    setSaving(true)
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: editTask.id,
          sub_start_date: form.sub_start_date || null, sub_end_date: form.sub_end_date || null,
          sub_notes: form.sub_notes || null,
          sub_crew_size: form.sub_crew_size ? parseInt(form.sub_crew_size) : null,
          sub_materials_status: form.sub_materials_status || null,
          sub_confirmed: form.sub_confirmed,
          sub_quoted_cost: form.sub_quoted_cost ? parseFloat(form.sub_quoted_cost) : null,
        }),
      })
      const json = await res.json()
      setConflicts(c => ({ ...c, [editTask.id]: json.conflicts?.length ? json.conflicts : [] }))
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) => t.id === editTask.id
        ? { ...t, ...form, sub_crew_size: form.sub_crew_size ? parseInt(form.sub_crew_size) : null,
            sub_quoted_cost: form.sub_quoted_cost ? parseFloat(form.sub_quoted_cost) : null } : t) }))
      setSaved(editTask.id); setTimeout(() => setSaved(null), 3000); setEditTask(null)
    } finally { setSaving(false) }
  }

  async function handleStatusChange(taskId: string, newStatus: string) {
    setStatusSaving(taskId)
    try {
      const isFailInspection = newStatus === 'fail_inspection'
      const actualStatus = isFailInspection ? 'delayed' : newStatus
      await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status: actualStatus, ...(isFailInspection ? { inspection_status: 'failed' } : {}) }),
      })
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) => t.id === taskId
        ? { ...t, status: actualStatus, ...(isFailInspection ? { inspection_status: 'failed' } : {}) } : t) }))
    } finally { setStatusSaving(null) }
  }

  async function saveDateEdit(taskId: string) {
    const edit = dateEdits[taskId]; if (!edit) return
    setDateSaving(taskId)
    try {
      await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, sub_start_date: edit.sub_start_date || null, sub_end_date: edit.sub_end_date || null, sub_notes: edit.sub_notes || null }),
      })
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) => t.id === taskId
        ? { ...t, sub_start_date: edit.sub_start_date || null, sub_end_date: edit.sub_end_date || null, sub_notes: edit.sub_notes || null } : t) }))
      setDateSaved(taskId); setTimeout(() => setDateSaved(null), 2500)
    } finally { setDateSaving(null) }
  }

  function getKorviaChat(taskId: string): KorviaChat {
    return korviaChats[taskId] ?? { message: '', sending: false, reply: null, downstreamNotified: 0, downstreamAction: 'none' }
  }
  function setKorviaChat(taskId: string, updates: Partial<KorviaChat>) {
    setKorviaChats(s => ({ ...s, [taskId]: { ...getKorviaChat(taskId), ...updates } }))
  }

  async function sendToKorvia(taskId: string) {
    const chat = getKorviaChat(taskId)
    if (!chat.message.trim() || chat.sending) return
    setKorviaChat(taskId, { sending: true, reply: null })
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}/korvia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, message: chat.message }),
      })
      const json = await res.json()
      setKorviaChat(taskId, { sending: false, reply: json.korviaReply ?? 'Message received.',
        downstreamNotified: json.downstreamNotified ?? 0, downstreamAction: json.downstreamAction ?? 'none' })
      if (json.newDates?.sub_start_date || json.newDates?.sub_end_date) {
        setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) => t.id === taskId ? { ...t, ...json.newDates } : t) }))
        setDateEdits(e => ({ ...e, [taskId]: {
          sub_start_date: json.newDates.sub_start_date ?? e[taskId]?.sub_start_date ?? '',
          sub_end_date:   json.newDates.sub_end_date   ?? e[taskId]?.sub_end_date   ?? '' } }))
      }
    } catch { setKorviaChat(taskId, { sending: false, reply: 'Could not reach KORVIA. Try again.' }) }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading || !authChecked) return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="text-5xl">🔗</div>
      <h2 className="font-bold text-[#1A2B4A] text-lg">Access not found</h2>
      <p className="text-gray-500 text-sm">This portal link may be invalid.<br/>Contact your builder for a new link.</p>
    </div>
  )

  // ── Security gate ──────────────────────────────────────────────────────────
  if (!authed) {
    const locked = authAttempts >= 3
    return (
      <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center gap-3 mb-8">
            <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-16 w-16 rounded-2xl shadow-2xl"/>
            <h1 className="text-white text-2xl font-bold">Brivox Portal</h1>
            {data && <p className="text-white/60 text-sm text-center">{data.project.name}</p>}
          </div>
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{locked ? '🔒' : '🔐'}</span>
              <div>
                <p className="text-white font-bold text-sm">Verify your identity</p>
                <p className="text-white/50 text-xs">Enter your name or company name to continue</p>
              </div>
            </div>
            {!locked ? (
              <>
                <input type="text" placeholder="Your name, company, or last 4 of phone"
                  value={nameInput} autoFocus
                  onChange={e => { setNameInput(e.target.value); setAuthError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  className="w-full bg-white/20 text-white placeholder-white/40 border border-white/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-white/60 mb-3"/>
                {authError && <p className="text-red-300 text-xs mb-3 text-center">{authError}</p>}
                <button onClick={handleAuth} disabled={!nameInput.trim()}
                  className="w-full py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-50 transition active:scale-[0.98]">
                  Access my portal →
                </button>
              </>
            ) : (
              <p className="text-red-300 text-sm text-center py-2 font-semibold">{authError}</p>
            )}
          </div>
          <p className="text-white/30 text-xs text-center mt-6">Powered by Brivox · Oklahoma Construction Management</p>
        </div>
      </div>
    )
  }

  // ── Main portal ────────────────────────────────────────────────────────────
  const { project, sub, tasks, files } = data
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(project.address)}`
  const filesByCategory = FILE_CATEGORIES.filter(cat => files.some((f: any) => f.category === cat.value))
  const completedCount  = tasks.filter((t: any) => t.status === 'completed').length

  return (
    <div className="min-h-screen bg-[#F4F6F9] max-w-[480px] mx-auto pb-10">

      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <img src="/brivox-logo-dark.svg" alt="" className="h-7 w-7 rounded-lg"/>
          <span className="text-white/50 text-xs font-medium">Brivox — Project Portal</span>
        </div>
        <h1 className="text-white text-xl font-bold leading-tight">{project.name}</h1>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="text-white/50 text-xs flex items-center gap-1 mt-1 underline underline-offset-2">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {project.address}
        </a>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-white text-xs font-medium">{sub.company}</span>
            {sub.trade && <span className="text-white/50 text-xs">· {sub.trade}</span>}
          </div>
          {tasks.length > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <span className="text-white text-xs">{completedCount}/{tasks.length} done</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        {[
          { key: 'info',     label: 'Project',              icon: '🏗️' },
          { key: 'tasks',    label: `Tasks (${tasks.length})`, icon: '📋' },
          { key: 'messages', label: `Msgs (${messages.length})`, icon: '💬' },
          { key: 'files',    label: `Files (${files.length})`, icon: '📐' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-0.5 border-b-2 transition ${
              tab === t.key ? 'border-[#2E7CF6] text-[#2E7CF6]' : 'border-transparent text-gray-400'
            }`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── PROJECT TAB ── */}
      {tab === 'info' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">PROJECT DETAILS</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Row label="Project"  value={project.name}/>
              <Row label="Status"   value={project.status?.replace('_',' ') ?? 'Active'}/>
              <Row label="Start"    value={project.start_date ? format(parseISO(project.start_date), 'MMM d, yyyy') : '—'}/>
              <Row label="Est. End" value={project.estimated_end_date ? format(parseISO(project.estimated_end_date), 'MMM d, yyyy') : '—'}/>
            </div>
          </div>

          {tasks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <div>
                    <p className="text-sm font-bold text-[#1A2B4A]">Project Management</p>
                    <p className="text-xs text-gray-400">Set your actual start & end dates for each task</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {tasks.map((task: any) => {
                  const edit = dateEdits[task.id] ?? { sub_start_date: '', sub_end_date: '' }
                  const isSaving = dateSaving === task.id
                  const isSaved  = dateSaved  === task.id
                  const modified = edit.sub_start_date !== (task.sub_start_date ?? '') || edit.sub_end_date !== (task.sub_end_date ?? '')
                  return (
                    <div key={task.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-[#1A2B4A]">{task.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_CONFIG[task.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_CONFIG[task.status]?.label ?? task.status}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs text-gray-400 mb-2">
                        <span>Builder: {task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'} → {task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">My Start</p>
                          <input type="date" className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                            value={edit.sub_start_date}
                            onChange={e => setDateEdits(d => ({ ...d, [task.id]: { ...edit, sub_start_date: e.target.value } }))}/>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">My End</p>
                          <input type="date" className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                            value={edit.sub_end_date}
                            onChange={e => setDateEdits(d => ({ ...d, [task.id]: { ...edit, sub_end_date: e.target.value } }))}/>
                        </div>
                      </div>
                      <button disabled={isSaving || (!modified && !isSaved)} onClick={() => saveDateEdit(task.id)}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition ${
                          isSaved ? 'bg-green-500 text-white' : modified ? 'bg-[#2E7CF6] text-white active:scale-[0.97]' : 'bg-gray-100 text-gray-400'
                        }`}>
                        {isSaving ? 'Saving…' : isSaved ? '✅ Saved!' : modified ? '💾 Save dates' : '— No changes —'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">YOUR REGISTRATION</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Row label="Company" value={sub.company}/>
              <Row label="Contact" value={sub.name}/>
              <Row label="Trade"   value={sub.trade}/>
              {sub.phone && <Row label="Phone" value={sub.phone}/>}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="text-xs font-bold text-blue-700 mb-1">KORVIA is tracking your schedule</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                Update your dates above or go to <strong>Tasks</strong> to update status.
                Use <strong>Messages</strong> to send notes to KORVIA — she'll alert your builder instantly.
              </p>
            </div>
          </div>

          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="w-full py-3.5 rounded-2xl bg-[#1A2B4A] text-white font-bold text-sm flex items-center justify-center gap-2">
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Open in Google Maps
          </a>
        </div>
      )}

      {/* ── TASKS TAB ── */}
      {tab === 'tasks' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-lg mt-0.5">🤖</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              <strong>Keep the builder in the loop.</strong> Update your status, submit your quote price,
              and use KORVIA chat if anything changes — she&apos;ll notify your builder automatically.
            </p>
          </div>

          {tasks.length === 0
            ? <div className="text-center py-8 text-gray-400 text-sm">No tasks assigned yet</div>
            : tasks.map((task: any) => {
              const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
              const startLabel = daysLabel(task.start_date)
              const hasCommitment = task.sub_start_date || task.sub_end_date || task.sub_confirmed
              const taskConflicts = conflicts[task.id] ?? []
              const chat = getKorviaChat(task.id)
              const isKorviaOpen = korviaOpen === task.id
              const currentSubStatus = task.inspection_status === 'failed' ? 'fail_inspection' : task.status
              const quotedMoney = fmtMoney(task.sub_quoted_cost)

              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-bold text-[#1A2B4A]">{task.name}</p>
                        {quotedMoney && <p className="text-xs text-emerald-600 font-semibold mt-0.5">💵 Quoted: {quotedMoney}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                    </div>

                    <p className="text-xs font-semibold text-gray-400 mb-1.5">UPDATE STATUS</p>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {SUB_STATUS_OPTIONS.map(opt => (
                        <button key={opt.value} disabled={statusSaving === task.id}
                          onClick={() => handleStatusChange(task.id, opt.value)}
                          className={`py-2 px-2 rounded-xl border-2 text-xs font-semibold transition active:scale-[0.97] ${
                            currentSubStatus === opt.value ? opt.color + ' border-current' : 'border-gray-100 text-gray-400 hover:border-gray-200'
                          } ${statusSaving === task.id ? 'opacity-50' : ''}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <p className="text-xs font-semibold text-gray-400 mb-1.5">BUILDER&apos;S PLAN</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned Start</p>
                        <p className="font-bold text-gray-700 text-sm">{task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'}</p>
                        {startLabel && <p className={`text-xs mt-0.5 ${startLabel.cls}`}>{startLabel.text}</p>}
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned End</p>
                        <p className="font-bold text-gray-700 text-sm">{task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</p>
                        {task.start_date && task.end_date && (
                          <p className="text-xs text-gray-400">{differenceInDays(parseISO(task.end_date), parseISO(task.start_date))}d</p>
                        )}
                      </div>
                    </div>

                    {task.notes && (
                      <div className="bg-amber-50 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs text-amber-700 font-semibold mb-0.5">📝 Builder note</p>
                        <p className="text-xs text-amber-600">{task.notes}</p>
                      </div>
                    )}

                    {hasCommitment && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs font-semibold text-blue-600 mb-1">YOUR COMMITMENT</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {task.sub_start_date && <span className="text-blue-700">▶ {format(parseISO(task.sub_start_date), 'MMM d')}</span>}
                          {task.sub_end_date   && <span className="text-blue-700">⏹ {format(parseISO(task.sub_end_date), 'MMM d')}</span>}
                          {task.sub_crew_size  && <span className="text-blue-700">👷 {task.sub_crew_size} crew</span>}
                          {task.sub_materials_status && <span className="text-blue-700">{MATERIALS_OPTIONS.find(m => m.value === task.sub_materials_status)?.label ?? task.sub_materials_status}</span>}
                          {task.sub_confirmed && <span className="text-green-700 font-semibold">✅ Confirmed</span>}
                        </div>
                        {task.sub_notes && <p className="text-xs text-blue-600 mt-1 italic">&ldquo;{task.sub_notes}&rdquo;</p>}
                      </div>
                    )}

                    {taskConflicts.length > 0 && (
                      <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs font-bold text-red-600 mb-1">⚠️ KORVIA alert</p>
                        {taskConflicts.map((c: string, i: number) => <p key={i} className="text-xs text-red-500">{c}</p>)}
                      </div>
                    )}

                    {/* ── Inline date + notes editing ────────────────────── */}
                    <div className="border-t border-gray-100 mt-3 pt-3">
                      <p className="text-xs font-semibold text-gray-400 mb-2">📅 MY WORK DATES</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">My Start</p>
                          <input type="date"
                            className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                            value={dateEdits[task.id]?.sub_start_date ?? ''}
                            onChange={e => setDateEdits(d => ({ ...d, [task.id]: { ...d[task.id], sub_start_date: e.target.value } }))}/>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">My End</p>
                          <input type="date"
                            className="w-full text-xs border border-gray-200 rounded-xl px-2 py-1.5 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                            value={dateEdits[task.id]?.sub_end_date ?? ''}
                            onChange={e => setDateEdits(d => ({ ...d, [task.id]: { ...d[task.id], sub_end_date: e.target.value } }))}/>
                        </div>
                      </div>
                      <textarea rows={2}
                        placeholder="Note for the builder (optional)…"
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-blue-400 resize-none mb-2"
                        value={dateEdits[task.id]?.sub_notes ?? ''}
                        onChange={e => setDateEdits(d => ({ ...d, [task.id]: { ...d[task.id], sub_notes: e.target.value } }))}/>
                      <button
                        disabled={dateSaving === task.id}
                        onClick={() => saveDateEdit(task.id)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition active:scale-[0.97] ${
                          dateSaved === task.id ? 'bg-green-500 text-white' : 'bg-[#2E7CF6] text-white'
                        }`}>
                        {dateSaving === task.id ? 'Saving…' : dateSaved === task.id ? '✅ Saved!' : '💾 Save dates & note'}
                      </button>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button onClick={() => openCommit(task)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 border-gray-200 text-gray-500 hover:border-gray-300 flex items-center justify-center gap-1 transition active:scale-[0.97]">
                        ⚙️ More options
                      </button>
                      <button onClick={() => setKorviaOpen(isKorviaOpen ? null : task.id)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition flex items-center gap-1 ${
                          isKorviaOpen ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-purple-300'
                        }`}>
                        🤖 KORVIA
                      </button>
                    </div>

                    {isKorviaOpen && (
                      <div className="mt-3 border border-purple-100 rounded-2xl overflow-hidden">
                        <div className="bg-purple-50 px-3 py-2.5 flex items-start gap-2">
                          <span className="text-lg">🤖</span>
                          <div>
                            <p className="text-xs font-bold text-purple-700">Chat with KORVIA</p>
                            <p className="text-xs text-purple-500 leading-relaxed">
                              Tell KORVIA about any delay or issue. She&apos;ll update the schedule and notify your builder.
                            </p>
                          </div>
                        </div>
                        {chat.reply && (
                          <div className="px-3 py-2 bg-white">
                            <div className="bg-purple-50 rounded-xl px-3 py-2.5">
                              <p className="text-xs font-bold text-purple-700 mb-1">🤖 KORVIA:</p>
                              <p className="text-xs text-purple-800 leading-relaxed">{chat.reply}</p>
                              {chat.downstreamNotified > 0 && (
                                <p className="text-xs text-purple-600 mt-2 font-semibold border-t border-purple-100 pt-2">
                                  {chat.downstreamAction === 'postpone'
                                    ? `🔁 Shifted ${chat.downstreamNotified} downstream task(s) and sent SMS to subs.`
                                    : `🔀 Sent parallel work alert to ${chat.downstreamNotified} sub(s).`}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="px-3 pb-3 pt-2 bg-white flex flex-col gap-2">
                          <textarea rows={3}
                            placeholder="e.g. The concrete supplier is delayed 2 days — won't be ready until Thursday..."
                            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-purple-400 resize-none"
                            value={chat.message}
                            onChange={e => setKorviaChat(task.id, { message: e.target.value })}/>
                          <button disabled={!chat.message.trim() || chat.sending} onClick={() => sendToKorvia(task.id)}
                            className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
                            {chat.sending
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> KORVIA is analyzing…</>
                              : '📤 Send to KORVIA'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── MESSAGES TAB ── */}
      {tab === 'messages' && (
        <div className="flex flex-col" style={{ height: 'calc(100dvh - 165px)' }}>
          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                <span className="text-5xl">🤖</span>
                <p className="text-gray-600 text-sm font-semibold">No messages yet</p>
                <p className="text-gray-400 text-xs max-w-[220px] leading-relaxed">
                  Send a message to KORVIA and she will relay it to the builder instantly.
                </p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === 'sub' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.sender === 'korvia' && (
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                    msg.sender === 'sub'
                      ? 'bg-[#1A2B4A] text-white rounded-br-sm'
                      : 'bg-white border border-purple-100 text-[#1A2B4A] rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.sender === 'korvia' && (
                      <p className="text-xs font-bold text-purple-600 mb-1">KORVIA AI</p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1.5 ${msg.sender === 'sub' ? 'text-white/50' : 'text-gray-400'}`}>
                      {msg.created_at ? format(parseISO(msg.created_at), 'MMM d, h:mm a') : 'Just now'}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Input bar */}
          <div className="bg-white border-t border-gray-100 px-4 py-3">
            <div className="flex gap-2 items-end">
              <textarea rows={2}
                placeholder="Send a message to KORVIA…"
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                className="flex-1 text-sm border border-gray-200 rounded-2xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-purple-400 resize-none"/>
              <button onClick={sendMessage} disabled={!msgInput.trim() || msgSending}
                className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0 transition active:scale-[0.95]">
                {msgSending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                }
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">KORVIA will relay your message to the builder</p>
          </div>
        </div>
      )}

      {/* ── FILES TAB ── */}
      {tab === 'files' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          {files.length === 0
            ? <div className="text-center py-8 text-gray-400 text-sm">No files available yet</div>
            : filesByCategory.map(cat => (
              <div key={cat.value}>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">{cat.icon} {cat.label}</p>
                <div className="flex flex-col gap-2">
                  {files.filter((f: any) => f.category === cat.value).map((file: any) => (
                    <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                        {file.file_type?.includes('pdf') ? '📄' : file.file_type?.includes('image') ? '🖼️' : '📁'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1A2B4A] truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(file.file_size)} · {file.uploaded_at ? format(parseISO(file.uploaded_at), 'MMM d, yyyy') : ''}</p>
                      </div>
                      <svg width="18" height="18" fill="none" stroke="#3B82F6" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      )}

      <p className="text-center text-xs text-gray-400 pb-2 mt-2">
        Powered by Brivox · Oklahoma Construction Management
      </p>

      {/* ── Commitment Modal ── */}
      {editTask && form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setEditTask(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="text-base font-bold text-[#1A2B4A]">My Commitment</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{editTask.name}</p>
                </div>
                <button onClick={() => setEditTask(null)} className="p-1 text-gray-400">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2 mt-3 flex gap-4 text-xs text-center">
                <div className="flex-1">
                  <p className="text-gray-400">Planned Start</p>
                  <p className="font-bold text-gray-600">{editTask.start_date ? format(parseISO(editTask.start_date), 'MMM d') : '—'}</p>
                </div>
                <div className="w-px bg-gray-200"/>
                <div className="flex-1">
                  <p className="text-gray-400">Planned End</p>
                  <p className="font-bold text-gray-600">{editTask.end_date ? format(parseISO(editTask.end_date), 'MMM d') : '—'}</p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-6 flex flex-col gap-4 mt-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📅 MY ACTUAL DATES</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">My Start</p>
                    <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                      value={form.sub_start_date} onChange={e => setForm(f => f ? { ...f, sub_start_date: e.target.value } : f)}/>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">My End</p>
                    <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                      value={form.sub_end_date} onChange={e => setForm(f => f ? { ...f, sub_end_date: e.target.value } : f)}/>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">💵 MY QUOTED PRICE (optional)</label>
                <p className="text-xs text-gray-400 mb-2">Enter your price for this task. KORVIA will compare it against the builder's estimate and send an alert if it differs.</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">$</span>
                  <input type="number" min="0" placeholder="e.g. 18500"
                    className="w-full text-sm border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-[#1A2B4A] font-semibold focus:outline-none focus:border-emerald-400"
                    value={form.sub_quoted_cost} onChange={e => setForm(f => f ? { ...f, sub_quoted_cost: e.target.value } : f)}/>
                </div>
                {form.sub_quoted_cost && parseFloat(form.sub_quoted_cost) > 0 && (
                  <p className="text-xs text-emerald-600 mt-1.5">✓ KORVIA will notify the builder with this quote.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">👷 CREW SIZE</label>
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3,4,5,6,8,10].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => f ? { ...f, sub_crew_size: String(n) } : f)}
                      className={`w-12 h-10 rounded-xl border-2 text-sm font-bold transition ${
                        form.sub_crew_size === String(n) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>{n}</button>
                  ))}
                  <input type="number" min="1" max="50" placeholder="Other"
                    className="w-16 h-10 text-center text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    value={!['1','2','3','4','5','6','8','10'].includes(form.sub_crew_size) ? form.sub_crew_size : ''}
                    onChange={e => setForm(f => f ? { ...f, sub_crew_size: e.target.value } : f)}/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📦 MATERIALS STATUS</label>
                <div className="flex flex-col gap-2">
                  {MATERIALS_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => f ? { ...f, sub_materials_status: opt.value } : f)}
                      className={`w-full py-2.5 px-3 rounded-xl border-2 text-left text-xs font-semibold transition ${
                        form.sub_materials_status === opt.value ? opt.color + ' border-current' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>{opt.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📝 UPDATE / NOTE</label>
                <textarea rows={3} placeholder="e.g. Material delayed 1 day — will work in parallel with HVAC on Friday..."
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-blue-400 resize-none"
                  value={form.sub_notes} onChange={e => setForm(f => f ? { ...f, sub_notes: e.target.value } : f)}/>
              </div>

              <button type="button" onClick={() => setForm(f => f ? { ...f, sub_confirmed: !f.sub_confirmed } : f)}
                className={`w-full py-3 rounded-2xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition ${
                  form.sub_confirmed ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'
                }`}>
                {form.sub_confirmed ? '✅ Schedule Confirmed' : '☑️ Confirm my commitment'}
              </button>

              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Saving…</> : '💾 Save My Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="font-semibold text-[#1A2B4A] text-right capitalize">{value}</span>
    </div>
  )
}
