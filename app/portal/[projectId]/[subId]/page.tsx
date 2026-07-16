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
interface Estimate { id?:string; type:'project'|'task'; task_id?:string; amount:string; notes:string }

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
  const [taskFiles,     setTaskFiles]     = useState<Record<string,any[]>>({})
  const [taskStatus,    setTaskStatus]    = useState<Record<string,string>>({})
  const [taskDates,     setTaskDates]     = useState<Record<string,{start:string;end:string}>>({})
  const [schedule,      setSchedule]      = useState({sub_arrival_time:'',sub_work_days:[] as string[],sub_schedule_notes:''})
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
  const [estScope,      setEstScope]      = useState<'project'|'task'>('project')
  const [saving,        setSaving]        = useState(false)
  const [savedDates,    setSavedDates]    = useState(false)
  const [sendingMsg,    setSendingMsg]    = useState(false)
  const [sendingReport, setSendingReport] = useState(false)
  const [submittingEst, setSubmittingEst] = useState(false)
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
      setMessages(d.messages||[])
      reloadFiles(d.files||[])

      const statusMap:Record<string,string> = {}
      const datesMap:Record<string,{start:string;end:string}> = {}
      ;(d.tasks||[]).forEach((t:any)=>{
        statusMap[t.id] = t.sub_status || t.status || 'pending'
        datesMap[t.id]  = { start: t.sub_start_date||'', end: t.sub_end_date||'' }
      })
      setTaskStatus(statusMap)
      setTaskDates(datesMap)
      setSchedule({
        sub_arrival_time:  d.sub?.sub_arrival_time   || '',
        sub_work_days:     d.sub?.sub_work_days       || [],
        sub_schedule_notes:d.sub?.sub_schedule_notes  || '',
      })

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

  /* ── handlers ────────────────────────────────────────────────────────── */
  async function updateStatus(taskId:string, val:string) {
    setTaskStatus(p=>({...p,[taskId]:val}))
    await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_task_status',task_id:taskId,status:val})})
  }

  async function saveDates(taskId:string) {
    setSaving(true)
    const {start,end} = taskDates[taskId]||{}
    await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_dates',task_id:taskId,sub_start_date:start,sub_end_date:end})})
    setSaving(false); setSavedDates(true)
    setTimeout(()=>setSavedDates(false),2000)
  }

  async function handleUpload(taskId:string, file:File) {
    setUploading(p=>({...p,[taskId]:true}))
    const fd = new FormData()
    fd.append('file',file); fd.append('task_id',taskId)
    await fetch(`${base}/upload`,{method:'POST',body:fd})
    const r = await fetch(base)
    if (r.ok) { const d=await r.json(); reloadFiles(d.files||[]) }
    setUploading(p=>({...p,[taskId]:false}))
  }

  async function saveSchedule() {
    setSaving(true)
    await fetch(base,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_schedule',...schedule})})
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
    setSubmittingEst(true)
    await fetch(`${base}/estimate`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:estScope,task_id:estScope==='task'?estTaskId:null,amount:estAmt,notes:estNotes})})
    const er = await fetch(`${base}/estimate`)
    if (er.ok) { const ed=await er.json(); setEstimates(ed.estimates||[]) }
    setEstAmt(''); setEstNotes(''); setEstTaskId('')
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
            <div className={cardCls}>
              <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Your Schedule</p>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Typical arrival time</label>
                  <input type="time" value={schedule.sub_arrival_time}
                    onChange={e=>setSchedule(p=>({...p,sub_arrival_time:e.target.value}))}
                    className={inputCls}/>
                </div>

                <div>
                  <label className={labelCls}>Working days</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {WORK_DAYS.map(d=>{
                      const active = schedule.sub_work_days.includes(d)
                      return (
                        <button key={d} onClick={()=>setSchedule(p=>({
                          ...p,
                          sub_work_days: active
                            ? p.sub_work_days.filter(x=>x!==d)
                            : [...p.sub_work_days,d]
                        }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition
                            ${active?'bg-blue-500 border-blue-400 text-white':'bg-white/5 border-white/20 text-white/60 hover:bg-white/10'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Schedule notes</label>
                  <textarea rows={3} value={schedule.sub_schedule_notes}
                    placeholder="e.g. Need access by 7am, lunch 12–1pm…"
                    onChange={e=>setSchedule(p=>({...p,sub_schedule_notes:e.target.value}))}
                    className={inputCls}/>
                </div>

                <button onClick={saveSchedule} disabled={saving} className={btnPrimary}>
                  {saving?'Saving…':'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TASKS ────────────────────────────────────────────────────── */}
        {activeTab==='tasks' && (
          <div className="space-y-4">
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

                  <div>
                    <label className={labelCls}>Update Status</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {STATUS_OPTIONS.map(opt=>(
                        <button key={opt.value} onClick={()=>updateStatus(task.id,opt.value)}
                          className={`text-xs px-2.5 py-1.5 rounded-xl border transition
                            ${st===opt.value?opt.cls+' ring-2 ring-offset-1 ring-offset-[#0f1e35] ring-current':'bg-white/5 border-white/15 text-white/60 hover:bg-white/10'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
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
                    {saving?'Saving…':savedDates?'✓ Saved!':'Save My Dates'}
                  </button>

                  <div>
                    <label className={labelCls}>Upload Photos / Docs</label>
                    <label className="mt-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/20 text-white/50 text-xs cursor-pointer hover:border-blue-400/50 hover:text-blue-300 transition">
                      <input type="file" className="sr-only" accept="image/*,application/pdf"
                        onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUpload(task.id,f) }}/>
                      {uploading[task.id]?'Uploading…':'📎 Tap to attach file'}
                    </label>
                    {files.length>0 && (
                      <div className="mt-2 space-y-1">
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

                {estScope==='task' && tasks.length>0 && (
                  <div>
                    <label className={labelCls}>Task</label>
                    <select value={estTaskId} onChange={e=>setEstTaskId(e.target.value)}
                      className={inputCls}>
                      <option value="">Select task…</option>
                      {tasks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
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

                <button onClick={submitEstimate} disabled={submittingEst||!estAmt} className={btnPrimary}>
                  {submittingEst?'Submitting…':'Submit Estimate 💰'}
                </button>
              </div>
            </div>

            {estimates.length>0 && (
              <div className={cardCls}>
                <p className="text-white/50 text-xs font-medium uppercase tracking-wide mb-3">Previous Estimates</p>
                <div className="space-y-2">
                  {estimates.map((e,i)=>{
                    const t = tasks.find((x:any)=>x.id===e.task_id)
                    return (
                      <div key={e.id||i} className="flex items-start gap-3 py-2 border-t border-white/10 first:border-0 first:pt-0">
                        <div className="flex-1">
                          <p className="text-white text-sm font-semibold">{fmtMoney(parseFloat(e.amount))}</p>
                          <p className="text-white/50 text-xs">{t?t.name:'Whole project'}</p>
                          {e.notes && <p className="text-white/40 text-xs mt-0.5">{e.notes}</p>}
                        </div>
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
