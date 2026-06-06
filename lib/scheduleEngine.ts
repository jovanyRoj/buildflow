import { addDays, differenceInDays, format, parseISO } from 'date-fns'
import { Task, Project, HistoryEntry, AppNotification } from './types'
import { v4 as uuidv4 } from 'uuid'

export function getAffectedTasks(tasks: Task[], changedTaskId: string): Task[] {
  const affected: Set<string> = new Set()

  function collectDownstream(taskId: string) {
    for (const t of tasks) {
      if (t.dependencies.includes(taskId) && !affected.has(t.id)) {
        affected.add(t.id)
        collectDownstream(t.id)
      }
    }
  }

  collectDownstream(changedTaskId)
  return tasks.filter(t => affected.has(t.id)).sort((a, b) => a.order - b.order)
}

export function rescheduleFromTask(
  tasks: Task[],
  changedTaskId: string
): { updatedTasks: Task[]; historyEntries: HistoryEntry[]; notifications: AppNotification[] } {
  const taskMap = new Map(tasks.map(t => [t.id, { ...t }]))
  const changedTask = taskMap.get(changedTaskId)!
  const historyEntries: HistoryEntry[] = []
  const notifications: AppNotification[] = []

  const affected = getAffectedTasks(tasks, changedTaskId)

  for (const task of affected) {
    const current = taskMap.get(task.id)!
    const deps = current.dependencies.map(id => taskMap.get(id)!).filter(Boolean)

    const latestDepEnd = deps.reduce((latest, dep) => {
      const depEnd = parseISO(dep.endDate)
      return depEnd > latest ? depEnd : latest
    }, new Date(0))

    const newStart = addDays(latestDepEnd, 1)
    const newEnd = addDays(newStart, current.durationDays - 1)
    const oldStart = current.startDate
    const oldEnd = current.endDate

    if (format(newStart, 'yyyy-MM-dd') !== oldStart || format(newEnd, 'yyyy-MM-dd') !== oldEnd) {
      current.startDate = format(newStart, 'yyyy-MM-dd')
      current.endDate = format(newEnd, 'yyyy-MM-dd')
      current.updatedAt = new Date().toISOString()

      const delay = differenceInDays(parseISO(current.endDate), parseISO(current.originalEndDate))
      current.delayDays = delay > 0 ? delay : 0

      historyEntries.push({
        id: uuidv4(),
        projectId: current.projectId,
        taskId: current.id,
        type: 'reschedule',
        description: `"${current.name}" rescheduled due to upstream delay`,
        previousValue: `${oldStart} → ${oldEnd}`,
        newValue: `${current.startDate} → ${current.endDate}`,
        timestamp: new Date().toISOString(),
      })

      notifications.push({
        id: uuidv4(),
        projectId: current.projectId,
        taskId: current.id,
        type: 'reschedule',
        title: `${current.name} rescheduled`,
        body: `Now starts ${format(newStart, 'MMM d')} (was ${format(parseISO(oldStart), 'MMM d')})`,
        isRead: false,
        createdAt: new Date().toISOString(),
      })

      taskMap.set(current.id, current)
    }
  }

  return {
    updatedTasks: Array.from(taskMap.values()),
    historyEntries,
    notifications,
  }
}

export function calculateProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0
  const completed = tasks.filter(t => t.status === 'completed').length
  return Math.round((completed / tasks.length) * 100)
}

export function deriveProjectStatus(tasks: Task[]): import('./types').ProjectStatus {
  const hasDelayed = tasks.some(t => t.status === 'delayed')
  const allCompleted = tasks.every(t => t.status === 'completed')
  const hasActive = tasks.some(t => t.status === 'active')
  if (allCompleted) return 'completed'
  if (hasDelayed) return 'delayed'
  if (hasActive) return 'active'
  return 'active'
}
