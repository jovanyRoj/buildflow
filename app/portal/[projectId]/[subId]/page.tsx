'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday } from 'date-fns'

/* ─── constants ─────────────────────────────────────────────────────────── */
const STATUS_OPTIONS = [
  { value:'in_progress',     label:'🟢 On Track',        cls:'border-green-400 bg-green-50 text-green-800'    },
  { value:'completed',       label:'✅ Completed',        cls:'border-emerald-400 bg-emerald-50 text-emerald-800'},
  { value:'pending',         label:'⏳ Pending',          cls:'border-gray-300 bg-gray-50 text-gray-600'       },
  { value:'delayed',         label:'🔴 Delayed',          cls:'border-red-400 bg-red-50 text-red-800'          },
  { value:'fail_inspection', label:'❌ Fail Inspection',  cls:'border-red-600 bg-red-100 text-red-900'         },
]
const WORK_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const REPORT_TYPES = [
  { value:'material_missing',  emoji:'📦', label:'Missing Material',  desc:'Material the builder needs to purchase' },
  { value:'safety_concern',    emoji:'⚠️', label:'Safety Concern',    desc:'Unsafe condition on site'               },
  { value:'schedule_conflict', emoji:'📅', label:'Schedule Conflict', desc:'Timing conflict with another trade'     },
  { value:'damage',            emoji:'🔨', label:'Damage Found',      desc:'Existing damage or defect found'        },
  { value:'other',             emoji:'📝', label:'Other',             desc:'General report or note'                 },
]
const URGENCY = [
  { value:'low',       label:'🟢 Low',       cls:'border-green-300 bg-green-50 text-green-800'   },
  { value:'medium',    label:'🟡 Medium',    cls:'border-yellow-300 bg-yellow-50 text-yellow-800' },
  { value:'high',      label:'🔴 High',      cls:'border-red-300 bg-red-50 text-red-800'          },
  { value:'emergency', label:'🆘 Emergency', cls:'border-red-500 bg-red-100 text-red-900'         },
] as const
type UrgencyValue = 'low'|'medium'|'high'|'emergency'

/* ─── interfaces ─────────────────────────────────────────────────────────── */
interface PortalMessage { id:string; sender:'sub'|'korvia'; content:string; created_at:string }
interface Estimate { id?:string; type:'project'|'task'; task_id?:string; amount:string; notes:string; approved_amount?:number|null; sub_proposed_amount?:number|null; sub_proposed_at?:string|null; final_agreed_amount?:number|null; final_agreed_at?:string|null }

/* ─── helpers ────────────────────────────────────────────────────────────── */
function mapsUrl(addr:string) {
  const enc = encodeURIComponent(addr)
  return /iPhone|iPad|Mac/.test(navigator.userAgent)
    ? `maps://maps.apple.com/?q=${enc}`
    : `https://maps.google.com/?q=${enc}`
}
function fmtMoney(n:number|null|undefined) {
  if (!n && n!==0) return null
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)
}
function daysLabel(d?:string|null) {
  if (!d) return null
  try {
    const dt = parseISO(d)
    if (isToday(dt)) return {text:'Today',cls:'text-orange-500 font-semibold'}
    const diff = differenceInDays(dt, new Date())
    if (diff<0)  return {text:`${Math.abs(diff)}d overdue`,cls:'text-red-500 font-semibold'}
    if (diff===0) return {text:'Due today',cls:'text-orange-500 font-semibold'}
    return {text:`${diff}d left`,cls:'text-blue-500'}
  } catch { return null }
}
function Pill({label,cls}:{label:string;cls:string}) {
  return <span className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
}
function Spinner() {
  return (
    <div className="min-h-screen bg-[#0f1e35] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl">🏗️</div>
      <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin"/>
      <p className="text-white/50 text-xs">Loading your portal…</p>
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────── */
export default function SubPortal() {
  const params    = useParams()
  const projectId = params.projectId as string
  const subId     = params.subId     as string

  const [status,        setStatus]        = useState<'loading'|'ok'|'fail'>('loading')
  const [project,       setProject]       = useState<any>(null)
  const [sub,           setSub]           = useState<any>(null)
  const [tasks,         setTasks]         = useState<any[]>([])
  const [messages,      setMessages]      = useState<PortalMessage[]>([])
  const [estimates,     setEstimates]     = useState<Estimate[]>([])
  const [allTasks,      setAllTasks]      = useState<any[]>([])
  const [taskFiles,     setTaskFiles]     = useState<Record<string,any[]>>({})
  const [taskStatus,    setTaskStatus]    = useState<Record<string,string>>({})
  const [taskDates,     setTaskDates]     = useState<Record<string,{start:string;end:string}>>({})
  const [dateSchedule,  setDateSchedule]  = useState<Record<string,{start:string;end:string}>>({})
  const [calOffset,     setCalOffset]     = useState(0)
  const [selDate,       setSelDate]       = useState<string|null>(null)
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [projectStatus, setProjectStatus] = useState('in_progress')
  const [uploadDesc,    setUploadDesc]    = useState<Record<string,string>>({})
  const [activeTab,     setActiveTab]     = useState('project')
  const [uploading,     setUploading]     = useState<Record<string,boolean>>({})
  const [askKorvia,     setAskKorvia]     = useState<Record<string,{open:boolean;q:string;a:string;loading:boolean}>>({})
  const [reportType,    setReportType]    = useState('')
  const [reportTask,    setReportTask]    = useState('')
  const [reportUrgency, setReportUrgency] = useState<UrgencyValue>('medium')
  const [reportDesc,    setReportDesc]    = useState('')
  const [msgInput,      setMsgInput]      = useState('')
  const [estAmt,        setEstAmt]        = useState('')
  const [estNotes,      setEstNotes]      = useState('')
  const [estTaskId,     setEstTaskId]     = useState('')
  const [estNewTaskName, setEstNewTaskName] = useState('')
  const [estScope,      setEstScope]      = useState<'project'|'task'>('task')
  const [saving,        setSaving]        = useState(false)
  const [savedTask,     setSavedTask]     = useState<Record<string,boolean>>({})
  const [statusSaving,  setStatusSaving]  = useState<Record<string,boolean>>({})
  const [statusSaved,   setStatusSaved]   = useState<Record<string,boolean>>({})
  const [sendingMsg,    setSendingMsg]    = useState(false)
  const [sendingReport, setSendingReport] = useState(false)
  const [submittingEst, setSubmittingEst] = useState(false)
  const [counterInput,   setCounterInput]   = useState<Record<string, string>>({})
  const [submittingCounter, setSubmittingCounter] = useState<Record<string, boolean>>({})
  const [counterSent,    setCounterSent]    = useState<Record<string, boolean>>({})
  const msgEndRef = useRef<HTMLDivElement>(null)

  const base = `/api/portal/${projectId}/${subId}`

  /* ── load ────────────────────────────────────────────────────────────── */
  function reloadFiles(files:any[]) {
    const map:Record<string,any[]> = {}
    ;(files||[]).forEach((f:any)=>{ if(f.task_id){ (map[f.task_id]??=[]).push(f) } })
    setTaskFiles(map)
  }

  async function loadPortal() {
    try {
      const r = await fetch(base)
      if (!r.ok) throw new Error('not_found')
      const d = await r.json()
      setProject(d.project)
      setSub(d.sub)
      setTasks(d.tasks||[])
      setAllTasks(d.allTasks||d.tasks||[])
      setMessages(d.messages||[])
      reloadFiles(d.files||[])

      const VALID_SUB_STATUSES = new Set(['in_progress','completed','pending','delayed','fail_inspection'])
      const statusMap:Record<string,string> = {}
      const datesMap:Record<string,{start:string;end:string}> = {}
      ;(d.tasks||[]).forEach((t:any)=>{
        const raw = t.status || 'pending'
        // 'active' is the builder default — map to in_progress so sub portal shows correctly
        statusMap[t.id] = VALID_SUB_STATUSES.has(raw) ? raw : 'in_progress'
        datesMap[t.id]  = { start: t.sub_start_date||'', end: t.sub_end_date||'' }
      })
      setTaskStatus(statusMap)
      setTaskDates(datesMap)
      setDateSchedule(d.sub?.sub_date_schedule || {})
      setScheduleNotes(d.sub?.sub_schedule_notes || '')

      try {
        const er = await fetch(`${base}/estimate`)
        if (er.ok) { const ed = await er.json(); setEstimates(ed.estimates||[]) }
      } catch {}

      setStatus('ok')
    } catch {
      setStatus('fail')
    }
  }

  useEffect(()=>{ loadPortal() },[])
  useEffect(()=>{ msgEndRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  // Poll messages every 30s so sub sees KORVIA notifications without refresh
  useEffect(()=>{
    const iv = setInterval(()=>{
      fetch(`/api/portal/${projectId}/${subId}`)
        .then(r=>r.ok?r.json():null)
        .then(d=>{ if(d?.messages) setMessages(d.messages) })
        .catch(()=>{})
    }, 30000)
    return ()=>clearInterval(iv)
  },[projectId, subId])
  // Auto-select first task when allTasks loads so scope=task always has a valid default
  useEffect(()=>{ if (allTasks.length > 0) setEstTaskId(prev => prev || allTasks[0].id) },[allTasks])

  /* ── handlers ────────────────────────────────────────────────────────── */
  // Just update local state — user must click "Save Status" to persist
  function selectStatus(taskId:string, val:string) {
    setTaskStatus(p=>({...p,[taskId]:val}))
    setTasks((prev:any[])=>prev.map(t=>t.id===taskId?{...t,status:val}:t))
  }

  async function saveStatus(taskId:string) {
    const val = taskStatus[taskId]
    if (!val) return
    setStatusSaving(p=>({...p,[taskId]:true}))
    try {
      const res = await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({task_id:taskId,status:val})})
      if (res.ok) {
        setStatusSaved(p=>({...p,[taskId]:true}))
        setTimeout(()=>setStatusSaved(p=>({...p,[taskId]:false})),2500)
        // Fire-and-forget KORVIA message
        const task = tasks.find((t:any)=>t.id===taskId)
        const stLabel = STATUS_OPTIONS.find(s=>s.value===val)?.label||val
        fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'send_message',
            content:`📋 Status updated: "${task?.name||taskId}" → ${stLabel}. Builder notified.`})
        }).catch(()=>{})
      }
    } catch {}
    setStatusSaving(p=>({...p,[taskId]:false}))
  }

  async function saveDates(taskId:string) {
    setSaving(true)
    const {start,end} = taskDates[taskId]||{}
    await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_dates',task_id:taskId,sub_start_date:start,sub_end_date:end})})
    // Also notify KORVIA so the timeline updates immediately
    const task = tasks.find((t:any)=>t.id===taskId)
    if (start || end) {
      await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'send_message',
          content:`📅 Date update for "${task?.name||taskId}": ${start||'TBD'} → ${end||'TBD'}. Please update the project timeline.`})})
    }
    setSaving(false)
    setSavedTask(p=>({...p,[taskId]:true}))
    setTimeout(()=>setSavedTask(p=>({...p,[taskId]:false})),2500)
  }

  async function handleUpload(taskId:string, file:File) {
    setUploading(p=>({...p,[taskId]:true}))
    const desc     = uploadDesc[taskId]||''
    const fileId   = crypto.randomUUID()
    const category = file.type.startsWith('image/') ? 'sub_photo' : 'sub_document'

    try {
      // Step 1 — get signed upload URL (no file sent to Vercel)
      const signRes = await fetch(`${base}/upload`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ fileId, filename: file.name, contentType: file.type,
          size: file.size, task_id: taskId, category, notes: desc||null }),
      })
      const signData = await signRes.json()
      if (!signRes.ok || !signData.signedUrl) throw new Error(signData.error ?? 'Could not get upload URL')

      // Step 2 — upload directly to Supabase Storage (bypasses Vercel 4.5MB limit)
      const putRes = await fetch(signData.signedUrl, {
        method: 'PUT', headers: {'Content-Type': file.type}, body: file,
      })
      if (!putRes.ok) throw new Error(`Storage upload failed: ${putRes.status}`)

      // Step 3 — confirm: record in bf_project_files
      await fetch(`${base}/upload/confirm`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ fileId: signData.fileId, path: signData.path,
          filename: file.name, contentType: file.type, size: file.size,
          task_id: taskId, category, notes: desc||null }),
      })

      // Notify KORVIA (fire-and-forget)
      if (desc) {
        const task = tasks.find((t:any)=>t.id===taskId)
        fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'send_message',
            content:`📎 Evidence uploaded for task "${task?.name||taskId}": ${desc} [File: ${file.name}]`})
        }).catch(()=>{})
      }
    } catch (err) {
      console.error('[handleUpload]', err)
    }

    const r = await fetch(base)
    if (r.ok) { const d=await r.json(); reloadFiles(d.files||[]); setMessages(d.messages||[]) }
    setUploadDesc(p=>({...p,[taskId]:''}))
    setUploading(p=>({...p,[taskId]:false}))
  }

  async function saveSchedule() {
    setSaving(true)
    const sortedDates = Object.keys(dateSchedule).sort()
    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'update_schedule',
        sub_date_schedule:  dateSchedule,
        sub_schedule_notes: scheduleNotes,
        sub_work_days:      [...new Set(sortedDates.map(d=>DOW[new Date(d+'T12:00:00').getDay()]))],
        sub_arrival_time:   dateSchedule[sortedDates[0]]?.start || '07:00',
      })})
    if (sortedDates.length > 0) {
      const lines = sortedDates.map(d=>`  ${d}: ${dateSchedule[d].start}–${dateSchedule[d].end}`).join('\n')
      await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'send_message',
          content:`📅 Schedule updated — ${sortedDates.length} day(s) planned:\n${lines}\nNotes: ${scheduleNotes||'none'}. Please update the project timeline.`})})
    }
    setSaving(false)
  }

  async function sendMessage() {
    if (!msgInput.trim()) return
    setSendingMsg(true)
    const r = await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'send_message',content:msgInput.trim()})})
    const d = await r.json()
    if (d.ok) {
      setMessages(p=>[...p, d.message, ...(d.korviaReply?[d.korviaReply]:[])])
      setMsgInput('')
    }
    setSendingMsg(false)
  }

  async function sendReport() {
    if (!reportType||!reportDesc.trim()) return
    setSendingReport(true)
    await fetch(`${base}/report`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:reportType,task_id:reportTask||null,urgency:reportUrgency,description:reportDesc})})
    setReportType(''); setReportTask(''); setReportDesc(''); setReportUrgency('medium')
    setSendingReport(false)
    alert('Report submitted. The builder will be notified.')
  }

  async function submitCounter(estimate: Estimate) {
    const eId = estimate.id ?? estimate.task_id ?? ''
    const val  = counterInput[eId]
    if (!val || !estimate.task_id) return
    setSubmittingCounter(p => ({ ...p, [eId]: true }))
    try {
      const r = await fetch(`${base}/estimate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: estimate.task_id, proposed_amount: parseFloat(val) }),
      })
      if (r.ok) {
        setCounterSent(p => ({ ...p, [eId]: true }))
        const er = await fetch(`${base}/estimate`)
        if (er.ok) { const ed = await er.json(); setEstimates(ed.estimates || []) }
      }
    } catch (_) {}
    setSubmittingCounter(p => ({ ...p, [eId]: false }))
  }

  async function askKorviaFn(taskId:string) {
    const q = askKorvia[taskId]?.q||''
    if (!q.trim()) return
    setAskKorvia(p=>({...p,[taskId]:{...p[taskId],loading:true,a:''}}))
    const r = await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'ask_korvia',task_id:taskId,question:q})})
    const d = await r.json()
    setAskKorvia(p=>({...p,[taskId]:{...p[taskId],loading:false,a:d.answer||d.korviaReply?.content||''}}))
  }

  async function submitEstimate() {
    if (!estAmt) return
    if (estScope === 'task' && !estNewTaskName.trim()) return
    setSubmittingEst(true)
    await fetch(`${base}/estimate`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type: estScope,
        new_task_name: estScope === 'task' ? estNewTaskName.trim() : undefined,
        amount: Number(estAmt),
        notes: estNotes,
      })})
    const er = await fetch(`${base}/estimate`)
    if (er.ok) { const ed=await er.json(); setEstimates(ed.estimates||[]) }
    // notify KORVIA for timeline/budget update
    const scopeLabel = estScope === 'task' ? `nueva tarea "${estNewTaskName.trim()}"` : 'the whole project'
    await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'send_message',
        content:`💰 New estimate submitted: $${Number(estAmt).toLocaleString()} for ${scopeLabel}. Notes: ${estNotes||'none'}. Please update the project budget and timeline.`})})
    setEstAmt(''); setEstNotes(''); setEstNewTaskName('')
    setSubmittingEst(false)
  }

  /* ── early returns ───────────────────────────────────────────────────── */
  if (status==='loading') return <Spinner/>
  if (status==='fail') return (
    <div className="min-h-screen bg-[#0f1e35] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">🚧</div>
      <h1 className="text-white font-bold text-xl">Portal not found</h1>
      <p className="text-white/50 text-sm">This link may be invalid or expired. Contact your builder.</p>
    </div>
  )

  /* ── tabs config ─────────────────────────────────────────────────────── */
  const TABS = [
    {id:'project',   icon:'🏠', label:'Project'},
    {id:'schedule',  icon:'📅', label:'Schedule'},
    {id:'tasks',     icon:'📋', label:'Tasks'},
    {id:'messages',  icon:'💬', label:'Messages'},
    {id:'estimates', icon:'💰', label:'Estimates'},
    {id:'report',    icon:'⚠️', label:'Report'},
  ]

  const inputCls   = "w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder:text-white/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/60"
  const labelCls   = "block text-xs text-white/50 mb-1 font-medium uppercase tracking-wide"
  const cardCls    = "bg-white/5 rounded-2xl p-4 border border-white/10"
  const btnPrimary = "w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition disabled:opacity-40"

  /* ── calendar helpers (computed after early returns, project is loaded) ── */
  const projStart    = project?.start_date ? parseISO(project.start_date) : new Date()
  const calBaseY     = projStart.getFullYear()
  const calBaseM     = projStart.getMonth()
  const calView      = new Date(calBaseY, calBaseM + calOffset, 1)
  const calYear      = calView.getFullYear()
  const calMonth     = calView.getMonth()
  const calFirstDOW  = calView.getDay()           // 0=Sun
  const calDaysInMo  = new Date(calYear, calMonth+1, 0).getDate()
  const projStartStr = project?.start_date ? format(projStart,'yyyy-MM-dd') : ''
  const CAL_HEADS    = ['Su','Mo','Tu','We','Th','Fr','Sa']
  function calDateStr(d:number) {
    return `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  /* overall status pill derived from tasks */
  const allSt = Object.values(taskStatus)
  const statusSummary =
    allSt.includes('delayed')||allSt.includes('fail_inspection') ? STATUS_OPTIONS.find(s=>s.value==='delayed')! :
    allSt.includes('in_progress')                                ? STATUS_OPTIONS.find(s=>s.value==='in_progress')! :
    allSt.every(s=>s==='completed')&&allSt.length>0             ? STATUS_OPTIONS.find(s=>s.value==='completed')! :
                                                                   STATUS_OPTIONS.find(s=>s.value==='pending')!

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0f1e35] text-white">

      {/* HEADER */}
      <div className="bg-gradient-to-b from-[#0a1628] to-[#0f1e35] px-4 pt-12 pb-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-2xl flex-shrink-0">
            🏗️
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">{project?.name||'Project'}</h1>
            <p className="text-white/60 text-xs mt-0.5">{sub?.company||sub?.name||'Subcontractor'}</p>
            {project?.address && (
              <a href={mapsUrl(project.address)}
                className="inline-flex items-center gap-1 mt-1.5 text-blue-300 text-xs hover:text-blue-200 underline underline-offset-2">
                📍 {project.address}
              </a>
            )}
          </div>
          <div className="flex-shrink-0">
            <Pill label={statusSummary.label} cls={statusSummary.cls}/>
          </div>
        </div>

        {/* dates strip */}
        {(project?.start_date||project?.end_date) && (
          <div className="mt-4 flex gap-3">
            {project?.start_date && (
              <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Start</p>
                <p className="text-white text-sm font-semibold mt-0.5">{format(parseISO(project.start_date),'MMM d, yyyy')}</p>
              </div>
            )}
            {project?.end_date && (
              <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Deadline</p>
                <p className="text-white text-sm font-semibold mt-0.5">{format(parseISO(project.end_date),'MMM d, yyyy')}</p>
                {daysLabel(project.end_date) && (
                  <p className={`text-[10px] mt-0.5 ${daysLabel(project.end_date)!.cls}`}>{daysLabel(project.end_date)!.text}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DISCLAIMER */}
      <div className="mx-4 mt-1 mb-4 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2.5 flex gap-2 items-start">
        <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
        <p className="text-amber-200/80 text-xs">This portal is for your assigned work only. All activity is logged and shared with the project builder.</p>
      </div>

      {/* TABS */}
      <div className="flex overflow-x-auto gap-1 px-4 pb-2 scrollbar-hide">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition whitespace-nowrap
              ${activeTab===t.id
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="px-4 pb-32 mt-2 space-y-4">

        {/* ── PROJECT INFO ─────────────────────────────────────────────── */}
        {activeTab==='project' && (
          <div className="space-y-4">
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Project Details</p>
              <div className="space-y-3">
                {project?.description && (
                  <div>
                    <p className={labelCls}>Description</p>
                    <p className="text-white/80 text-sm">{project.description}</p>
                  </div>
                )}
                {project?.address && (
                  <div>
                    <p className={labelCls}>Address</p>
                    <a href={mapsUrl(project.address)}
                      className="text-blue-300 text-sm hover:text-blue-200 underline underline-offset-2">
                      📍 {project.address}
                    </a>
                  </div>
                )}
                {project?.city && (
                  <div>
                    <p className={labelCls}>City</p>
                    <p className="text-white/80 text-sm">{project.city}{project.state?`, ${project.state}`:''}</p>
                  </div>
                )}
                {fmtMoney(project?.budget) && (
                  <div>
                    <p className={labelCls}>Budget</p>
                    <p className="text-white/80 text-sm">{fmtMoney(project.budget)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Your Assignment</p>
              <div className="space-y-2">
                <div>
                  <p className={labelCls}>Trade / Scope</p>
                  <p className="text-white/80 text-sm">{sub?.trade||sub?.company||'—'}</p>
                </div>
                <div>
                  <p className={labelCls}>Contact</p>
                  <p className="text-white/80 text-sm">{sub?.phone||sub?.email||'—'}</p>
                </div>
                {sub?.notes && (
                  <div>
                    <p className={labelCls}>Notes from builder</p>
                    <p className="text-white/80 text-sm">{sub.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Progress Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Total tasks</span>
                  <span className="font-semibold">{tasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Completed</span>
                  <span className="font-semibold text-emerald-400">{Object.values(taskStatus).filter(s=>s==='completed').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">In progress</span>
                  <span className="font-semibold text-green-400">{Object.values(taskStatus).filter(s=>s==='in_progress').length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Delayed / Issues</span>
                  <span className="font-semibold text-red-400">{Object.values(taskStatus).filter(s=>s==='delayed'||s==='fail_inspection').length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE ─────────────────────────────────────────────────── */}
        {activeTab==='schedule' && (
          <div className="space-y-4">

            {/* month calendar */}
            <div className={cardCls}>
              <p className="text-white/30 text-[10px] mb-3">
                Tap a date to mark your working days starting from the project start.
                KORVIA will update the timeline automatically when you save.
              </p>

              {/* month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={()=>setCalOffset(p=>Math.max(0,p-1))}
                  disabled={calOffset===0}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 disabled:opacity-25 hover:bg-white/10 transition text-lg font-light flex items-center justify-center">
                  ‹
                </button>
                <div className="text-center">
                  <p className="text-white font-semibold text-sm">{format(calView,'MMMM yyyy')}</p>
                  {calOffset===0 && projStartStr && (
                    <p className="text-blue-300 text-[10px]">Project starts {format(projStart,'MMM d')}</p>
                  )}
                </div>
                <button onClick={()=>setCalOffset(p=>p+1)}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition text-lg font-light flex items-center justify-center">
                  ›
                </button>
              </div>

              {/* day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {CAL_HEADS.map(h=>(
                  <div key={h} className="text-center text-[10px] text-white/25 font-medium py-1">{h}</div>
                ))}
              </div>

              {/* day cells */}
              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({length:calFirstDOW}).map((_,i)=><div key={`e${i}`}/>)}
                {Array.from({length:calDaysInMo}).map((_,i)=>{
                  const day      = i+1
                  const ds       = calDateStr(day)
                  const isPast   = projStartStr && ds < projStartStr
                  const isOn     = !!dateSchedule[ds]
                  const isSel    = selDate===ds
                  const isToday  = ds===format(new Date(),'yyyy-MM-dd')
                  return (
                    <button key={day}
                      disabled={!!isPast}
                      onClick={()=>{
                        if (isPast) return
                        if (isSel) { setSelDate(null); return }
                        setSelDate(ds)
                        if (!isOn) setDateSchedule(p=>({...p,[ds]:{start:'07:00',end:'17:00'}}))
                      }}
                      className={`relative mx-auto flex items-center justify-center w-9 h-9 rounded-xl text-xs font-medium transition
                        ${isPast
                          ? 'text-white/12 cursor-not-allowed'
                          : isOn
                          ? isSel
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-300 ring-offset-1 ring-offset-[#0f1e35]'
                            : 'bg-blue-500/25 border border-blue-400/50 text-blue-200'
                          : isSel
                          ? 'bg-white/15 text-white border border-white/30'
                          : isToday
                          ? 'border border-blue-400/40 text-blue-300 hover:bg-white/10'
                          : 'text-white/70 hover:bg-white/10'}`}>
                      {day}
                      {isOn && !isSel && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400"/>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* selected date time picker */}
            {selDate && dateSchedule[selDate] && (
              <div className={cardCls+' space-y-3 border-blue-400/30'}>
                <div className="flex items-center justify-between">
                  <p className="text-white font-medium text-sm">
                    📅 {format(parseISO(selDate),'EEEE, MMM d, yyyy')}
                  </p>
                  <button onClick={()=>{
                    setDateSchedule(p=>{ const n={...p}; delete n[selDate]; return n })
                    setSelDate(null)
                  }} className="text-red-400/70 text-xs hover:text-red-300 transition">
                    Remove day
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Arrival time</label>
                    <input type="time" value={dateSchedule[selDate].start}
                      onChange={e=>setDateSchedule(p=>({...p,[selDate]:{...p[selDate],start:e.target.value}}))}
                      className={inputCls}/>
                  </div>
                  <div>
                    <label className={labelCls}>Departure time</label>
                    <input type="time" value={dateSchedule[selDate].end}
                      onChange={e=>setDateSchedule(p=>({...p,[selDate]:{...p[selDate],end:e.target.value}}))}
                      className={inputCls}/>
                  </div>
                </div>
                <p className="text-white/30 text-[10px]">
                  Hours on site: {(()=>{
                    const [sh,sm]=dateSchedule[selDate].start.split(':').map(Number)
                    const [eh,em]=dateSchedule[selDate].end.split(':').map(Number)
                    const hrs=((eh*60+em)-(sh*60+sm))/60
                    return hrs>0?`${hrs.toFixed(1)}h`:'—'
                  })()}
                </p>
              </div>
            )}

            {/* scheduled dates summary */}
            {Object.keys(dateSchedule).length>0 && (
              <div className={cardCls}>
                <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">
                  Planned Working Days ({Object.keys(dateSchedule).length})
                </p>
                <div className="space-y-0 max-h-52 overflow-y-auto pr-1">
                  {Object.keys(dateSchedule).sort().map(d=>{
                    const [sh,sm]=dateSchedule[d].start.split(':').map(Number)
                    const [eh,em]=dateSchedule[d].end.split(':').map(Number)
                    const hrs=((eh*60+em)-(sh*60+sm))/60
                    return (
                      <div key={d} onClick={()=>setSelDate(d==='_sel'?null:d)}
                        className={`flex items-center justify-between py-2 border-t border-white/5 first:border-0 cursor-pointer
                          ${selDate===d?'text-blue-200':'text-white/80'}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold w-24">{format(parseISO(d),'EEE, MMM d')}</span>
                          <span className="text-white/40 text-xs">{dateSchedule[d].start}–{dateSchedule[d].end}</span>
                          <span className="text-white/25 text-[10px]">{hrs>0?`${hrs.toFixed(0)}h`:''}</span>
                        </div>
                        <button onClick={e=>{e.stopPropagation();setDateSchedule(p=>{const n={...p};delete n[d];return n});if(selDate===d)setSelDate(null)}}
                          className="text-white/15 hover:text-red-400 text-xs transition px-1">✕</button>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-[10px] text-white/40">
                  <span>Total hours: {Object.values(dateSchedule).reduce((acc,d)=>{
                    const [sh,sm]=d.start.split(':').map(Number)
                    const [eh,em]=d.end.split(':').map(Number)
                    return acc+((eh*60+em)-(sh*60+sm))/60
                  },0).toFixed(0)}h</span>
                  <span>{Object.keys(dateSchedule).length} days</span>
                </div>
              </div>
            )}

            {/* notes */}
            <div className={cardCls}>
              <label className={labelCls}>Notes for KORVIA & builder</label>
              <textarea rows={2} value={scheduleNotes}
                placeholder="Access requirements, special conditions, break times…"
                onChange={e=>setScheduleNotes(e.target.value)}
                className={inputCls}/>
            </div>

            <button onClick={saveSchedule} disabled={saving} className={btnPrimary}>
              {saving?'Saving & notifying KORVIA…':'Save Schedule & Notify KORVIA 📅'}
            </button>
          </div>
        )}

        {/* ── TASKS ────────────────────────────────────────────────────── */}
        {activeTab==='tasks' && (
          <div className="space-y-4">

            {/* PROJECT-LEVEL STATUS */}
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Overall Project Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt=>(
                  <button key={opt.value}
                    onClick={async()=>{
                      setProjectStatus(opt.value)
                      await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({action:'update_project_status',status:opt.value})})
                    }}
                    className={`text-xs px-3 py-2 rounded-xl border font-medium transition
                      ${projectStatus===opt.value
                        ? opt.cls+' ring-2 ring-offset-1 ring-offset-[#0f1e35] ring-current'
                        : 'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-white/30 text-[10px] mt-2">This reports your overall progress to the builder and KORVIA.</p>
            </div>

            {tasks.length===0 && (
              <div className={cardCls+' text-center py-8'}>
                <p className="text-3xl mb-2">📋</p>
                <p className="text-white/60 text-sm">No tasks assigned yet.</p>
                <p className="text-white/40 text-xs mt-1">The builder will assign tasks once the project begins.</p>
              </div>
            )}
            {tasks.map(task=>{
              const st    = taskStatus[task.id]||'pending'
              const stOpt = STATUS_OPTIONS.find(s=>s.value===st)||STATUS_OPTIONS[2]
              const dates = taskDates[task.id]||{start:'',end:''}
              const files = taskFiles[task.id]||[]
              const kv    = askKorvia[task.id]||{open:false,q:'',a:'',loading:false}
              const dl    = daysLabel(task.sub_end_date||task.end_date)
              return (
                <div key={task.id} className={cardCls+' space-y-4'}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight">{task.name}</h3>
                      {task.description && <p className="text-white/50 text-xs mt-0.5">{task.description}</p>}
                      {dl && <p className={`text-xs mt-1 ${dl.cls}`}>{dl.text}</p>}
                    </div>
                    <Pill label={stOpt.label} cls={stOpt.cls}/>
                  </div>

                  {/* ── Builder agreed amount banner ── */}
                  {task.sub_approved_amount != null && (
                    <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-2xl p-3">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide mb-0.5">💰 Monto Acordado por el Builder</p>
                      <p className="text-xl font-extrabold text-emerald-300">{fmtMoney(task.sub_approved_amount)}</p>
                      {task.sub_quoted_cost != null && task.sub_approved_amount !== task.sub_quoted_cost && (
                        <p className="text-[10px] text-emerald-400/70 mt-1">
                          Tu cotización: {fmtMoney(task.sub_quoted_cost)}{' · '}
                          {task.sub_approved_amount < task.sub_quoted_cost ? '⬇ Negociado a la baja' : '⬆ Ajustado al alza'}
                        </p>
                      )}
                      {task.sub_quoted_cost != null && task.sub_approved_amount === task.sub_quoted_cost && (
                        <p className="text-[10px] text-emerald-400/70 mt-1">✅ Igual a tu cotización original</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className={labelCls}>Update Status</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {STATUS_OPTIONS.map(opt=>(
                        <button key={opt.value} onClick={()=>selectStatus(task.id,opt.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-xl border transition
                            ${st===opt.value?opt.cls+' ring-2 ring-offset-1 ring-offset-[#0f1e35] ring-current':'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>saveStatus(task.id)}
                      disabled={statusSaving[task.id]}
                      className={`mt-2 w-full text-xs py-2 rounded-xl border font-semibold transition
                        ${statusSaved[task.id]
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : statusSaving[task.id]
                            ? 'bg-white/5 border-white/15 text-white/40 cursor-not-allowed'
                            : 'bg-blue-500/20 border-blue-400 text-blue-300 hover:bg-blue-500/30'}`}>
                      {statusSaved[task.id] ? '✓ Status Saved & KORVIA Notified!' : statusSaving[task.id] ? 'Saving…' : 'Save Status 💾'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>My Start Date</label>
                      <input type="date" value={dates.start}
                        onChange={e=>setTaskDates(p=>({...p,[task.id]:{...dates,start:e.target.value}}))}
                        className={inputCls}/>
                    </div>
                    <div>
                      <label className={labelCls}>My End Date</label>
                      <input type="date" value={dates.end}
                        onChange={e=>setTaskDates(p=>({...p,[task.id]:{...dates,end:e.target.value}}))}
                        className={inputCls}/>
                    </div>
                  </div>
                  <button onClick={()=>saveDates(task.id)} disabled={saving} className={btnPrimary}>
                    {savedTask[task.id]?'✓ Dates Saved & KORVIA Notified!':saving?'Saving…':'Save My Dates 💾'}
                  </button>

                  {/* ── EVIDENCE UPLOAD ── */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                    <p className="text-white/50 text-xs font-medium uppercase tracking-wide">📎 Evidence for KORVIA</p>
                    <p className="text-white/30 text-[10px]">Upload inspection photos or PDFs. KORVIA reads your description to notify the builder automatically.</p>

                    <textarea rows={2}
                      value={uploadDesc[task.id]||''}
                      placeholder="Describe what you're uploading — e.g. Inspection passed, framing complete. or Crack found in east wall slab."
                      onChange={e=>setUploadDesc(p=>({...p,[task.id]:e.target.value}))}
                      className={inputCls+' text-xs'}/>

                    <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition
                      ${uploading[task.id]
                        ? 'border-blue-400/40 text-blue-300 cursor-wait'
                        : 'border-white/20 text-white/50 cursor-pointer hover:border-blue-400/50 hover:text-blue-300'}`}>
                      <input type="file" className="sr-only" accept="image/*,application/pdf"
                        disabled={uploading[task.id]}
                        onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUpload(task.id,f) }}/>
                      {uploading[task.id]
                        ? <><span className="animate-pulse">⏳</span> Uploading &amp; notifying KORVIA…</>
                        : <><span>📷</span> Tap to upload photo or PDF</>}
                    </label>

                    {files.length>0 && (
                      <div className="space-y-1 pt-1 border-t border-white/10">
                        <p className="text-white/30 text-[10px] uppercase tracking-wide">Uploaded files</p>
                        {files.map((f:any,i:number)=>(
                          <a key={i} href={f.url||f.file_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200 py-1">
                            📄 {f.file_name||f.name||`File ${i+1}`}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-3">
                    <button onClick={()=>setAskKorvia(p=>({...p,[task.id]:{...kv,open:!kv.open}}))}
                      className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200">
                      🤖 Ask KORVIA about this task
                      <span className="text-white/30">{kv.open?'▲':'▼'}</span>
                    </button>
                    {kv.open && (
                      <div className="mt-2 space-y-2">
                        <textarea rows={2} value={kv.q} placeholder="What do you need to know?"
                          onChange={e=>setAskKorvia(p=>({...p,[task.id]:{...kv,q:e.target.value}}))}
                          className={inputCls}/>
                        <button onClick={()=>askKorviaFn(task.id)} disabled={kv.loading}
                          className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-40">
                          {kv.loading?'Thinking…':'Ask KORVIA'}
                        </button>
                        {kv.a && (
                          <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-xl p-3 text-xs text-indigo-100 whitespace-pre-wrap">
                            🤖 {kv.a}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── MESSAGES ─────────────────────────────────────────────────── */}
        {activeTab==='messages' && (
          <div className="space-y-4">
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Messages with KORVIA</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {messages.length===0 && (
                  <p className="text-white/30 text-xs text-center py-4">No messages yet. Say hello!</p>
                )}
                {messages.map(m=>(
                  <div key={m.id} className={`flex ${m.sender==='sub'?'justify-end':'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm
                      ${m.sender==='sub'
                        ? 'bg-blue-500 text-white rounded-br-sm'
                        : 'bg-white/10 text-white/90 rounded-bl-sm'}`}>
                      {m.sender==='korvia' && <p className="text-[10px] text-white/40 mb-0.5 font-medium">KORVIA 🤖</p>}
                      <p>{m.content}</p>
                      <p className={`text-[10px] mt-0.5 ${m.sender==='sub'?'text-blue-200':'text-white/30'}`}>
                        {format(parseISO(m.created_at),'h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef}/>
              </div>
            </div>

            <div className={cardCls}>
              <label className={labelCls}>Send a message</label>
              <textarea rows={3} value={msgInput} placeholder="Type your message…"
                onChange={e=>setMsgInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }}
                className={inputCls+' mt-1'}/>
              <button onClick={sendMessage} disabled={sendingMsg||!msgInput.trim()} className={btnPrimary+' mt-2'}>
                {sendingMsg?'Sending…':'Send Message 📤'}
              </button>
            </div>
          </div>
        )}

        {/* ── ESTIMATES ────────────────────────────────────────────────── */}
        {activeTab==='estimates' && (
          <div className="space-y-4">
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Submit Estimate</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Estimate scope</label>
                  <div className="flex gap-2 mt-1">
                    {(['project','task'] as const).map(s=>(
                      <button key={s} onClick={()=>setEstScope(s)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border transition
                          ${estScope===s?'bg-blue-500 border-blue-400 text-white':'bg-white/5 border-white/20 text-white/60 hover:bg-white/10'}`}>
                        {s==='project'?'Whole project':'Specific task'}
                      </button>
                    ))}
                  </div>
                </div>

                {estScope==='task' && (
                  <div>
                    <label className={labelCls}>New task name</label>
                    <input
                      type="text"
                      value={estNewTaskName}
                      placeholder="e.g. Extra concrete pour, Return visit…"
                      onChange={e=>setEstNewTaskName(e.target.value)}
                      className={inputCls}
                    />
                    <p className="text-white/30 text-[10px] mt-1">Describe the extra work not in the original scope. A new task will be created automatically.</p>
                  </div>
                )}

                <div>
                  <label className={labelCls}>Amount (USD)</label>
                  <input type="number" min="0" value={estAmt} placeholder="e.g. 4500"
                    onChange={e=>setEstAmt(e.target.value)} className={inputCls}/>
                </div>

                <div>
                  <label className={labelCls}>Notes / Breakdown</label>
                  <textarea rows={3} value={estNotes} placeholder="Labor, materials, timeline…"
                    onChange={e=>setEstNotes(e.target.value)} className={inputCls}/>
                </div>

                <button onClick={submitEstimate} disabled={submittingEst||!estAmt||(estScope==='task'&&!estNewTaskName.trim())} className={btnPrimary}>
                  {submittingEst?'Submitting…':'Submit Estimate 💰'}
                </button>
              </div>
            </div>

            {estimates.length>0 && (
              <div className={cardCls}>
                <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">📋 Tu Historial de Estimados</p>
                <div className="space-y-3">
                  {estimates.map((e,i)=>{
                    const t          = allTasks.find((x:any)=>x.id===e.task_id)
                    const hasFinal   = e.final_agreed_amount != null
                    const hasAgreed  = e.approved_amount != null
                    const hasCounter = e.sub_proposed_amount != null
                    const subAmt     = parseFloat(e.amount) || 0
                    const counterAmt = e.sub_proposed_amount ?? 0
                    const builderAmt = e.approved_amount ?? 0
                    const finalAmt   = e.final_agreed_amount ?? 0
                    const eId        = e.id ?? e.task_id ?? String(i)
                    const isSending  = submittingCounter[eId]
                    const wasSent    = counterSent[eId]
                    return (
                      <div key={e.id||i} className="bg-white/5 rounded-2xl border border-white/10 p-3 space-y-2.5">

                        {/* Task label + status badge */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-white/70 text-xs font-semibold truncate">{t ? t.name : 'Proyecto completo'}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${hasFinal ? 'bg-emerald-500/25 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                            {hasFinal ? '✅ Finalizado' : '⏳ Pendiente'}
                          </span>
                        </div>

                        {/* 4-value comparison grid */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {/* 1. Tu Cotización */}
                          <div className="bg-white/8 rounded-xl p-2 text-center">
                            <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Tu Cotiz.</p>
                            <p className="text-xs font-extrabold text-white">{fmtMoney(subAmt)}</p>
                          </div>
                          {/* 2. Tu Propuesta */}
                          <div className={`rounded-xl border p-2 text-center ${hasCounter ? 'bg-blue-500/15 border-blue-400/25' : 'bg-white/5 border-white/10'}`}>
                            <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Tu Prop.</p>
                            <p className={`text-xs font-extrabold ${hasCounter ? 'text-blue-300' : 'text-white/20'}`}>
                              {hasCounter ? fmtMoney(counterAmt) : '—'}
                            </p>
                          </div>
                          {/* 3. Builder Propone */}
                          <div className={`rounded-xl border p-2 text-center ${hasAgreed ? 'bg-orange-500/15 border-orange-400/25' : 'bg-white/5 border-white/10'}`}>
                            <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Builder</p>
                            <p className={`text-xs font-extrabold ${hasAgreed ? 'text-orange-300' : 'text-white/20'}`}>
                              {hasAgreed ? fmtMoney(builderAmt) : '—'}
                            </p>
                          </div>
                          {/* 4. Acordado Final */}
                          <div className={`rounded-xl border p-2 text-center ${hasFinal ? 'bg-emerald-500/15 border-emerald-400/25' : 'bg-white/5 border-white/10'}`}>
                            <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Acordado</p>
                            <p className={`text-xs font-extrabold ${hasFinal ? 'text-emerald-300' : 'text-white/20'}`}>
                              {hasFinal ? fmtMoney(finalAmt) : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Final agreed locked banner */}
                        {hasFinal && (
                          <div className="text-center py-2 rounded-xl text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-400/20">
                            ✅ Acuerdo final: {fmtMoney(finalAmt)} — bloqueado por builder y sub
                          </div>
                        )}

                        {/* Counter-proposal section — only for task estimates, not yet agreed */}
                        {e.task_id && !hasFinal && (
                          <div className="bg-blue-500/8 border border-blue-400/20 rounded-xl p-3 space-y-2">
                            <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wide">
                              💬 {hasCounter ? 'Tu propuesta enviada' : 'Proponer monto alternativo'}
                            </p>
                            {hasCounter && !wasSent ? (
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-blue-200 text-sm font-bold">{fmtMoney(counterAmt)}</p>
                                <span className="text-[10px] text-yellow-300 bg-yellow-500/15 px-2 py-0.5 rounded-full">⏳ Esperando respuesta</span>
                              </div>
                            ) : null}
                            {(!hasCounter || wasSent) && (
                              <div className="space-y-2">
                                {wasSent && (
                                  <div className="text-[10px] text-emerald-300 font-semibold">✅ Propuesta enviada al builder</div>
                                )}
                                <div className="flex gap-2 items-center">
                                  <div className="relative flex-1">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40">$</span>
                                    <input type="number" min="0" placeholder={String(subAmt || '')}
                                      value={counterInput[eId] ?? ''}
                                      onChange={ev=>setCounterInput(p=>({...p,[eId]:ev.target.value}))}
                                      className="w-full pl-5 pr-2 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-semibold placeholder:text-white/25 focus:outline-none focus:border-blue-400"/>
                                  </div>
                                  <button
                                    onClick={()=>setCounterInput(p=>({...p,[eId]:String(subAmt)}))}
                                    className="shrink-0 text-[10px] px-2 py-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/15 border border-white/10 transition">
                                    Usar mi cotiz.
                                  </button>
                                </div>
                                <button onClick={()=>submitCounter(e)}
                                  disabled={isSending || !counterInput[eId]}
                                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition disabled:opacity-40">
                                  {isSending ? 'Enviando…' : '📤 Proponer este monto al builder'}
                                </button>
                                <p className="text-[10px] text-white/30 text-center">KORVIA notificará al builder con tu propuesta</p>
                              </div>
                            )}
                          </div>
                        )}

                        {e.notes && <p className="text-white/40 text-[11px]">📝 {e.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REPORT ───────────────────────────────────────────────────── */}
        {activeTab==='report' && (
          <div className="space-y-4">
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Submit a Report</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Report type</label>
                  <div className="grid grid-cols-1 gap-2 mt-1">
                    {REPORT_TYPES.map(rt=>(
                      <button key={rt.value} onClick={()=>setReportType(rt.value)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition
                          ${reportType===rt.value?'bg-white/15 border-blue-400':'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                        <span className="text-xl leading-none">{rt.emoji}</span>
                        <div>
                          <p className="text-white text-sm font-medium">{rt.label}</p>
                          <p className="text-white/40 text-xs">{rt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {tasks.length>0 && (
                  <div>
                    <label className={labelCls}>Related task (optional)</label>
                    <select value={reportTask} onChange={e=>setReportTask(e.target.value)}
                      className={inputCls}>
                      <option value="">General / not task-specific</option>
                      {tasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelCls}>Urgency</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {URGENCY.map(u=>(
                      <button key={u.value} onClick={()=>setReportUrgency(u.value)}
                        className={`flex-1 min-w-[5rem] py-2 rounded-xl text-xs font-medium border transition
                          ${reportUrgency===u.value?u.cls+' ring-2 ring-offset-1 ring-offset-[#0f1e35] ring-current':'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'}`}>
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Description</label>
                  <textarea rows={4} value={reportDesc} placeholder="Describe the issue in detail…"
                    onChange={e=>setReportDesc(e.target.value)} className={inputCls}/>
                </div>

                <button onClick={sendReport} disabled={sendingReport||!reportType||!reportDesc.trim()} className={btnPrimary}>
                  {sendingReport?'Submitting…':'Submit Report ⚠️'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end tab content */}
    </div>
  )
}
