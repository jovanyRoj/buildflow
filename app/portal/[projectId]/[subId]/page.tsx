'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday } from 'date-fns'

// ─── constants ────────────────────────────────────────────────────────────────
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
const WORK_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const REPORT_TYPES = [
  { value: 'material_missing',  label: '📦 Missing Material',   desc: 'Material the builder needs to purchase' },
  { value: 'safety_concern',    label: '⚠️ Safety Concern',     desc: 'Unsafe condition on site' },
  { value: 'schedule_conflict', label: '📅 Schedule Conflict',  desc: 'Timing conflict with another trade' },
  { value: 'damage',            label: '🔨 Damage Found',       desc: 'Existing damage or defect found' },
  { value: 'other',             label: '📝 Other',              desc: 'General report or note' },
]

// ─── types ────────────────────────────────────────────────────────────────────
interface PortalMessage { id: string; sender: 'sub' | 'korvia'; content: string; created_at: string }
interface Estimate { id?: string; type: 'project' | 'task'; task_id?: string; amount: string; notes: string }
interface Schedule { sub_arrival_time: string; sub_work_days: string[]; sub_schedule_notes: string }
interface ReportForm { type: string; task_id: string; description: string; urgency: string }

// ─── helpers ──────────────────────────────────────────────────────────────────
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
function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-[#1A2B4A] font-medium text-right">{value}</span>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────
export default function GuestPortal() {
  const { projectId, subId } = useParams() as { projectId: string; subId: string }
  const [data, setData]         = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState<'info'|'tasks'|'estimate'|'schedule'|'report'|'messages'>('info')

  // auth
  const [authChecked, setAuthChecked] = useState(false)
  const [authed, setAuthed]           = useState(false)
  const [nameInput, setNameInput]     = useState('')
  const [authAttempts, setAuthAttempts] = useState(0)
  const [authError, setAuthError]     = useState('')

  // messages
  const [messages, setMessages]     = useState<PortalMessage[]>([])
  const [msgInput, setMsgInput]     = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // task status
  const [statusSaving, setStatusSaving] = useState<string|null>(null)

  // date edits (project info tab)
  const [dateEdits, setDateEdits]   = useState<Record<string,{sub_start_date:string;sub_end_date:string;sub_notes:string}>>({})
  const [dateSaving, setDateSaving] = useState<string|null>(null)
  const [dateSaved, setDateSaved]   = useState<string|null>(null)

  // file upload per task
  const [uploads, setUploads]       = useState<Record<string,{file:File|null;notes:string;uploading:boolean;done:boolean}>>({})

  // estimate
  const [estimates, setEstimates]     = useState<Estimate[]>([])
  const [estSaving, setEstSaving]     = useState(false)
  const [estSaved, setEstSaved]       = useState(false)

  // schedule (per task)
  const [schedules, setSchedules]     = useState<Record<string, Schedule>>({})
  const [schSaving, setSchSaving]     = useState<string|null>(null)
  const [schSaved, setSchSaved]       = useState<string|null>(null)

  // report
  const [report, setReport]           = useState<ReportForm>({ type: '', task_id: '', description: '', urgency: 'normal' })
  const [repSending, setRepSending]   = useState(false)
  const [repSent, setRepSent]         = useState(false)

  // korvia chat per task
  const [korviaChats, setKorviaChats] = useState<Record<string,{message:string;sending:boolean;reply:string|null}>>({})
  const [korviaOpen, setKorviaOpen]   = useState<string|null>(null)


  // ── data fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/portal/${projectId}/${subId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setMessages(d.messages ?? [])
        // init schedules from task data
        const sch: Record<string,Schedule> = {}
        for (const t of d.tasks ?? []) {
          sch[t.id] = {
            sub_arrival_time:  t.sub_arrival_time  ?? '',
            sub_work_days:     t.sub_work_days ? t.sub_work_days.split(',') : [],
            sub_schedule_notes: t.sub_schedule_notes ?? '',
          }
        }
        setSchedules(sch)
      })
      .catch(() => setError('Could not load project'))
      .finally(() => setLoading(false))
  }, [projectId, subId])

  // load existing estimates after auth
  useEffect(() => {
    if (!authed || !data) return
    fetch(`/api/portal/${projectId}/${subId}/estimate`)
      .then(r => r.json())
      .then(d => {
        if (!d.estimates?.length) {
          // seed empty forms: one project-level + one per task
          const initial: Estimate[] = [{ type: 'project', amount: '', notes: '' }]
          for (const t of data.tasks ?? []) {
            initial.push({ type: 'task', task_id: t.id, amount: '', notes: '' })
          }
          setEstimates(initial)
        } else {
          setEstimates(d.estimates.map((e: any) => ({
            ...e, amount: e.amount ? String(e.amount) : '',
          })))
        }
      })
      .catch(() => {})
  }, [authed, data])

  useEffect(() => {
    try {
      if (sessionStorage.getItem(`portal_auth_${subId}`) === '1') setAuthed(true)
    } catch {}
    setAuthChecked(true)
  }, [subId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])


  // ── auth ────────────────────────────────────────────────────────────────
  function handleAuth() {
    if (!data || authAttempts >= 3) return
    const entered = nameInput.trim().toLowerCase()
    const sub = data.sub
    const normName    = (sub.name    ?? '').trim().toLowerCase()
    const normCompany = (sub.company ?? '').trim().toLowerCase()
    const matchName    = normName.includes(entered) || entered.includes(normName.split(' ')[0])
    const matchCompany = normCompany.includes(entered) || entered.includes(normCompany.split(' ')[0])
    const cleanPhone   = (sub.phone ?? '').replace(/\D/g, '')
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

  // ── messages ────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!msgInput.trim() || msgSending) return
    setMsgSending(true)
    const content = msgInput.trim()
    setMsgInput('')
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', content }),
      })
      const json = await res.json()
      if (json.ok) {
        if (json.message)     setMessages(m => [...m, json.message])
        if (json.korviaReply) setMessages(m => [...m, json.korviaReply])
      }
    } catch { setMsgInput(content) }
    finally  { setMsgSending(false) }
  }

  // ── task status ─────────────────────────────────────────────────────────
  async function handleStatusChange(taskId: string, newStatus: string) {
    setStatusSaving(taskId)
    try {
      const isFailInspection = newStatus === 'fail_inspection'
      const actualStatus = isFailInspection ? 'delayed' : newStatus
      await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status: actualStatus, ...(isFailInspection ? { inspection_status: 'failed' } : {}) }),
      })
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) =>
        t.id === taskId ? { ...t, status: actualStatus, ...(isFailInspection ? { inspection_status: 'failed' } : {}) } : t
      )}))
    } finally { setStatusSaving(null) }
  }


  // ── estimates ────────────────────────────────────────────────────────────
  function updateEst(idx: number, field: keyof Estimate, val: string) {
    setEstimates(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }
  async function saveEstimates() {
    setEstSaving(true)
    try {
      for (const est of estimates) {
        const amount = parseFloat(est.amount)
        if (isNaN(amount) || amount <= 0) continue
        await fetch(`/api/portal/${projectId}/${subId}/estimate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: est.type, task_id: est.task_id ?? undefined, amount, notes: est.notes }),
        })
      }
      setEstSaved(true); setTimeout(() => setEstSaved(false), 3000)
    } finally { setEstSaving(false) }
  }

  // ── schedule ─────────────────────────────────────────────────────────────
  function toggleDay(taskId: string, day: string) {
    setSchedules(prev => {
      const cur = prev[taskId] ?? { sub_arrival_time: '', sub_work_days: [], sub_schedule_notes: '' }
      const days = cur.sub_work_days.includes(day)
        ? cur.sub_work_days.filter(d => d !== day)
        : [...cur.sub_work_days, day]
      return { ...prev, [taskId]: { ...cur, sub_work_days: days } }
    })
  }
  async function saveSchedule(taskId: string) {
    const sch = schedules[taskId]; if (!sch) return
    setSchSaving(taskId)
    try {
      await fetch(`/api/portal/${projectId}/${subId}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          sub_arrival_time:   sch.sub_arrival_time || null,
          sub_work_days:      sch.sub_work_days.join(',') || null,
          sub_schedule_notes: sch.sub_schedule_notes || null,
        }),
      })
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) => t.id === taskId
        ? { ...t, sub_arrival_time: sch.sub_arrival_time, sub_work_days: sch.sub_work_days.join(','), sub_schedule_notes: sch.sub_schedule_notes } : t
      )}))
      setSchSaved(taskId); setTimeout(() => setSchSaved(null), 2500)
    } finally { setSchSaving(null) }
  }

  // ── report ────────────────────────────────────────────────────────────────
  async function submitReport() {
    if (!report.type || !report.description.trim()) return
    setRepSending(true)
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, task_id: report.task_id || undefined }),
      })
      const json = await res.json()
      if (json.ok) {
        setRepSent(true)
        setReport({ type: '', task_id: '', description: '', urgency: 'normal' })
        setTimeout(() => setRepSent(false), 5000)
      }
    } finally { setRepSending(false) }
  }

  // ── korvia chat ──────────────────────────────────────────────────────────
  function getChat(taskId: string) { return korviaChats[taskId] ?? { message: '', sending: false, reply: null } }
  function setChat(taskId: string, u: Partial<{message:string;sending:boolean;reply:string|null}>) {
    setKorviaChats(s => ({ ...s, [taskId]: { ...getChat(taskId), ...u } }))
  }
  async function sendToKorvia(taskId: string) {
    const chat = getChat(taskId)
    if (!chat.message.trim() || chat.sending) return
    setChat(taskId, { sending: true, reply: null })
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}/korvia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, message: chat.message }),
      })
      const json = await res.json()
      setChat(taskId, { sending: false, reply: json.korviaReply ?? 'Message received.' })
    } catch { setChat(taskId, { sending: false, reply: 'Could not reach KORVIA. Try again.' }) }
  }


  // ── date save (info tab) ────────────────────────────────────────────────
  async function handleDateSave(taskId: string) {
    const task = data?.tasks?.find((t: any) => t.id === taskId)
    const edit = dateEdits[taskId] ?? {
      sub_start_date: task?.sub_start_date ?? task?.start_date ?? '',
      sub_end_date:   task?.sub_end_date   ?? task?.end_date   ?? '',
      sub_notes: '',
    }
    setDateSaving(taskId)
    try {
      await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          sub_start_date: edit.sub_start_date || null,
          sub_end_date:   edit.sub_end_date   || null,
        }),
      })
      setData((d: any) => ({ ...d, tasks: d.tasks.map((t: any) =>
        t.id === taskId ? { ...t, sub_start_date: edit.sub_start_date, sub_end_date: edit.sub_end_date } : t
      )}))
      setDateSaved(taskId); setTimeout(() => setDateSaved(null), 2500)
    } finally { setDateSaving(null) }
  }

  // ── file upload ──────────────────────────────────────────────────────────
  async function handleUpload(taskId: string) {
    const up = uploads[taskId]; if (!up?.file) return
    setUploads(s => ({ ...s, [taskId]: { ...up, uploading: true, done: false } }))
    try {
      const fd = new FormData()
      fd.append('file', up.file)
      fd.append('taskId', taskId)
      if (up.notes) fd.append('notes', up.notes)
      const res = await fetch(`/api/portal/${projectId}/${subId}/upload`, { method: 'POST', body: fd })
      const json = await res.json()
      if (json.ok) {
        setUploads(s => ({ ...s, [taskId]: { file: null, notes: '', uploading: false, done: true } }))
        setData((d: any) => ({ ...d, files: [...(d.files ?? []), json.file] }))
        setTimeout(() => setUploads(s => ({ ...s, [taskId]: { ...s[taskId], done: false } })), 3000)
      } else {
        setUploads(s => ({ ...s, [taskId]: { ...up, uploading: false } }))
      }
    } catch {
      setUploads(s => ({ ...s, [taskId]: { ...up, uploading: false } }))
    }
  }

  // ── loading / error ──────────────────────────────────────────────────────
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

  // ── security gate ────────────────────────────────────────────────────────
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
                <p className="text-white/50 text-xs">Enter your name or company to continue</p>
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
          <p className="text-white/30 text-xs text-center mt-6">Powered by Brivox · Construction Management</p>
        </div>
      </div>
    )
  }


  // ── main portal ───────────────────────────────────────────────────────────
  const { project, sub, tasks, files } = data
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(project.address)}`
  const completedCount = tasks.filter((t: any) => t.status === 'completed').length

  const TABS = [
    { key: 'info',     label: 'Project',  icon: '🏗️' },
    { key: 'tasks',    label: 'Tasks',    icon: '📋' },
    { key: 'estimate', label: 'Estimate', icon: '💰' },
    { key: 'schedule', label: 'Schedule', icon: '🗓️' },
    { key: 'report',   label: 'Report',   icon: '⚠️' },
    { key: 'messages', label: 'Messages', icon: '💬' },
  ]

  return (
    <div className="min-h-screen bg-[#F4F6F9] max-w-[480px] mx-auto pb-12">

      {/* ── Disclaimer banner ─────────────────────────────────────────────── */}
      <div className="bg-amber-500 px-4 py-2.5 flex items-start gap-2">
        <span className="text-white text-sm mt-0.5">📋</span>
        <p className="text-white text-xs leading-relaxed font-medium">
          All estimates submitted here are preliminary and subject to modification,
          provided the builder approves and the subcontractor agrees in writing before final payment.
        </p>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-[#1A2B4A] px-5 pt-8 pb-5">
        <div className="flex items-center gap-2 mb-3">
          <img src="/brivox-logo-dark.svg" alt="" className="h-6 w-6 rounded-lg"/>
          <span className="text-white/50 text-xs font-medium">Brivox — Sub Portal</span>
        </div>
        <h1 className="text-white text-xl font-bold leading-tight">{project.name}</h1>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="text-white/50 text-xs flex items-center gap-1 mt-1 underline underline-offset-2">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {project.address}
        </a>
        <div className="mt-3 flex gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <span className="text-white text-xs font-medium">{sub.company}</span>
            {sub.trade && <span className="text-white/50 text-xs">· {sub.trade}</span>}
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <span className="text-white text-xs">{completedCount}/{tasks.length} tasks done</span>
          </div>
        </div>
      </div>

      {/* ── Tabs (scrollable) ─────────────────────────────────────────────── */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-shrink-0 px-3 py-2.5 text-xs font-semibold flex flex-col items-center gap-0.5 border-b-2 transition ${
              tab === t.key ? 'border-[#2E7CF6] text-[#2E7CF6]' : 'border-transparent text-gray-400'
            }`}>
            <span>{t.icon}</span><span className="whitespace-nowrap">{t.label}</span>
          </button>
        ))}
      </div>


      {/* ══ PROJECT TAB ════════════════════════════════════════════════════ */}
      {tab === 'info' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">PROJECT DETAILS</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Row label="Project"  value={project.name}/>
              <Row label="Status"   value={project.status?.replace('_',' ') ?? 'Active'}/>
              <Row label="Start"    value={project.start_date ? format(parseISO(project.start_date), 'MMM d, yyyy') : undefined}/>
              <Row label="Est. End" value={project.estimated_end_date ? format(parseISO(project.estimated_end_date), 'MMM d, yyyy') : undefined}/>
            </div>
          </div>
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
              <p className="text-xs font-bold text-blue-700 mb-1">KORVIA is on your team</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                Submit your <strong>Estimate</strong> and <strong>Schedule</strong> using the tabs above.
                Use <strong>Report</strong> to flag any issues — KORVIA will notify your builder instantly.
                Use <strong>Messages</strong> for quick questions.
              </p>
            </div>
          </div>
          {/* Per-task date editing */}
          {tasks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2.5 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500">📅 YOUR TASK DATES</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Update your start/end — KORVIA will notify your builder and any overlapping subs automatically.
                </p>
              </div>
              {tasks.map((task: any) => {
                const edit = dateEdits[task.id] ?? {
                  sub_start_date: task.sub_start_date ?? task.start_date ?? '',
                  sub_end_date:   task.sub_end_date   ?? task.end_date   ?? '',
                  sub_notes: '',
                }
                const isSaving = dateSaving === task.id
                const isSaved  = dateSaved  === task.id
                return (
                  <div key={task.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                    <p className="text-xs font-bold text-[#1A2B4A] mb-2.5">{task.name}</p>
                    <div className="grid grid-cols-2 gap-2 mb-2.5">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Start date</p>
                        <input type="date"
                          value={edit.sub_start_date}
                          onChange={e => setDateEdits(s => ({ ...s, [task.id]: { ...edit, sub_start_date: e.target.value } }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#1A2B4A] focus:outline-none focus:border-blue-400"/>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">End date</p>
                        <input type="date"
                          value={edit.sub_end_date}
                          onChange={e => setDateEdits(s => ({ ...s, [task.id]: { ...edit, sub_end_date: e.target.value } }))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#1A2B4A] focus:outline-none focus:border-blue-400"/>
                      </div>
                    </div>
                    <button onClick={() => handleDateSave(task.id)} disabled={isSaving}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition ${
                        isSaved ? 'bg-green-500 text-white' : 'bg-[#2E7CF6] text-white active:scale-[0.97]'
                      } disabled:opacity-60`}>
                      {isSaving ? 'Saving…' : isSaved ? '✅ Saved! KORVIA notified' : '📅 Save Dates'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="w-full py-3.5 rounded-2xl bg-[#1A2B4A] text-white font-bold text-sm flex items-center justify-center gap-2">
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Open in Google Maps
          </a>
        </div>
      )}


      {/* ══ TASKS TAB ══════════════════════════════════════════════════════ */}
      {tab === 'tasks' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-lg mt-0.5">🤖</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              Update your task status here. For anything complex, tap <strong>Ask KORVIA</strong> — she&apos;ll notify your builder automatically.
            </p>
          </div>
          {tasks.length === 0
            ? <div className="text-center py-8 text-gray-400 text-sm">No tasks assigned yet</div>
            : tasks.map((task: any) => {
              const dl = daysLabel(task.start_date)
              const chat = getChat(task.id)
              const isOpen = korviaOpen === task.id
              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 pt-4 pb-3 border-b border-gray-50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-bold text-[#1A2B4A]">{task.name}</p>
                      {dl && <span className={`text-xs font-semibold shrink-0 ${dl.cls}`}>{dl.text}</span>}
                    </div>
                    {task.notes && <p className="text-xs text-gray-400 mb-2">{task.notes}</p>}
                    <div className="flex gap-2 text-xs text-gray-400">
                      <span>📅 {task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'} → {task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</span>
                      {task.sub_quoted_cost && <span>💰 {fmtMoney(task.sub_quoted_cost)}</span>}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-2 font-semibold">MY STATUS</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUB_STATUS_OPTIONS.map(opt => (
                        <button key={opt.value} disabled={statusSaving === task.id}
                          onClick={() => handleStatusChange(task.id, opt.value)}
                          className={`py-2 px-2 rounded-xl border text-xs font-semibold transition ${
                            (task.status === opt.value || (opt.value === 'fail_inspection' && task.inspection_status === 'failed'))
                              ? opt.color + ' ring-1 ring-offset-1 ring-current'
                              : 'border-gray-200 bg-gray-50 text-gray-500 active:scale-[0.97]'
                          }`}>
                          {statusSaving === task.id ? '…' : opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    <button onClick={() => setKorviaOpen(isOpen ? null : task.id)}
                      className="w-full py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 flex items-center justify-center gap-1.5">
                      🤖 {isOpen ? 'Close KORVIA' : 'Ask KORVIA'}
                    </button>
                    {isOpen && (
                      <div className="mt-2 flex flex-col gap-2">
                        {chat.reply && (
                          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
                            <strong>KORVIA:</strong> {chat.reply}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input value={chat.message} placeholder="Message KORVIA…"
                            onChange={e => setChat(task.id, { message: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && sendToKorvia(task.id)}
                            className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"/>
                          <button onClick={() => sendToKorvia(task.id)} disabled={chat.sending || !chat.message.trim()}
                            className="px-3 py-2 rounded-xl bg-[#2E7CF6] text-white text-xs font-bold disabled:opacity-50">
                            {chat.sending ? '…' : '→'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── File upload ── */}
                  <div className="px-4 pb-4 pt-1 border-t border-gray-50">
                    <p className="text-xs font-semibold text-gray-500 mb-2 mt-2">📎 FILES &amp; PHOTOS</p>

                    {/* Existing uploaded files for this task */}
                    {(files ?? []).filter((f: any) => f.task_id === task.id).length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {(files ?? []).filter((f: any) => f.task_id === task.id).map((f: any) => (
                          <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition">
                            <span>{f.file_type?.startsWith('image') ? '🖼️' : '📄'}</span>
                            <span className="flex-1 truncate">{f.file_name}</span>
                            {f.notes && <span className="text-gray-400 truncate max-w-[80px]">{f.notes}</span>}
                            <span className="text-gray-400 shrink-0">↗</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Upload control */}
                    {(() => {
                      const up = uploads[task.id] ?? { file: null, notes: '', uploading: false, done: false }
                      return (
                        <div className="flex flex-col gap-2">
                          <label className={`flex items-center gap-2 border border-dashed rounded-xl px-3 py-2.5 cursor-pointer transition ${
                            up.file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'
                          }`}>
                            <span className="text-base">{up.file ? '📁' : '📸'}</span>
                            <span className="text-xs text-gray-500 flex-1 truncate">
                              {up.file ? up.file.name : 'Choose photo or PDF…'}
                            </span>
                            <input type="file" accept="image/*,application/pdf" className="sr-only"
                              onChange={e => {
                                const f = e.target.files?.[0] ?? null
                                setUploads(s => ({ ...s, [task.id]: { ...(s[task.id] ?? { notes: '', uploading: false, done: false }), file: f, done: false } }))
                              }}/>
                          </label>
                          {up.file && (
                            <>
                              <input placeholder="Notes about this file (optional)…"
                                value={up.notes}
                                onChange={e => setUploads(s => ({ ...s, [task.id]: { ...up, notes: e.target.value } }))}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-blue-400"/>
                              <button onClick={() => handleUpload(task.id)} disabled={up.uploading}
                                className={`w-full py-2.5 rounded-xl text-xs font-bold transition ${
                                  up.done ? 'bg-green-500 text-white' : 'bg-[#1A2B4A] text-white active:scale-[0.97]'
                                } disabled:opacity-60`}>
                                {up.uploading ? 'Uploading…' : up.done ? '✅ Uploaded!' : '⬆️ Upload File'}
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })
          }
        </div>
      )}


      {/* ══ ESTIMATE TAB ═══════════════════════════════════════════════════ */}
      {tab === 'estimate' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* Legal disclaimer */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-1">📋 About your estimate</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              This estimate is preliminary and may be adjusted at any time, provided both the <strong>builder approves</strong> and <strong>you agree</strong> before any changes are made. Final payment will be based on the approved and mutually agreed amount.
            </p>
          </div>

          {/* Project-level estimate */}
          {estimates.filter(e => e.type === 'project').map((est, idx) => (
            <div key={`proj-${idx}`} className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">💼 PROJECT ESTIMATE (TOTAL)</p>
              <p className="text-xs text-gray-400 mb-3">Your total bid for all your work on this project</p>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden mb-3">
                <span className="px-3 text-gray-400 font-bold text-sm bg-gray-50 py-3 border-r border-gray-200">$</span>
                <input type="number" placeholder="0.00" step="0.01" min="0"
                  value={est.amount}
                  onChange={e => updateEst(estimates.indexOf(est), 'amount', e.target.value)}
                  className="flex-1 px-3 py-3 text-sm text-[#1A2B4A] font-bold focus:outline-none"/>
              </div>
              <textarea placeholder="Scope of work, materials included, exclusions…" rows={3}
                value={est.notes}
                onChange={e => updateEst(estimates.indexOf(est), 'notes', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 resize-none"/>
            </div>
          ))}

          {/* Per-task estimates */}
          {tasks.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-2 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500">🔧 PER-TASK ESTIMATES</p>
                <p className="text-xs text-gray-400 mt-0.5">Breakdown by task (optional but helpful)</p>
              </div>
              {tasks.map((task: any) => {
                const taskEst = estimates.find(e => e.type === 'task' && e.task_id === task.id)
                  ?? { type: 'task' as const, task_id: task.id, amount: '', notes: '' }
                const taskEstIdx = estimates.findIndex(e => e.type === 'task' && e.task_id === task.id)
                return (
                  <div key={task.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                    <p className="text-xs font-bold text-[#1A2B4A] mb-2">{task.name}</p>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden mb-2">
                      <span className="px-3 text-gray-400 font-bold text-sm bg-gray-50 py-2.5 border-r border-gray-200">$</span>
                      <input type="number" placeholder="0.00" step="0.01" min="0"
                        value={taskEst.amount}
                        onChange={e => taskEstIdx >= 0
                          ? updateEst(taskEstIdx, 'amount', e.target.value)
                          : setEstimates(prev => [...prev, { ...taskEst, amount: e.target.value }])}
                        className="flex-1 px-3 py-2.5 text-sm text-[#1A2B4A] font-semibold focus:outline-none"/>
                    </div>
                    <input placeholder="Notes (optional)…"
                      value={taskEst.notes}
                      onChange={e => taskEstIdx >= 0
                        ? updateEst(taskEstIdx, 'notes', e.target.value)
                        : setEstimates(prev => [...prev, { ...taskEst, notes: e.target.value }])}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-blue-400"/>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={saveEstimates} disabled={estSaving}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition ${
              estSaved ? 'bg-green-500 text-white' : 'bg-[#2E7CF6] text-white active:scale-[0.98]'
            } disabled:opacity-60`}>
            {estSaving ? 'Saving…' : estSaved ? '✅ Estimate Submitted!' : '💾 Submit Estimate'}
          </button>
        </div>
      )}


      {/* ══ SCHEDULE TAB ═══════════════════════════════════════════════════ */}
      {tab === 'schedule' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-2.5">
            <span className="text-lg">🗓️</span>
            <p className="text-xs text-blue-700 leading-relaxed">
              Set your <strong>arrival time</strong> and <strong>work days</strong> for each task.
              KORVIA will use this to keep your builder informed.
            </p>
          </div>

          {tasks.length === 0
            ? <div className="text-center py-8 text-gray-400 text-sm">No tasks assigned yet</div>
            : tasks.map((task: any) => {
              const sch = schedules[task.id] ?? { sub_arrival_time: '', sub_work_days: [], sub_schedule_notes: '' }
              const isSaving = schSaving === task.id
              const isSaved  = schSaved  === task.id
              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <p className="text-sm font-bold text-[#1A2B4A] mb-3">{task.name}</p>

                  {/* Arrival time */}
                  <p className="text-xs text-gray-500 font-semibold mb-1.5">⏰ ARRIVAL TIME</p>
                  <input type="time"
                    value={sch.sub_arrival_time}
                    onChange={e => setSchedules(s => ({ ...s, [task.id]: { ...sch, sub_arrival_time: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400 mb-3"/>

                  {/* Work days */}
                  <p className="text-xs text-gray-500 font-semibold mb-1.5">📅 WORK DAYS</p>
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {WORK_DAYS.map(day => (
                      <button key={day} onClick={() => toggleDay(task.id, day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                          sch.sub_work_days.includes(day)
                            ? 'bg-[#2E7CF6] border-[#2E7CF6] text-white'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}>
                        {day}
                      </button>
                    ))}
                  </div>

                  {/* Notes */}
                  <p className="text-xs text-gray-500 font-semibold mb-1.5">📝 SCHEDULE NOTES</p>
                  <textarea placeholder="Any schedule details, breaks, special conditions…" rows={2}
                    value={sch.sub_schedule_notes}
                    onChange={e => setSchedules(s => ({ ...s, [task.id]: { ...sch, sub_schedule_notes: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-blue-400 resize-none mb-3"/>

                  <button onClick={() => saveSchedule(task.id)} disabled={isSaving}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs transition ${
                      isSaved ? 'bg-green-500 text-white' : 'bg-[#2E7CF6] text-white active:scale-[0.97]'
                    } disabled:opacity-60`}>
                    {isSaving ? 'Saving…' : isSaved ? '✅ Saved!' : '💾 Save Schedule'}
                  </button>
                </div>
              )
            })
          }
        </div>
      )}


      {/* ══ REPORT TAB ═════════════════════════════════════════════════════ */}
      {tab === 'report' && (
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-2.5">
            <span className="text-lg">⚠️</span>
            <p className="text-xs text-red-700 leading-relaxed">
              Use this to report <strong>any issue on site</strong> — missing materials, safety concerns,
              damage, or anything the builder needs to know.
              KORVIA will <strong>notify your builder immediately by SMS</strong>.
            </p>
          </div>

          {repSent && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-green-700 font-bold text-sm">✅ Report Sent!</p>
              <p className="text-green-600 text-xs mt-1">KORVIA has notified your builder via SMS.</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-4">
            {/* Issue type */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">TYPE OF ISSUE</p>
              <div className="flex flex-col gap-2">
                {REPORT_TYPES.map(rt => (
                  <button key={rt.value} onClick={() => setReport(r => ({ ...r, type: rt.value }))}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                      report.type === rt.value
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 bg-gray-50 active:scale-[0.98]'
                    }`}>
                    <span className="text-base leading-none mt-0.5">{rt.label.split(' ')[0]}</span>
                    <div>
                      <p className={`text-xs font-bold ${report.type === rt.value ? 'text-red-700' : 'text-gray-700'}`}>
                        {rt.label.split(' ').slice(1).join(' ')}
                      </p>
                      <p className="text-xs text-gray-400">{rt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Task (optional) */}
            {tasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">RELATED TASK (optional)</p>
                <select value={report.task_id}
                  onChange={e => setReport(r => ({ ...r, task_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-400 bg-white">
                  <option value="">— Not task-specific —</option>
                  {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* Urgency */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">URGENCY</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'normal',    l: '🟡 Normal',    c: 'border-yellow-300 bg-yellow-50 text-yellow-700' },
                  { v: 'urgent',    l: '🔴 Urgent',    c: 'border-red-400 bg-red-50 text-red-700' },
                  { v: 'emergency', l: '🆘 Emergency',  c: 'border-red-600 bg-red-100 text-red-800' },
                ].map(u => (
                  <button key={u.v} onClick={() => setReport(r => ({ ...r, urgency: u.v }))}
                    className={`py-2 rounded-xl border text-xs font-bold transition ${
                      report.urgency === u.v ? u.c + ' ring-1 ring-current ring-offset-1' : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}>
                    {u.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">DESCRIPTION</p>
              <textarea rows={4} placeholder="Describe the issue clearly — what you found, where, and what's needed…"
                value={report.description}
                onChange={e => setReport(r => ({ ...r, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-red-300 resize-none"/>
            </div>

            <button onClick={submitReport} disabled={repSending || !report.type || !report.description.trim()}
              className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition">
              {repSending ? 'Sending…' : '🚨 Send Report to Builder'}
            </button>
          </div>
        </div>
      )}


      {/* ══ MESSAGES TAB ═══════════════════════════════════════════════════ */}
      {tab === 'messages' && (
        <div className="flex flex-col h-[calc(100vh-220px)]">
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                <p className="text-2xl mb-2">🤖</p>
                <p>No messages yet. Say hello to KORVIA!</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'sub' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'korvia' && (
                  <div className="w-7 h-7 rounded-full bg-[#1A2B4A] flex items-center justify-center text-xs mr-2 mt-1 shrink-0">🤖</div>
                )}
                <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === 'sub'
                    ? 'bg-[#2E7CF6] text-white rounded-br-sm'
                    : 'bg-white text-[#1A2B4A] shadow-sm rounded-bl-sm'
                }`}>
                  <p>{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.sender === 'sub' ? 'text-white/60' : 'text-gray-400'}`}>
                    {format(parseISO(msg.created_at), 'h:mm a')}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef}/>
          </div>

          {/* input */}
          <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2">
            <input
              value={msgInput} placeholder="Message KORVIA…"
              onChange={e => setMsgInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#2E7CF6]"/>
            <button onClick={sendMessage} disabled={msgSending || !msgInput.trim()}
              className="px-4 py-2.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-50 active:scale-[0.97] transition">
              {msgSending ? '…' : '→'}
            </button>
          </div>
        </div>
      )}

    </div>  // end main portal div
  )
}
