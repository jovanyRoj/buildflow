'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays, addDays, min, max } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { TIMELINE_BAR_COLORS } from '@/lib/colors'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { Task } from '@/lib/types'
import { useHydrated } from '@/lib/useHydrated'

const DAY_WIDTH = 28

export default function TimelinePage() {
  const params = useParams()
  const router = useRouter()
  const { currentUser, getProject } = useBuildFlowStore()
  const hydrated = useHydrated()
  const project = getProject(params.id as string)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hydrated && !currentUser) router.replace('/login')
  }, [hydrated, currentUser])

  if (!hydrated || !currentUser || !project) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const tasks = [...project.tasks].sort((a, b) => a.order - b.order)
  const projectStart = parseISO(project.startDate)
  const projectEnd = parseISO(project.estimatedEndDate)
  const totalDays = differenceInDays(projectEnd, projectStart) + 7
  const timelineWidth = totalDays * DAY_WIDTH

  // Generate month headers
  const months: { label: string; offset: number; width: number }[] = []
  let d = new Date(projectStart)
  d.setDate(1)
  while (d <= projectEnd) {
    const offset = Math.max(0, differenceInDays(d, projectStart)) * DAY_WIDTH
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const endOfRange = nextMonth > projectEnd ? projectEnd : nextMonth
    const width = differenceInDays(endOfRange, d) * DAY_WIDTH
    months.push({ label: format(d, 'MMM yyyy'), offset, width })
    d = nextMonth
  }

  const todayOffset = differenceInDays(new Date(), projectStart) * DAY_WIDTH

  function getBarStyle(task: Task) {
    const start = differenceInDays(parseISO(task.startDate), projectStart)
    const dur = differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1
    return { left: start * DAY_WIDTH, width: Math.max(dur * DAY_WIDTH - 2, 20) }
  }

  return (
    <div className="pb-24 flex flex-col h-screen">
      <TopBar title={`${project.name} – Timeline`} backHref={`/projects/${project.id}`} />

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-white border-b border-gray-100 overflow-x-auto">
        {(['pending','active','delayed','completed'] as const).map(s => (
          <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-3 h-3 rounded-sm ${TIMELINE_BAR_COLORS[s]}`}/>
            <span className="text-xs text-gray-500 capitalize">{s}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <div className="w-0.5 h-3 bg-red-500"/>
          <span className="text-xs text-gray-500">Today</span>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="flex flex-1 overflow-hidden">
        {/* Task names (fixed) */}
        <div className="w-32 flex-shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
          <div className="h-8 border-b border-gray-100" /> {/* month header spacer */}
          <div className="h-6 border-b border-gray-100" /> {/* day header spacer */}
          {tasks.map(task => (
            <div
              key={task.id}
              className="h-10 flex items-center px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50"
              onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}
            >
              <p className="text-xs text-gray-700 truncate font-medium leading-tight">{task.name}</p>
            </div>
          ))}
        </div>

        {/* Scrollable bars area */}
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

            {/* Day numbers */}
            <div className="relative h-6 border-b border-gray-100 bg-gray-50/50">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = addDays(projectStart, i)
                if (d.getDate() % 7 !== 1) return null
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center px-1"
                    style={{ left: i * DAY_WIDTH }}
                  >
                    <span className="text-[10px] text-gray-400">{format(d, 'd')}</span>
                  </div>
                )
              })}
            </div>

            {/* Task bars */}
            <div className="relative">
              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= timelineWidth && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
                  style={{ left: todayOffset + DAY_WIDTH / 2 }}
                />
              )}

              {/* Weekend columns */}
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = addDays(projectStart, i)
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                if (!isWeekend) return null
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 bg-gray-50 pointer-events-none"
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                  />
                )
              })}

              {tasks.map(task => {
                const style = getBarStyle(task)
                const color = TIMELINE_BAR_COLORS[task.status]
                return (
                  <div
                    key={task.id}
                    className="relative h-10 border-b border-gray-50 flex items-center"
                  >
                    <div
                      className={`absolute h-6 ${color} rounded-md cursor-pointer hover:opacity-80 transition flex items-center px-2`}
                      style={{ left: style.left, width: style.width }}
                      onClick={() => router.push(`/projects/${project.id}/tasks/${task.id}`)}
                    >
                      {style.width > 50 && (
                        <span className="text-white text-[10px] font-medium truncate">{task.name}</span>
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
