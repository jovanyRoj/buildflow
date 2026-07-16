'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday } from 'date-fns'

const STATUS_OPTIONS = [
  { value: 'in_progress',     label: '🟢 On Track',       cls: 'border-green-400 bg-green-50 text-green-700' },
  { value: 'completed',       label: '✅ Completed',       cls: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
  { value: 'pending',         label: '⏳ Pending',         cls: 'border-gray-300 bg-gray-50 text-gray-600' },
  { value: 'delayed',         label: '🔴 Delayed',         cls: 'border-red-400 bg-red-50 text-red-700' },
  { value: 'fail_inspection', label: '❌ Fail Inspection', cls: 'border-red-500 bg-red-100 text-red-800' },
]
const WORK_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const REPORT_TYPES = [
  { value: 'material_missing',  label: '📦 Missing Material',  desc: 'Material the builder needs to purchase' },
  { value: 'safety_concern',    label: '⚠️ Safety Concern',    desc: 'Unsafe condition on site' },
  { value: 'schedule_conflict', label: '📅 Schedule Conflict', desc: 'Timing conflict with another trade' },
  { value: 'damage',            label: '🔨 Damage Found',      desc: 'Existing damage or defect found' },
  { value: 'other',             label: '📝 Other',             desc: 'General report or note' },
]

interface PortalMessage { id: string; sender: 'sub'|'korvia'; content: string; created_at: string }
interface Estimate { id?: string; type: 'project'|'task'; task_id?: string; amount: string; notes: string }
interface Schedule { sub_arrival_time: string; sub_work_days: string[]; sub_schedule_notes: string }

function fmtMoney(n: number|null|undefined) {
  if (!n && n !== 0) return null
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
}
function daysLabel(d?: string|null) {
  if (!d) return null
  try {
    const dt = parseISO(d)
    if (isToday(dt)) return { text:'Today', cls:'text-orange-500' }
    const diff = differenceInDays(dt, new Date())
    if (diff < 0) return { text:`${Math.abs(diff)}d ago`, cls:'text-red-500' }
    return { text:`in ${diff}d`, cls:'text-blue-500' }
  } catch { return null }
}
function Row({ label, value }: { label:string; value?:string|null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-400 shrink-0 text-sm">{label}</span>
      <span className="text-[#1A2B4A] font-medium text-sm text-right">{value}</span>
    </div>
  )
}
function Spinner() {
  return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

export default function SubPortal() {
  const params = useParams()
  const projectId = params.projectId as string
  const subId     = params.subId     as string

  // ── auth ────────────────────────────────────────────────────────────────
  const [authStep,  setAuthStep]  = useState<'loading'|'gate'|'ok'|'fail'>('loading')
  const [authInput, setAuthInput] = useState('')

  // ── data ─────────────────────────────────────────────────────────────────
  const [project,   setProject]   = useState<any>(null)
  const [sub,       setSub]       = useState<any>(null)
  const [tasks,     setTasks]     = useState<any[]>([])
  const [messages,  setMessages]  = useState<PortalMessage[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [taskDates, setTaskDates] = useState<Record<string,{start:string;end:string}>>({})

  // ── ui state ──────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('project')
  const [taskStatus,   setTaskStatus]   = useState<Record<string,string>>({})
  const [taskFiles,    setTaskFiles]    = useState<Record<string,any[]>>({})
  const [uploading,    setUploading]    = useState<Record<string,boolean>>({})
  const [schedule,     setSchedule]     = useState<Schedule>({ sub_arrival_time:'', sub_work_days:[], sub_schedule_notes:'' })
  const [reportType,   setReportType]   = useState('')
  const [reportTask,   setReportTask]   = useState('')
  const [reportUrgency,setReportUrgency]= useState<'low'|'medium'|'high'|'emergency'>('medium')
  const [reportDesc,   setReportDesc]   = useState('')
  const [msgInput,     setMsgInput]     = useState('')
  const [saving,       setSaving]       = useState(false)
  const [sendingMsg,   setSendingMsg]   = useState(false)
  const [sendingReport,setSendingReport]= useState(false)
  const [savedDates,   setSavedDates]   = useState(false)
  const [korviaTip,    setKorviaTip]    = useState('')
  const [askKorvia,    setAskKorvia]    = useState<Record<string,{open:boolean;q:string;a:string;loading:boolean}>>({})
  const [estAmt,       setEstAmt]       = useState('')
  const [estNotes,     setEstNotes]     = useState('')
  const [estTaskId,    setEstTaskId]    = useState('')
  const [estScope,     setEstScope]     = useState<'project'|'task'>('project')
  const [submittingEst,setSubmittingEst]= useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  // ── load ─────────────────────────────────────────────────────────────────
  async function loadPortal() {
    const r = await fetch(`/api/portal/${projectId}/${subId}`)
    if (!r.ok) { setAuthStep('fail'); return }
    const d = await r.json()
    setProject(d.project); setSub(d.sub); setTasks(d.tasks ?? [])
    setMessages(d.messages ?? [])

    // Fetch estimates from dedicated endpoint
    try {
      const er = await fetch(`/api/portal/${projectId}/${subId}/estimate`)
      if (er.ok) { const ed = await er.json(); setEstimates(ed.estimates ?? []) }
    } catch {}

    // Build files map from GET response (keyed by task_id)
    const filesMap: Record<string,any[]> = {}
    for (const f of (d.files ?? [])) {
      const key = f.task_id ?? '__project__'
      if (!filesMap[key]) filesMap[key] = []
      filesMap[key].push({ url: f.file_url, name: f.name, type: f.file_type })
    }
    setTaskFiles(filesMap)

    // Extract schedule from first task that has schedule data
    const taskWithSchedule = (d.tasks ?? []).find((t: any) => t.sub_arrival_time || t.sub_work_days?.length)
    if (taskWithSchedule) {
      setSchedule({
        sub_arrival_time: taskWithSchedule.sub_arrival_time ?? '',
        sub_work_days: taskWithSchedule.sub_work_days ?? [],
        sub_schedule_notes: taskWithSchedule.sub_schedule_notes ?? ''
      })
    }

    // Init per-task state
    const st: Record<string,string> = {}
    const td: Record<string,{start:string;end:string}> = {}
    const kq: Record<string,{open:boolean;q:string;a:string;loading:boolean}> = {}
    for (const t of (d.tasks ?? [])) {
      st[t.id] = t.status ?? 'pending'
      td[t.id] = { start: t.sub_start_date?.slice(0,10) ?? '', end: t.sub_end_date?.slice(0,10) ?? '' }
      kq[t.id] = { open:false, q:'', a:'', loading:false }
    }
    setTaskStatus(st); setTaskDates(td); setAskKorvia(kq)
    setAuthStep('gate')
  }

  useEffect(() => {
    loadPortal()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, subId])

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function reloadFiles() {
    const r = await fetch(`/api/portal/${projectId}/${subId}`)
    if (!r.ok) return
    const d = await r.json()
    const filesMap: Record<string,any[]> = {}
    for (const f of (d.files ?? [])) {
      const key = f.task_id ?? '__project__'
      if (!filesMap[key]) filesMap[key] = []
      filesMap[key].push({ url: f.file_url, name: f.name, type: f.file_type })
    }
    setTaskFiles(filesMap)
  }

  // ── auth handler ─────────────────────────────────────────────────────────
  function handleAuth() {
    if (!sub) return
    const raw   = authInput.trim().toLowerCase()
    const phone = (sub.phone ?? '').replace(/\D/g,'')
    const last4 = phone.slice(-4)
    const name  = (sub.name  ?? '').toLowerCase().split(' ')[0]
    const comp  = (sub.company ?? '').toLowerCase().split(' ')[0]
    if (raw === last4 || raw === name || (comp && raw === comp)) {
      setAuthStep('ok')
    } else {
      setAuthStep('fail')
    }
  }

  // ── status update ─────────────────────────────────────────────────────────
  async function updateStatus(taskId: string, value: string) {
    setTaskStatus(p => ({ ...p, [taskId]: value }))
    await fetch(`/api/portal/${projectId}/${subId}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ taskId, status: value })
    })
  }

  // ── save dates ────────────────────────────────────────────────────────────
  async function saveDates() {
    setSaving(true)
    for (const [taskId, d] of Object.entries(taskDates)) {
      await fetch(`/api/portal/${projectId}/${subId}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ taskId, sub_start_date: d.start || null, sub_end_date: d.end || null })
      })
    }
    setSaving(false); setSavedDates(true)
    setTimeout(() => setSavedDates(false), 2500)
  }

  // ── file upload ───────────────────────────────────────────────────────────
  async function handleUpload(taskId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(p => ({ ...p, [taskId]: true }))
    const fd = new FormData(); fd.append('file', file); fd.append('taskId', taskId)
    await fetch(`/api/portal/${projectId}/${subId}/upload`, { method:'POST', body: fd })
    await reloadFiles()
    setUploading(p => ({ ...p, [taskId]: false }))
    e.target.value = ''
  }

  // ── schedule save ──────────────────────────────────────────────────────────
  async function saveSchedule() {
    setSaving(true)
    await fetch(`/api/portal/${projectId}/${subId}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ schedule })
    })
    setSaving(false)
  }

  // ── send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!msgInput.trim()) return
    setSendingMsg(true)
    const r = await fetch(`/api/portal/${projectId}/${subId}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'send_message', content: msgInput.trim() })
    })
    if (r.ok) {
      const d = await r.json()
      setMessages(p => [
        ...p,
        ...(d.message ? [d.message] : []),
        ...(d.korviaReply ? [d.korviaReply] : []),
      ])
      setMsgInput('')
    }
    setSendingMsg(false)
  }

  // ── send report ───────────────────────────────────────────────────────────
  async function sendReport() {
    if (!reportType || !reportDesc.trim()) return
    setSendingReport(true)
    await fetch(`/api/portal/${projectId}/${subId}/report`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type: reportType, taskId: reportTask || null, urgency: reportUrgency, description: reportDesc.trim() })
    })
    setReportType(''); setReportTask(''); setReportDesc(''); setReportUrgency('medium')
    setSendingReport(false)
  }

  // ── ask korvia ────────────────────────────────────────────────────────────
  async function askKorviaFn(taskId: string) {
    const q = askKorvia[taskId]?.q; if (!q?.trim()) return
    setAskKorvia(p => ({ ...p, [taskId]: { ...p[taskId], loading:true } }))
    const r = await fetch('/api/korvia/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: q, projectId, subId, taskId })
    })
    const d = await r.json()
    setAskKorvia(p => ({ ...p, [taskId]: { ...p[taskId], a: d.reply ?? d.message ?? '', loading:false } }))
  }

  // ── submit estimate ───────────────────────────────────────────────────────
  async function submitEstimate() {
    if (!estAmt) return
    setSubmittingEst(true)
    const r = await fetch(`/api/portal/${projectId}/${subId}/estimate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type: estScope, task_id: estScope==='task' ? estTaskId : null, amount: estAmt, notes: estNotes })
    })
    if (r.ok) {
      const d = await r.json()
      setEstimates(p => [...p.filter(e => !(e.type===d.estimate.type && e.task_id===d.estimate.task_id)), d.estimate])
    }
    setEstAmt(''); setEstNotes(''); setSubmittingEst(false)
  }

  // ── early returns ──────────────────────────────────────────────────────────
  if (authStep === 'loading') return <Spinner/>

  if (authStep === 'gate') return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center p-6 gap-6">
      <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl flex flex-col gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Contractor Portal</p>
          <h1 className="text-xl font-bold text-[#1A2B4A] mt-1">{project?.name ?? 'Project'}</h1>
        </div>
        <p className="text-sm text-gray-600">Enter your first name, company name, or last 4 digits of your phone to verify your identity.</p>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A]"
          placeholder="e.g. John / Acme / 4567"
          value={authInput}
          onChange={e => setAuthInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && handleAuth()}
        />
        <button onClick={handleAuth}
          className="w-full bg-[#1A2B4A] text-white py-3 rounded-xl font-semibold text-sm active:scale-95 transition">
          Enter Portal
        </button>
      </div>
    </div>
  )

  if (authStep === 'fail') return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center p-6 gap-4">
      <div className="text-4xl">🔒</div>
      <h2 className="text-white text-xl font-bold">Access Denied</h2>
      <p className="text-blue-200 text-sm text-center">We couldn't verify your identity. Contact your builder for a new portal link.</p>
    </div>
  )

  // ── helpers for render ─────────────────────────────────────────────────────
  const projEst  = estimates.find(e => e.type === 'project')
  const taskEsts = estimates.filter(e => e.type === 'task')
  const totalEst = estimates.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">

      {/* ── HEADER ── */}
      <div className="bg-[#1A2B4A] pt-10 pb-4 px-5">
        <div className="flex items-center gap-3 mb-3">
          <img src="/brivox-logo-dark.svg" alt="" className="h-9 w-9 rounded-xl"/>
          <div>
            <p className="text-blue-300 text-xs uppercase tracking-wider">Contractor Portal</p>
            <h1 className="text-white text-lg font-bold leading-tight">{project?.name}</h1>
          </div>
        </div>
        {project?.address && (
          <p className="text-blue-200 text-xs mb-3">📍 {project.address}</p>
        )}
        {/* sub chips */}
        <div className="flex flex-wrap gap-2">
          <span className="bg-white/10 text-white text-xs px-3 py-1 rounded-full">{sub?.name}</span>
          {sub?.trade && <span className="bg-blue-500/30 text-blue-100 text-xs px-3 py-1 rounded-full">{sub.trade}</span>}
          {sub?.company && <span className="bg-white/10 text-white text-xs px-3 py-1 rounded-full">{sub.company}</span>}
        </div>
      </div>

      {/* ── DISCLAIMER ── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex gap-2 items-start">
        <span className="text-amber-500 text-sm mt-0.5 shrink-0">⚠️</span>
        <p className="text-amber-700 text-xs leading-relaxed">
          This portal is for communication only. All work must be verified on-site. Dates and tasks are subject to change by the builder.
        </p>
      </div>

      {/* ── TABS ── */}
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto no-scrollbar sticky top-0 z-10">
        {[
          { id:'project',  label:'Project' },
          { id:'tasks',    label:'Tasks'   },
          { id:'estimate', label:'Estimate'},
          { id:'schedule', label:'Schedule'},
          { id:'report',   label:'Report'  },
          { id:'messages', label:'Messages'},
        ].map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab===t.id ? 'border-[#1A2B4A] text-[#1A2B4A]' : 'border-transparent text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 pb-8">

        {/* ════════════ PROJECT TAB ════════════ */}
        {activeTab === 'project' && (
          <div className="flex flex-col gap-4 p-4">

            {/* Project Details */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
              <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide">Project Details</h2>
              <Row label="Project" value={project?.name}/>
              <Row label="Address" value={project?.address}/>
              <Row label="Builder" value={project?.builder_name ?? project?.owner_name}/>
              <Row label="Status"  value={project?.status}/>
              {project?.budget && <Row label="Budget" value={fmtMoney(project.budget) ?? undefined}/>}
            </div>

            {/* ── YOUR TASK DATES (always visible) ── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide mb-3">📅 Your Task Dates</h2>
              {tasks.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-gray-500 text-sm">No tasks assigned to you yet.</p>
                  <p className="text-gray-400 text-xs mt-1">Your builder will add tasks and you can set your start/end dates here.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {tasks.map(t => {
                    const sd = daysLabel(taskDates[t.id]?.start)
                    const ed = daysLabel(taskDates[t.id]?.end)
                    return (
                      <div key={t.id} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                        <p className="text-[#1A2B4A] font-semibold text-sm">{t.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Start Date</label>
                            <input type="date" value={taskDates[t.id]?.start ?? ''}
                              onChange={e => setTaskDates(p => ({ ...p, [t.id]: { ...p[t.id], start: e.target.value } }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#1A2B4A]"/>
                            {sd && <p className={`text-xs mt-1 ${sd.cls}`}>{sd.text}</p>}
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">End Date</label>
                            <input type="date" value={taskDates[t.id]?.end ?? ''}
                              onChange={e => setTaskDates(p => ({ ...p, [t.id]: { ...p[t.id], end: e.target.value } }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#1A2B4A]"/>
                            {ed && <p className={`text-xs mt-1 ${ed.cls}`}>{ed.text}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={saveDates} disabled={saving}
                    className="w-full bg-[#1A2B4A] text-white py-3 rounded-xl text-sm font-semibold active:scale-95 transition disabled:opacity-50">
                    {saving ? 'Saving…' : savedDates ? '✅ Dates Saved!' : '💾 Save Dates'}
                  </button>
                </div>
              )}
            </div>

            {/* Your Registration */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
              <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide">Your Registration</h2>
              <Row label="Name"    value={sub?.name}/>
              <Row label="Company" value={sub?.company}/>
              <Row label="Trade"   value={sub?.trade}/>
              <Row label="Phone"   value={sub?.phone}/>
              <Row label="Email"   value={sub?.email}/>
            </div>

            {/* KORVIA Banner */}
            <div className="bg-[#1A2B4A] rounded-2xl p-4 flex gap-3 items-start">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-white font-bold text-sm">KORVIA is on this project</p>
                <p className="text-blue-200 text-xs mt-1 leading-relaxed">
                  KORVIA monitors your tasks, responds to your messages and reports, and alerts the builder when something needs attention. Use the Messages tab to talk to KORVIA directly.
                </p>
              </div>
            </div>

            {/* Maps */}
            {project?.address && (
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(project.address)}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-semibold text-[#1A2B4A] shadow-sm">
                🗺️ Open in Maps
              </a>
            )}
          </div>
        )}

        {/* ════════════ TASKS TAB ════════════ */}
        {activeTab === 'tasks' && (
          <div className="flex flex-col gap-4 p-4">

            {/* KORVIA Tip */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2 items-start">
              <span className="text-lg shrink-0">🤖</span>
              <p className="text-blue-700 text-xs leading-relaxed">
                Update your task status so KORVIA can notify the builder in real time. Use "❌ Fail Inspection" if work didn't pass — KORVIA will alert the builder immediately.
              </p>
            </div>

            {/* Task cards OR empty state */}
            {tasks.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                <p className="text-4xl mb-2">📋</p>
                <p className="text-gray-600 font-semibold text-sm">No tasks yet</p>
                <p className="text-gray-400 text-xs mt-1">Your builder hasn't assigned tasks to you yet. Check back soon.</p>
              </div>
            ) : (
              tasks.map(task => {
                const cur  = taskStatus[task.id] ?? task.status ?? 'pending'
                const opt  = STATUS_OPTIONS.find(o => o.value === cur)
                const files= taskFiles[task.id] ?? []
                const kv   = askKorvia[task.id] ?? { open:false, q:'', a:'', loading:false }
                return (
                  <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* task header */}
                    <div className="p-4 border-b border-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-[#1A2B4A] text-sm">{task.name}</p>
                          {task.description && <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{task.description}</p>}
                        </div>
                        <span className={`shrink-0 text-xs px-2 py-1 rounded-full border font-medium ${opt?.cls ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                          {opt?.label ?? cur}
                        </span>
                      </div>
                      {task.due_date && (
                        <p className="text-xs text-gray-400 mt-2">
                          Due: {format(parseISO(task.due_date),'MMM d, yyyy')}
                          {(() => { const dl=daysLabel(task.due_date); return dl ? <span className={`ml-2 font-medium ${dl.cls}`}>{dl.text}</span> : null })()}
                        </p>
                      )}
                    </div>

                    {/* status buttons */}
                    <div className="p-3 flex flex-col gap-2">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Update Status</p>
                      <div className="grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.map(o => (
                          <button key={o.value}
                            onClick={() => updateStatus(task.id, o.value)}
                            className={`text-xs py-2 px-3 rounded-lg border font-medium transition active:scale-95 ${
                              cur===o.value ? o.cls : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ask KORVIA */}
                    <div className="px-3 pb-3">
                      <button
                        onClick={() => setAskKorvia(p => ({ ...p, [task.id]: { ...p[task.id], open: !kv.open } }))}
                        className="w-full text-xs text-[#1A2B4A] border border-[#1A2B4A] rounded-lg py-2 font-semibold flex items-center justify-center gap-2 active:scale-95">
                        🤖 Ask KORVIA about this task
                      </button>
                      {kv.open && (
                        <div className="mt-2 flex flex-col gap-2">
                          <input value={kv.q}
                            onChange={e => setAskKorvia(p => ({ ...p, [task.id]: { ...p[task.id], q: e.target.value } }))}
                            placeholder="Ask anything about this task…"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#1A2B4A]"/>
                          <button onClick={() => askKorviaFn(task.id)} disabled={kv.loading}
                            className="bg-[#1A2B4A] text-white text-xs py-2 rounded-lg font-semibold disabled:opacity-50 active:scale-95">
                            {kv.loading ? 'Asking…' : 'Send →'}
                          </button>
                          {kv.a && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 leading-relaxed">
                              🤖 {kv.a}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── FILES & PHOTOS (per task) ── */}
                    <div className="border-t border-gray-100 p-3 flex flex-col gap-2">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">📎 Files &amp; Photos</p>
                      {files.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No files uploaded yet for this task.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {files.map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer"
                              className="aspect-square rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center bg-gray-50">
                              {f.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                                ? <img src={f.url} alt="" className="w-full h-full object-cover"/>
                                : <span className="text-2xl">📄</span>
                              }
                            </a>
                          ))}
                        </div>
                      )}
                      <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-lg py-2.5 text-xs text-gray-500 cursor-pointer hover:border-[#1A2B4A] hover:text-[#1A2B4A] transition ${uploading[task.id] ? 'opacity-50 cursor-default' : ''}`}>
                        {uploading[task.id] ? '⏳ Uploading…' : '+ Add Photo / PDF'}
                        <input type="file" className="hidden" accept="image/*,application/pdf"
                          disabled={uploading[task.id]}
                          onChange={e => handleUpload(task.id, e)}/>
                      </label>
                    </div>
                  </div>
                )
              })
            )}

            {/* Global FILES section when no tasks */}
            {tasks.length === 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide mb-3">📎 Files &amp; Photos</h3>
                <p className="text-gray-400 text-xs">Files will appear here once tasks are assigned to you.</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════ ESTIMATE TAB ════════════ */}
        {activeTab === 'estimate' && (
          <div className="flex flex-col gap-4 p-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
              <span className="text-amber-500 shrink-0">⚠️</span>
              <p className="text-amber-700 text-xs leading-relaxed">
                Estimates submitted here are for reference only and do not constitute a binding contract or approval.
              </p>
            </div>

            {/* Existing estimates */}
            {estimates.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                <h2 className="text-sm font-bold text-[#1A2B4A]">Submitted Estimates</h2>
                {projEst && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Full Project</span>
                    <span className="font-bold text-[#1A2B4A]">{fmtMoney(parseFloat(projEst.amount))}</span>
                  </div>
                )}
                {taskEsts.map(e => {
                  const t = tasks.find(x => x.id === e.task_id)
                  return (
                    <div key={e.id} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{t?.name ?? 'Task'}</span>
                      <span className="font-bold text-[#1A2B4A]">{fmtMoney(parseFloat(e.amount))}</span>
                    </div>
                  )
                })}
                {estimates.length > 1 && (
                  <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Total</span>
                    <span className="font-bold text-[#1A2B4A] text-base">{fmtMoney(totalEst)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Submit new estimate */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
              <h2 className="text-sm font-bold text-[#1A2B4A]">Submit Estimate</h2>
              <div className="flex gap-2">
                {(['project','task'] as const).map(s => (
                  <button key={s} onClick={() => setEstScope(s)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                      estScope===s ? 'bg-[#1A2B4A] text-white border-[#1A2B4A]' : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                    {s==='project' ? 'Full Project' : 'Per Task'}
                  </button>
                ))}
              </div>
              {estScope === 'task' && (
                <select value={estTaskId} onChange={e => setEstTaskId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A]">
                  <option value="">Select task…</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {estScope === 'task' && tasks.length === 0 && (
                <p className="text-xs text-gray-400 italic">No tasks available. Your builder hasn't added any yet.</p>
              )}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" placeholder="0" value={estAmt}
                  onChange={e => setEstAmt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A]"/>
              </div>
              <textarea rows={3} placeholder="Notes (optional)…" value={estNotes}
                onChange={e => setEstNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A] resize-none"/>
              <button onClick={submitEstimate} disabled={submittingEst || !estAmt || (estScope==='task' && !estTaskId && tasks.length>0)}
                className="w-full bg-[#1A2B4A] text-white py-3 rounded-xl font-semibold text-sm active:scale-95 disabled:opacity-50">
                {submittingEst ? 'Submitting…' : 'Submit Estimate'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════ SCHEDULE TAB ════════════ */}
        {activeTab === 'schedule' && (
          <div className="flex flex-col gap-4 p-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-4">
              <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide">Your Schedule</h2>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Typical Arrival Time</label>
                <input type="time" value={schedule.sub_arrival_time}
                  onChange={e => setSchedule(p => ({ ...p, sub_arrival_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A]"/>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Work Days</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_DAYS.map(d => (
                    <button key={d}
                      onClick={() => setSchedule(p => ({
                        ...p,
                        sub_work_days: p.sub_work_days.includes(d)
                          ? p.sub_work_days.filter(x => x !== d)
                          : [...p.sub_work_days, d]
                      }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        schedule.sub_work_days.includes(d)
                          ? 'bg-[#1A2B4A] text-white border-[#1A2B4A]'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Schedule Notes</label>
                <textarea rows={3}
                  placeholder="e.g. Need loading dock access by 7am…"
                  value={schedule.sub_schedule_notes}
                  onChange={e => setSchedule(p => ({ ...p, sub_schedule_notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A] resize-none"/>
              </div>

              <button onClick={saveSchedule} disabled={saving}
                className="w-full bg-[#1A2B4A] text-white py-3 rounded-xl font-semibold text-sm active:scale-95 disabled:opacity-50">
                {saving ? 'Saving…' : '💾 Save Schedule'}
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-3xl mb-2">📅</p>
                <p className="text-gray-500 text-sm">No tasks to schedule yet.</p>
                <p className="text-gray-400 text-xs mt-1">Once your builder adds tasks, you can set per-task dates in the Project tab.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
                <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide mb-1">Your Tasks</h2>
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{t.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_OPTIONS.find(o=>o.value===taskStatus[t.id])?.cls ?? 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                      {STATUS_OPTIONS.find(o=>o.value===taskStatus[t.id])?.label ?? 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════ REPORT TAB ════════════ */}
        {activeTab === 'report' && (
          <div className="flex flex-col gap-4 p-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-4">
              <h2 className="text-sm font-bold text-[#1A2B4A] uppercase tracking-wide">Submit a Report</h2>

              {/* Type */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-500">Report Type</label>
                {REPORT_TYPES.map(rt => (
                  <button key={rt.value}
                    onClick={() => setReportType(rt.value)}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                      reportType===rt.value ? 'border-[#1A2B4A] bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                    <span className="text-base shrink-0 mt-0.5">{rt.label.split(' ')[0]}</span>
                    <div>
                      <p className={`text-xs font-semibold ${reportType===rt.value ? 'text-[#1A2B4A]' : 'text-gray-700'}`}>
                        {rt.label.split(' ').slice(1).join(' ')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{rt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Task selector */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Related Task (optional)</label>
                <select value={reportTask} onChange={e => setReportTask(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A]">
                  <option value="">Not task-specific</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Urgency */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Urgency Level</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v:'low',       l:'🟢 Low',       cls:'border-green-300 bg-green-50 text-green-700'  },
                    { v:'medium',    l:'🟡 Medium',     cls:'border-yellow-300 bg-yellow-50 text-yellow-700'},
                    { v:'high',      l:'🔴 High',       cls:'border-red-300 bg-red-50 text-red-700'        },
                    { v:'emergency', l:'🆘 Emergency',  cls:'border-red-500 bg-red-100 text-red-800'        },
                  ] as const).map(u => (
                    <button key={u.v} onClick={() => setReportUrgency(u.v)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                        reportUrgency===u.v ? u.cls : 'border-gray-200 bg-gray-50 text-gray-500'
                      }`}>
                      {u.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Description</label>
                <textarea rows={4}
                  placeholder="Describe the issue in detail…"
                  value={reportDesc}
                  onChange={e => setReportDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A] resize-none"/>
              </div>

              <button onClick={sendReport} disabled={sendingReport || !reportType || !reportDesc.trim()}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-sm active:scale-95 disabled:opacity-50">
                {sendingReport ? 'Sending…' : '📤 Submit Report to Builder'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════ MESSAGES TAB ════════════ */}
        {activeTab === 'messages' && (
          <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
            {/* thread */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <span className="text-4xl">🤖</span>
                  <p className="text-gray-500 text-sm font-semibold">Chat with KORVIA</p>
                  <p className="text-gray-400 text-xs text-center leading-relaxed">
                    Ask questions about your tasks, report issues, or get help with anything on this project.
                  </p>
                </div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender==='sub' ? 'justify-end' : 'justify-start'}`}>
                    {m.sender !== 'sub' && (
                      <div className="bg-[#1A2B4A] text-white rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
                        <p className="text-xs opacity-60 mb-1 font-semibold">KORVIA</p>
                        <p className="text-sm leading-relaxed">{m.content}</p>
                        <p className="text-xs opacity-40 mt-1 text-right">
                          {format(parseISO(m.created_at), 'h:mm a')}
                        </p>
                      </div>
                    )}
                    {m.sender === 'sub' && (
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-tr-sm p-3 max-w-[80%] shadow-sm">
                        <p className="text-sm text-gray-800 leading-relaxed">{m.content}</p>
                        <p className="text-xs text-gray-400 mt-1 text-right">
                          {format(parseISO(m.created_at), 'h:mm a')}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={msgEndRef}/>
            </div>

            {/* input */}
            <div className="border-t border-gray-100 bg-white p-3 flex gap-2 items-end">
              <textarea
                rows={2}
                placeholder="Message KORVIA…"
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1A2B4A] resize-none"/>
              <button onClick={sendMessage} disabled={sendingMsg || !msgInput.trim()}
                className="bg-[#1A2B4A] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 self-end">
                {sendingMsg ? '…' : '→'}
              </button>
            </div>
          </div>
        )}

      </div>{/* end tab content */}
    </div>
  )
}
