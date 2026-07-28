'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, addDays } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import { TaskStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import { TaskStatus, InspectionStatus } from '@/lib/types'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { INSPECTION_COLORS } from '@/lib/colors'

const STATUSES: TaskStatus[] = ['pending', 'active', 'in_progress', 'delayed', 'completed']
const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending', active: 'Active', in_progress: 'In Progress', delayed: 'Delayed', completed: 'Completed'
}
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     'border-gray-300 text-gray-600',
  active:      'border-blue-400 text-blue-700 bg-blue-50',
  in_progress: 'border-orange-400 text-orange-700 bg-orange-50',
  delayed:     'border-red-400 text-red-700 bg-red-50',
  completed:   'border-green-400 text-green-700 bg-green-50',
}

const INSPECTION_STATUSES: InspectionStatus[] = ['pending', 'scheduled', 'passed', 'failed']

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
  </div>
}

export default function TaskDetailPage() {
  const params = useParams()
  const { getProject, updateTask } = useBrivoxStore()
  const { ready, user } = useAuthGuard()
  const project = getProject(params.id as string)
  const task = project?.tasks.find(t => t.id === params.taskId)

  const [form, setForm] = useState({
    status: 'pending' as TaskStatus,
    startDate: '', endDate: '',
    assignedTo: '', subcontractorPhone: '', notes: '',
    inspectionStatus: 'not_required' as InspectionStatus,
    inspectionNotes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sending, setSending] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [smsError, setSmsError] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Estimate comparison + sub schedule ────────────────────────────────────
  const [estData, setEstData] = useState<{
    builder: number | null
    sub: number | null
    subNotes: string | null
    subSchedule: Record<string, { start: string; end: string }> | null
    subScheduleNotes: string | null
  } | null>(null)

  useEffect(() => {
    if (!project || !task) return
    fetch(`/api/builder/project-context/${project.id}`)
      .then(r => r.json())
      .then(d => {
        const t = (d.tasks ?? []).find((x: any) => x.id === task.id)
        if (t) setEstData({
          builder:          t.builder_estimate?.amount ?? null,
          sub:              t.sub_estimate?.amount ?? null,
          subNotes:         t.sub_estimate?.notes ?? null,
          subSchedule:      t.sub_schedule ?? null,
          subScheduleNotes: t.sub_schedule_notes ?? null,
        })
      }).catch(() => {})
  }, [project?.id, task?.id])

  useEffect(() => {
    if (task) setForm({
      status: task.status,
      startDate: task.startDate,
      endDate: task.endDate,
      assignedTo: task.assignedTo,
      subcontractorPhone: task.subcontractorPhone ?? '',
      notes: task.notes,
      inspectionStatus: task.inspectionStatus ?? 'not_required',
      inspectionNotes: task.inspectionNotes ?? '',
    })
  }, [task?.id])

  if (!ready || !project || !task) return <Spinner />

  const deps      = task.dependencies.map(id => project.tasks.find(t => t.id === id)).filter(Boolean)
  const dependents = project.tasks.filter(t => t.dependencies.includes(task.id))
  const insp = INSPECTION_COLORS[form.inspectionStatus]
  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/sub/${task.portalToken}`
    : `https://buildflow.vercel.app/sub/${task.portalToken}`

  async function handleSave() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 300))
    updateTask(project!.id, task!.id, form)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSendSMS() {
    if (!form.subcontractorPhone) return
    setSending(true); setSmsError('')
    // Save current data first
    updateTask(project!.id, task!.id, form)

    const res = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'task_assigned',
        task: { ...task, ...form },
        project,
        builderName: user?.name ?? 'Builder',
      }),
    })
    const data = await res.json()
    setSending(false)
    if (data.ok) { setSmsSent(true); setTimeout(() => setSmsSent(false), 4000) }
    else setSmsError(data.error ?? 'Failed to send SMS')
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasChanges = form.status !== task.status || form.startDate !== task.startDate ||
    form.endDate !== task.endDate || form.assignedTo !== task.assignedTo ||
    form.subcontractorPhone !== (task.subcontractorPhone ?? '') ||
    form.notes !== task.notes || form.inspectionStatus !== task.inspectionStatus ||
    form.inspectionNotes !== (task.inspectionNotes ?? '')

  return (
    <div className="pb-10">
      <TopBar
        title={task.name}
        backHref={`/projects/${project.id}`}
        action={
          <button onClick={handleSave} disabled={!hasChanges || saving}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
          </button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Status */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-3">STATUS</label>
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`py-2 rounded-xl border text-xs font-semibold transition ${
                  form.status === s ? STATUS_COLORS[s] + ' border-2' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-3">SCHEDULE</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Start Date</p>
              <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">End Date</p>
              <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 p-2.5 bg-gray-50 rounded-xl text-xs text-gray-500 flex items-center justify-between">
            <span>Duration: {task.durationDays} days</span>
            {task.delayDays > 0 && <span className="text-red-500 font-semibold">+{task.delayDays} days delayed</span>}
          </div>
          {form.endDate !== task.endDate && (
            <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-xl p-2.5 text-center">
              ⚠ Will auto-reschedule {dependents.length} downstream task(s)
            </p>
          )}
        </div>

        {/* Estimate Comparison */}
        {(estData?.builder || estData?.sub) && (
          <div className="card p-4">
            <label className="block text-xs font-semibold text-gray-500 mb-3">💰 ESTIMATE COMPARISON</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">Builder's Estimate</p>
                {estData.builder ? (
                  <p className="text-lg font-bold text-blue-800">${Math.round(estData.builder).toLocaleString()}</p>
                ) : (
                  <p className="text-xs text-blue-400 italic">Not set</p>
                )}
              </div>
              <div className={`rounded-xl p-3 ${
                estData.sub
                  ? estData.builder && estData.sub > estData.builder ? 'bg-red-50' : 'bg-green-50'
                  : 'bg-gray-50'
              }`}>
                <p className={`text-xs font-semibold mb-1 ${
                  estData.sub
                    ? estData.builder && estData.sub > estData.builder ? 'text-red-700' : 'text-green-700'
                    : 'text-gray-500'
                }`}>Sub's Real Estimate</p>
                {estData.sub ? (
                  <>
                    <p className={`text-lg font-bold ${
                      estData.builder && estData.sub > estData.builder ? 'text-red-800' : 'text-green-800'
                    }`}>${Math.round(estData.sub).toLocaleString()}</p>
                    {estData.subNotes && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{estData.subNotes}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">Not submitted yet</p>
                )}
              </div>
            </div>
            {estData.builder && estData.sub && (
              <div className={`mt-2.5 p-2.5 rounded-xl text-xs font-semibold text-center ${
                estData.sub > estData.builder
                  ? 'bg-red-100 text-red-700'
                  : estData.sub < estData.builder
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {estData.sub > estData.builder
                  ? `⚠️ Over budget by $${Math.round(estData.sub - estData.builder).toLocaleString()}`
                  : estData.sub < estData.builder
                  ? `✅ Under budget by $${Math.round(estData.builder - estData.sub).toLocaleString()}`
                  : '✅ Exactly on budget'}
              </div>
            )}
          </div>
        )}

        {/* Sub's Reported Schedule */}
        {estData?.subSchedule && Object.keys(estData.subSchedule).length > 0 && (
          <div className="card p-4">
            <label className="block text-xs font-semibold text-gray-500 mb-3">📅 SUB'S REPORTED SCHEDULE</label>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {Object.entries(estData.subSchedule)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, times]: [string, any]) => (
                <div key={date} className="flex items-center justify-between py-1.5 px-3 bg-blue-50 rounded-xl">
                  <span className="text-xs font-medium text-blue-700">
                    {format(parseISO(date), 'EEE, MMM d')}
                  </span>
                  <span className="text-xs text-blue-600 font-medium">{times.start} – {times.end}</span>
                </div>
              ))}
            </div>
            {estData.subScheduleNotes && (
              <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-xl p-2.5">{estData.subScheduleNotes}</p>
            )}
          </div>
        )}

        {/* Subcontractor Module */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">👷</span>
            <label className="text-xs font-semibold text-gray-500">SUBCONTRACTOR</label>
          </div>
          <div className="flex flex-col gap-3">
            <input className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
              placeholder="Subcontractor name"
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1 19.79 19.79 0 0 1 1.61 4.52 2 2 0 0 1 3.6 2.34h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1-1.03a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </span>
              <input className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                placeholder="Phone: (405) 555-1234"
                type="tel"
                value={form.subcontractorPhone}
                onChange={e => setForm(f => ({ ...f, subcontractorPhone: e.target.value }))} />
            </div>
          </div>

          {/* SMS Send Button */}
          {form.subcontractorPhone && (
            <div className="mt-3 flex flex-col gap-2">
              <button onClick={handleSendSMS} disabled={sending}
                className="w-full py-3 rounded-xl bg-[#1A2B4A] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60">
                {sending ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/><path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>Sending SMS...</>
                ) : smsSent ? (
                  <>✅ SMS Sent!</>
                ) : (
                  <><span>📱</span> Send SMS Notification</>
                )}
              </button>
              {smsError && <p className="text-xs text-red-500 text-center">{smsError}</p>}
              {task.smsLastSent && (
                <p className="text-xs text-gray-400 text-center">
                  Last sent: {format(parseISO(task.smsLastSent), 'MMM d, h:mm a')}
                </p>
              )}
            </div>
          )}

          {/* Portal Link */}
          <div className="mt-3 p-3 bg-blue-50 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">🔗 Subcontractor Portal Link</p>
            <p className="text-xs text-blue-600 truncate mb-2">{portalUrl}</p>
            <button onClick={handleCopyLink}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold active:scale-[0.98] transition">
              {copied ? '✓ Copied!' : 'Copy Link to Share'}
            </button>
          </div>
        </div>

        {/* Oklahoma Inspection */}
        {task.inspectionRequired && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span>🏛️</span>
                <label className="text-xs font-semibold text-gray-500">OKLAHOMA INSPECTION</label>
              </div>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Required</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {INSPECTION_STATUSES.map(s => {
                const ic = INSPECTION_COLORS[s]
                return (
                  <button key={s} onClick={() => setForm(f => ({ ...f, inspectionStatus: s }))}
                    className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition ${
                      form.inspectionStatus === s ? `${ic.bg} ${ic.text} border-current` : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {ic.icon} {ic.label.replace('Inspection ', '')}
                  </button>
                )
              })}
            </div>

            {(form.inspectionStatus === 'passed' || form.inspectionStatus === 'failed') && (
              <textarea
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                placeholder={form.inspectionStatus === 'passed' ? 'Permit #, inspector name...' : 'Items that failed, correction required...'}
                rows={2}
                value={form.inspectionNotes}
                onChange={e => setForm(f => ({ ...f, inspectionNotes: e.target.value }))}
              />
            )}

            <div className={`mt-2 p-3 rounded-xl ${insp.bg}`}>
              <p className={`text-xs font-bold ${insp.text}`}>{insp.icon} {insp.label}</p>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="card p-4">
          <label className="block text-xs font-semibold text-gray-500 mb-2">NOTES FOR SUBCONTRACTOR</label>
          <textarea className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
            placeholder="Instructions, special requirements..." rows={3}
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
                <p className="text-xs text-gray-400 mb-2">Next tasks (auto-notified on complete):</p>
                <div className="flex flex-col gap-1.5">
                  {dependents.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-700">{d.name}</span>
                      <div className="flex items-center gap-1.5">
                        {d.subcontractorPhone && <span className="text-xs text-blue-500">📱</span>}
                        <TaskStatusBadge status={d.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {task.originalEndDate !== task.endDate && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5">
            <p className="text-xs text-orange-700 font-semibold">Rescheduled</p>
            <p className="text-xs text-orange-600 mt-0.5">
              Original: {format(parseISO(task.originalEndDate), 'MMM d, yyyy')} → Now: {format(parseISO(task.endDate), 'MMM d, yyyy')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
