'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { TaskStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import { TaskStatus } from '@/lib/types'
import { useHydrated } from '@/lib/useHydrated'

const STATUSES: TaskStatus[] = ['pending', 'active', 'delayed', 'completed']
const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending', active: 'Active', delayed: 'Delayed', completed: 'Completed'
}
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'border-gray-300 text-gray-600',
  active: 'border-blue-400 text-blue-700 bg-blue-50',
  delayed: 'border-red-400 text-red-700 bg-red-50',
  completed: 'border-green-400 text-green-700 bg-green-50',
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { currentUser, getProject, updateTask } = useBuildFlowStore()
  const project = getProject(params.id as string)
  const task = project?.tasks.find(t => t.id === params.taskId)

  const [form, setForm] = useState({
    status: task?.status ?? 'pending' as TaskStatus,
    startDate: task?.startDate ?? '',
    endDate: task?.endDate ?? '',
    assignedTo: task?.assignedTo ?? '',
    notes: task?.notes ?? '',
  })
  const hydrated = useHydrated()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (hydrated && !currentUser) router.replace('/login')
  }, [hydrated, currentUser])

  useEffect(() => {
    if (task) setForm({
      status: task.status,
      startDate: task.startDate,
      endDate: task.endDate,
      assignedTo: task.assignedTo,
      notes: task.notes,
    })
  }, [task?.id])

  if (!hydrated || !currentUser || !project || !task) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const deps = task.dependencies.map(id => project.tasks.find(t => t.id === id)).filter(Boolean)
  const dependents = project.tasks.filter(t => t.dependencies.includes(task.id))

  async function handleSave() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 300))
    updateTask(project!.id, task!.id, form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasChanges =
    form.status !== task.status ||
    form.startDate !== task.startDate ||
    form.endDate !== task.endDate ||
    form.assignedTo !== task.assignedTo ||
    form.notes !== task.notes

  return (
    <div className="pb-10">
      <TopBar
        title={task.name}
        backHref={`/projects/${project.id}`}
        action={
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Status selector */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-3">STATUS</label>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`py-2.5 rounded-xl border text-sm font-medium transition ${
                  form.status === s
                    ? STATUS_COLORS[s] + ' border-2'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-3">SCHEDULE</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Start Date</p>
              <input
                type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">End Date</p>
              <input
                type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 p-2.5 bg-gray-50 rounded-xl text-xs text-gray-500 flex items-center justify-between">
            <span>Duration: {task.durationDays} days</span>
            {task.delayDays > 0 && (
              <span className="text-red-500 font-semibold">+{task.delayDays} days delayed</span>
            )}
          </div>
          {form.endDate !== task.endDate && (
            <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-xl p-2.5 text-center">
              ⚠ Changing end date will auto-reschedule {dependents.length} downstream task(s)
            </p>
          )}
        </div>

        {/* Assigned to */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-2">ASSIGNED TO</label>
          <input
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
            placeholder="Subcontractor or trade name"
            value={form.assignedTo}
            onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
          />
        </div>

        {/* Notes */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-2">NOTES</label>
          <textarea
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
            placeholder="Add notes about this task..."
            rows={3}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {/* Dependencies */}
        {(deps.length > 0 || dependents.length > 0) && (
          <div className="card p-4">
            <label className="block text-xs font-semibold text-gray-500 mb-3">DEPENDENCIES</label>
            {deps.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-2">Depends on:</p>
                <div className="flex flex-col gap-1.5">
                  {deps.map(d => d && (
                    <div key={d.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-700">{d.name}</span>
                      <TaskStatusBadge status={d.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dependents.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Blocks:</p>
                <div className="flex flex-col gap-1.5">
                  {dependents.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-700">{d.name}</span>
                      <TaskStatusBadge status={d.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Original dates info */}
        {task.originalEndDate !== task.endDate && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5">
            <p className="text-xs text-orange-700 font-semibold">This task has been rescheduled</p>
            <p className="text-xs text-orange-600 mt-0.5">
              Original end: {format(parseISO(task.originalEndDate), 'MMM d, yyyy')} → Now: {format(parseISO(task.endDate), 'MMM d, yyyy')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
