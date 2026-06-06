import { TaskStatus, ProjectStatus } from '@/lib/types'
import { STATUS_COLORS, PROJECT_STATUS_COLORS } from '@/lib/colors'

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const c = STATUS_COLORS[status]
  const labels: Record<TaskStatus, string> = { pending: 'Pending', active: 'Active', delayed: 'Delayed', completed: 'Completed' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>
      {labels[status]}
    </span>
  )
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const c = PROJECT_STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}
