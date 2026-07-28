'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays, addDays, isValid } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import { TIMELINE_BAR_COLORS } from '@/lib/colors'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import Link from 'next/link'

const DAY_WIDTH = 28

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

function safeParseISO(d: string | null | undefined) {
  if (!d) return null
  try { const p = parseISO(d); return isValid(p) ? p : null } catch { return null }
}

const STATUS_LABEL: Record<string,string> = {
  completed: '✅ Completed', in_progress: '🟢 On Track', delayed: '🔴 Delayed',
  pending: '⏳ Pending', active: '🔵 Active', fail_inspection: '❌ Fail Inspect',
}

export default function TimelinePage() {
  const params    = useParams()
  const router    = useRouter()
  const { getProject, refreshProjects } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project   = getProject(params.id as string)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [syncTasks,    setSyncTasks]    = useState<any[]>([])
  const [activity,     setActivity]     = useState<any[]>([])
  const [lastSync,     setLastSync]     = useState('')
  const [syncing,      setSyncing]      = useState(false)
  const [showActivity, setShowActivity] = useState(true)

  const fetchSync = useCallback(async () => {
    if (!project?.id) return
    setSyncing(true)
    try {
      const r = await fetch(`/api/builder/project-sync/${project.id}`)
      if (r.ok) {
        const d = await r.json()
        setSyncTasks(d.tasks ?? [])
        setActivity(d.activity ?? [])
        setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      }
    } catch {}
    setSyncing(false)
  }, [project?.id])

  useEffect(() => {
    refreshProjects()
    fetchSync()
  }, []) // eslint-disable-line

  // Poll every 20s
  useEffect(() => {
    if (!project?.id) return
    const id = setInterval(fetchSync, 20000)
    return () => clearInterval(id)
  }, [project?.id, fetchSync])

  if (!ready || !project) return <Spinner />

  const tasks        = [...project.tasks].sort((a, b) => a.order - b.order)
  const projectStart = safeParseISO(project.startDate) ?? new Date()
  const projectEnd   = safeParseISO(project.estimatedEndDate) ?? addDays(projectStart, 90)
  const totalDays    = Math.max(differenceInDays(projectEnd, projectStart) + 7, 30)
  const timelineWidth = totalDays * DAY_WIDTH

  // Build syncTask lookup by ID
  const syncById: Record<string, any> = {}
  for (const t of syncTasks) syncById[t.id] = t

  // Month headers
  const months: { label: string; offset: number; width: number }[] = []
  let d = new Date(projectStart); d.setDate(1)
  while (d <= projectEnd) {
    const offset    = Math.max(0, differenceInDays(d, projectStart)) * DAY_WIDTH
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const end       = nextMonth > projectEnd ? projectEnd : nextMonth
    months.push({ label: format(d, 'MMM yyyy'), offset, width: differenceInDays(end, d) * DAY_WIDTH })
    d = nextMonth
  }

  const todayOffset = differenceInDays(new Date(), projectStart) * DAY_WIDTH
  // Use live DB status (from project-sync) for both bar and count
  const liveCompletedCount = tasks.filter(t => (syncById[t.id]?.status ?? t.status) === 'completed').length
  const livePct            = tasks.length > 0 ? Math.round((liveCompletedCount / tasks.length) * 100) : 0
  const subTaskCount   = syncTasks.filter(t => !!t.sub).length

  function getBarStyle(start: string | null, end: string | null) {
    const s = safeParseISO(start)
    const e = safeParseISO(end)
    if (!s || !e) return null
    const left = differenceInDays(s, projectStart) * DAY_WIDTH
    const dur  = Math.max(differenceInDays(e, s) + 1, 1)
    return { left, width: Math.max(dur * DAY_WIDTH - 2, 20) }
  }

  return (
    <div className="pb-24 flex flex-col" style={{ minHeight: '100vh' }}>
      <TopBar title={`${project.name} – Timeline`} backHref={`/projects/${project.id}`} />

      {/* Progress summary */}
      <div className="px-4 pt-3 pb-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500 font-medium">Overall Progress</span>
          <div className="flex items-center gap-2">
            {liveCompletedCount > 0 && (
              <span className="text-xs font-bold text-[#1A2B4A]">{livePct}%</span>
            )}
            <button onClick={fetchSync} disabled={syncing}
              className="text-xs text-blue-600 font-semibold px-2 py-0.5 bg-blue-50 rounded-lg disabled:opacity-40">
              {syncing ? '…' : '↻'}
            </button>
          </div>
        </div>
        {/* Segmented bar — one slice per task, colored by live status; % only shows when tasks complete */}
        <div className="h-3 rounded-full overflow-hidden flex bg-gray-100" style={{ gap: '2px' }}>
          {tasks.length === 0 ? (
            <div className="h-full w-full rounded-full bg-gray-100"/>
          ) : tasks.map(task => {
            const liveStatus = syncById[task.id]?.status ?? task.status
            const colorCls   = (TIMELINE_BAR_COLORS as Record<string,string>)[liveStatus] ?? 'bg-gray-300'
            return (
              <div key={task.id}
                className={`h-full transition-all duration-700 ${colorCls}`}
                style={{ width: `${100 / tasks.length}%` }}
                title={`${task.name}: ${liveStatus}`}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
          <span>{liveCompletedCount}/{tasks.length} tasks done</span>
          {subTaskCount > 0 && <span className="text-blue-600 font-medium">👷 {subTaskCount} sub linked</span>}
          {lastSync && <span className="text-green-500">● Live · {lastSync}</span>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto">
        {(['pending','active','in_progress','delayed','completed'] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-3 h-3 rounded-sm ${TIMELINE_BAR_COLORS[s]}`}/>
            <span className="text-xs text-gray-500 capitalize">{s.replace('_',' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-0.5 h-3 bg-red-500"/>
          <span className="text-xs text-gray-500">Today</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-3 h-2 rounded-sm bg-indigo-400 opacity-80"/>
          <span className="text-xs text-gray-500">Sub dates</span>
        </div>
      </div>

      {/* Gantt chart */}
      <div className="flex overflow-hidden" style={{ height: `${tasks.length * 52 + 56}px`, minHeight: '200px' }}>

        {/* Fixed left panel */}
        <div className="w-36 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-hidden">
          <div className="h-8 border-b border-gray-100"/>
          <div className="h-6 border-b border-gray-100"/>
          {tasks.map(task => {
            const live = syncById[task.id]
            const sub  = live?.sub
            return (
              <div key={task.id}
                className={`h-13 flex items-center px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition ${sub ? 'bg-blue-50/30' : ''}`}
                style={{ height: '52px' }}
                onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700 truncate font-medium leading-tight">{task.name}</p>
                  {sub ? (
                    <p className="text-[9px] text-blue-600 truncate leading-tight mt-0.5 font-semibold">
                      👷 {sub.company}
                    </p>
                  ) : task.assignedTo ? (
                    <p className="text-[9px] text-amber-500 truncate leading-tight mt-0.5">
                      ⏳ {task.assignedTo}
                    </p>
                  ) : null}
                  {live?.status && live.status !== task.status && (
                    <p className="text-[9px] text-green-600 truncate leading-tight font-medium">
                      {STATUS_LABEL[live.status] ?? live.status}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Scrollable Gantt */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: timelineWidth, minWidth: '100%' }}>
            {/* Month headers */}
            <div className="relative h-8 border-b border-gray-100 bg-gray-50">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center border-r border-gray-200 px-2"
                  style={{ left: m.offset, width: m.width }}>
                  <span className="text-xs font-semibold text-gray-600 truncate">{m.label}</span>
                </div>
              ))}
            </div>
            {/* Day markers */}
            <div className="relative h-6 border-b border-gray-100 bg-gray-50/50">
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = addDays(projectStart, i)
                if (day.getDate() % 7 !== 1) return null
                return (
                  <div key={i} className="absolute top-0 h-full flex items-center px-1" style={{ left: i * DAY_WIDTH }}>
                    <span className="text-[10px] text-gray-400">{format(day, 'd')}</span>
                  </div>
                )
              })}
            </div>

            {/* Bars */}
            <div className="relative">
              {todayOffset >= 0 && todayOffset <= timelineWidth && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
                  style={{ left: todayOffset + DAY_WIDTH / 2 }}/>
              )}
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = addDays(projectStart, i)
                if (day.getDay() !== 0 && day.getDay() !== 6) return null
                return (
                  <div key={i} className="absolute top-0 bottom-0 bg-gray-50 pointer-events-none"
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}/>
                )
              })}

              {tasks.map(task => {
                const live    = syncById[task.id]
                const sub     = live?.sub
                const barStyle = getBarStyle(task.startDate, task.endDate)
                const subStyle = live ? getBarStyle(live.sub_start_date, live.sub_end_date) : null
                const statusToShow = live?.status ?? task.status

                return (
                  <div key={task.id} className={`relative border-b border-gray-50 flex items-center ${sub ? 'bg-blue-50/10' : ''}`}
                    style={{ height: '52px' }}>

                    {/* Builder bar */}
                    {barStyle && (
                      <div
                        className={`absolute h-6 ${(TIMELINE_BAR_COLORS as Record<string,string>)[statusToShow] ?? TIMELINE_BAR_COLORS['pending']} rounded-md cursor-pointer hover:opacity-80 transition flex items-center px-2 z-10 ${sub ? 'ring-1 ring-blue-400/40' : ''}`}
                        style={{ left: barStyle.left, width: barStyle.width, top: '6px' }}
                        onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}
                        title={`${task.name}${sub ? ` — 👷 ${sub.company}` : ''} (${statusToShow.replace('_',' ')})`}>
                        {barStyle.width > 50 && (
                          <span className="text-white text-[10px] font-medium truncate flex-1">{task.name}</span>
                        )}
                        {sub && barStyle.width > 22 && (
                          <span className="text-white/90 text-[10px] ml-auto pl-1 flex-shrink-0">👷</span>
                        )}
                      </div>
                    )}

                    {/* Sub-reported dates bar (thinner, indigo) */}
                    {subStyle && (
                      <div
                        className="absolute h-2 bg-indigo-400 rounded-full opacity-80 z-10"
                        style={{ left: subStyle.left, width: subStyle.width, bottom: '8px' }}
                        title={`${sub?.company}: ${live.sub_start_date ?? '?'} → ${live.sub_end_date ?? '?'}`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTIVITY FEED ───────────────────────────────────────────────────── */}
      <div className="px-4 mt-4 mb-2">
        <button onClick={() => setShowActivity(v => !v)}
          className="flex items-center gap-2 text-sm font-bold text-[#1A2B4A] w-full">
          <span>📡 Sub Activity Feed</span>
          <span className="text-xs text-gray-400 font-normal">({activity.length} updates)</span>
          <span className="ml-auto text-gray-400 text-xs">{showActivity ? '▲' : '▼'}</span>
        </button>
      </div>

      {showActivity && (
        <div className="px-4 pb-6 space-y-2">
          {activity.length === 0 ? (
            <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm border border-gray-100">
              <p className="text-2xl mb-1">📭</p>
              <p>No sub activity yet. Updates from sub portals appear here in real-time.</p>
            </div>
          ) : (
            activity.map((item: any) => {
              const taskMatch = syncTasks.find(t => t.id === item.task_id)
              const sub       = taskMatch?.sub
              const timeStr   = (() => {
                try {
                  const d2 = parseISO(item.created_at)
                  const diff = Math.round((Date.now() - d2.getTime()) / 60000)
                  if (diff < 1)  return 'Just now'
                  if (diff < 60) return `${diff}m ago`
                  if (diff < 1440) return `${Math.round(diff/60)}h ago`
                  return format(d2, 'MMM d, h:mm a')
                } catch { return '' }
              })()

              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${
                    item.type === 'schedule_conflict' ? 'bg-red-50' :
                    item.type === 'schedule_update'   ? 'bg-blue-50' : 'bg-indigo-50'
                  }`}>
                    {item.type === 'schedule_conflict' ? '⚠️' : item.type === 'schedule_update' ? '📅' : '👷'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-[#1A2B4A] leading-snug">{item.title}</p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">{timeStr}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug whitespace-pre-wrap">{item.body}</p>
                    {taskMatch && (
                      <Link href={`/projects/${project.id}/tasks/${taskMatch.id}`}
                        className="text-[10px] text-blue-500 font-medium mt-1 block hover:underline">
                        → {taskMatch.name}{sub ? ` · ${sub.company}` : ''}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
