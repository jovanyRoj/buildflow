'use client'
import { useRef, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays, addDays } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { TIMELINE_BAR_COLORS } from '@/lib/colors'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { Task } from '@/lib/types'
import { useAuthGuard } from '@/lib/useAuthGuard'

const DAY_WIDTH = 28

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

export default function TimelinePage() {
  const params     = useParams()
  const router     = useRouter()
  const { getProject, refreshProjects } = useBuildFlowStore()
  const { ready }  = useAuthGuard()
  const project    = getProject(params.id as string)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(true)

  // Refresh on mount so sub portal status changes (in_progress, delayed, etc.) show live
  useEffect(() => {
    refreshProjects().finally(() => setRefreshing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !project) return <Spinner />

  const tasks        = [...project.tasks].sort((a, b) => a.order - b.order)
  const projectStart = parseISO(project.startDate)
  const projectEnd   = parseISO(project.estimatedEndDate)
  const totalDays    = differenceInDays(projectEnd, projectStart) + 7
  const timelineWidth = totalDays * DAY_WIDTH

  // Month headers
  const months: { label: string; offset: number; width: number }[] = []
  let d = new Date(projectStart)
  d.setDate(1)
  while (d <= projectEnd) {
    const offset     = Math.max(0, differenceInDays(d, projectStart)) * DAY_WIDTH
    const nextMonth  = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const endOfRange = nextMonth > projectEnd ? projectEnd : nextMonth
    months.push({ label: format(d, 'MMM yyyy'), offset, width: differenceInDays(endOfRange, d) * DAY_WIDTH })
    d = nextMonth
  }

  const todayOffset = differenceInDays(new Date(), projectStart) * DAY_WIDTH

  function getBarStyle(task: Task) {
    const start = differenceInDays(parseISO(task.startDate), projectStart)
    const dur   = differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1
    return { left: start * DAY_WIDTH, width: Math.max(dur * DAY_WIDTH - 2, 20) }
  }

  const completedCount = tasks.filter(t => t.status === 'completed').length
  const subTaskCount   = tasks.filter(t => !!t.assignedTo).length

  return (
    <div className="pb-24 flex flex-col h-screen">
      <TopBar title={`${project.name} – Timeline`} backHref={`/projects/${project.id}`} />

      {/* Progress summary */}
      <div className="px-4 pt-3 pb-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-medium">Overall Progress</span>
          <span className="text-xs font-bold text-[#1A2B4A]">
            {refreshing ? '…' : `${project.progressPercentage}%`}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              project.status === 'delayed' ? 'bg-red-400' :
              project.status === 'completed' ? 'bg-green-400' : 'bg-blue-500'
            }`}
            style={{ width: `${project.progressPercentage}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span>{completedCount}/{tasks.length} tasks done</span>
          {subTaskCount > 0 && (
            <span className="text-orange-600 font-medium">👷 {subTaskCount} sub-assigned</span>
          )}
          {refreshing && <span className="text-blue-400 animate-pulse">Refreshing…</span>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto">
        {(['pending','active','in_progress','delayed','completed'] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-3 h-3 rounded-sm ${TIMELINE_BAR_COLORS[s]}`}/>
            <span className="text-xs text-gray-500 capitalize">{s.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <div className="w-0.5 h-3 bg-red-500"/>
          <span className="text-xs text-gray-500">Today</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-sm bg-blue-500 ring-1 ring-orange-400"/>
          <span className="text-xs text-gray-500">Sub task</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Fixed left panel — task names */}
        <div className="w-36 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          {/* Header spacer rows to align with month + day headers */}
          <div className="h-8 border-b border-gray-100"/>
          <div className="h-6 border-b border-gray-100"/>

          {tasks.map(task => (
            <div
              key={task.id}
              className={`h-10 flex items-center px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition ${
                task.assignedTo ? 'bg-orange-50/40' : ''
              }`}
              onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-700 truncate font-medium leading-tight">{task.name}</p>
                {task.assignedTo && (
                  <p className="text-[9px] text-orange-600 truncate leading-tight mt-0.5">
                    👷 {task.assignedTo}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Gantt bars */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto timeline-scroll">
          <div style={{ width: timelineWidth, minWidth: '100%' }}>

            {/* Month headers */}
            <div className="relative h-8 border-b border-gray-100 bg-gray-50">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center border-r border-gray-200 px-2"
                  style={{ left: m.offset, width: m.width }}
                >
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
              {/* Today marker */}
              {todayOffset >= 0 && todayOffset <= timelineWidth && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
                  style={{ left: todayOffset + DAY_WIDTH / 2 }}
                />
              )}

              {/* Weekend shading */}
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = addDays(projectStart, i)
                if (day.getDay() !== 0 && day.getDay() !== 6) return null
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 bg-gray-50 pointer-events-none"
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                  />
                )
              })}

              {/* Task bars */}
              {tasks.map(task => {
                const style = getBarStyle(task)
                const isSub = !!task.assignedTo
                return (
                  <div
                    key={task.id}
                    className={`relative h-10 border-b border-gray-50 flex items-center ${isSub ? 'bg-orange-50/20' : ''}`}
                  >
                    <div
                      className={`absolute h-6 ${TIMELINE_BAR_COLORS[task.status]} rounded-md cursor-pointer hover:opacity-80 transition flex items-center px-2 ${
                        isSub ? 'ring-1 ring-orange-400/50' : ''
                      }`}
                      style={{ left: style.left, width: style.width }}
                      onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}
                      title={`${task.name}${task.assignedTo ? ` — 👷 ${task.assignedTo}` : ''} (${task.status.replace('_', ' ')})`}
                    >
                      {style.width > 50 && (
                        <span className="text-white text-[10px] font-medium truncate flex-1">{task.name}</span>
                      )}
                      {isSub && style.width > 22 && (
                        <span className="text-white/90 text-[10px] ml-auto pl-1 flex-shrink-0">👷</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
