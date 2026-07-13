'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { TaskStatus, InspectionStatus } from '@/lib/types'

const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: string; color: string }[] = [
  { value: 'pending',     label: 'Pending',     icon: '🔲', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'in_progress', label: 'In Progress', icon: '🔨', color: 'bg-orange-50 text-orange-700 border-orange-400' },
  { value: 'delayed',     label: 'Delayed',     icon: '⚠️', color: 'bg-red-50 text-red-700 border-red-400' },
  { value: 'completed',   label: 'Completed',   icon: '✅', color: 'bg-green-50 text-green-700 border-green-400' },
]

const INSPECTION_OPTIONS: { value: InspectionStatus; label: string; icon: string; color: string }[] = [
  { value: 'pending',   label: 'Pending',   icon: '🔲', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'scheduled', label: 'Scheduled', icon: '📅', color: 'bg-blue-50 text-blue-700 border-blue-400' },
  { value: 'passed',    label: 'Passed',    icon: '✅', color: 'bg-green-50 text-green-700 border-green-400' },
  { value: 'failed',    label: 'Failed',    icon: '❌', color: 'bg-red-50 text-red-700 border-red-400' },
]

export default function SubcontractorPortal() {
  const { token } = useParams() as { token: string }
  const [task, setTask] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TaskStatus>('pending')
  const [inspStatus, setInspStatus] = useState<InspectionStatus>('pending')
  const [inspNotes, setInspNotes] = useState('')
  const [delayDays, setDelayDays] = useState(1)
  const [subNotes, setSubNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/sub/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error || !data.task) { setError(data.error ?? 'Not found'); return }
        setTask(data.task)
        setProject(data.project)
        setStatus(data.task.status)
        setInspStatus(data.task.inspectionStatus ?? 'pending')
        setInspNotes(data.task.inspectionNotes ?? '')
      })
      .catch(() => setError('Could not load task'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSave() {
    if (!task || !project) return
    setSaving(true)
    setError('')

    const res = await fetch(`/api/sub/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status, inspectionStatus: inspStatus, inspectionNotes: inspNotes,
        notes: subNotes, delayDays,
        taskName: task.name, projectName: project.name,
        projectAddress: project.address, subName: task.assignedTo,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.ok) {
      setSaved(true)
    } else {
      setError(data.error ?? 'Failed to save. Please try again.')
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-14 w-14 rounded-2xl shadow-xl" />
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (error && !task) return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="text-5xl">🔗</div>
      <h2 className="font-bold text-[#1A2B4A] text-lg">Link not found</h2>
      <p className="text-gray-500 text-sm">This task link may have expired or is invalid.<br/>Contact your builder for a new link.</p>
      <img src="/brivox-logo-dark.svg" alt="Brivox" className="h-10 w-10 rounded-xl mt-4 opacity-40"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4F6F9] pb-10 max-w-[480px] mx-auto">
      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <img src="/brivox-logo-dark.svg" alt="" className="h-7 w-7 rounded-lg"/>
          <span className="text-white/50 text-xs font-medium">Brivox — Subcontractor Portal</span>
        </div>
        <h1 className="text-white text-xl font-bold leading-tight">{task.name}</h1>
        <p className="text-white/60 text-sm mt-1">{project.name}</p>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(project.address)}`}
          target="_blank" rel="noopener noreferrer"
          className="text-white/40 text-xs mt-0.5 flex items-center gap-1 underline underline-offset-2"
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {project.address}
        </a>
        {task.assignedTo && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-white text-xs font-medium">{task.assignedTo}</span>
          </div>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Schedule */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">SCHEDULE</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-500 font-medium mb-1">Start</p>
              <p className="text-sm font-bold text-blue-700">{format(parseISO(task.startDate), 'MMM d')}</p>
              <p className="text-xs text-blue-500">{format(parseISO(task.startDate), 'yyyy')}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">Due</p>
              <p className="text-sm font-bold text-gray-700">{format(parseISO(task.endDate), 'MMM d')}</p>
              <p className="text-xs text-gray-400">{format(parseISO(task.endDate), 'yyyy')}</p>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">{task.durationDays} working days</p>
        </div>

        {/* Builder Notes */}
        {task.notes && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-600 mb-1.5">📋 Notes from Builder</p>
            <p className="text-sm text-blue-900">{task.notes}</p>
          </div>
        )}

        {/* Task Status */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">UPDATE STATUS</p>
          <div className="grid grid-cols-2 gap-2.5">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setStatus(opt.value)}
                className={`py-3 rounded-xl border-2 text-sm font-bold transition active:scale-95 ${
                  status === opt.value ? opt.color + ' shadow-sm' : 'border-gray-200 text-gray-400 bg-white'
                }`}>
                <div>{opt.icon}</div>
                <div className="text-xs mt-0.5">{opt.label}</div>
              </button>
            ))}
          </div>

          {status === 'delayed' && (
            <div className="mt-4 bg-red-50 rounded-xl p-3">
              <p className="text-xs text-red-600 font-semibold mb-2 text-center">How many days delayed?</p>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setDelayDays(d => Math.max(1, d - 1))}
                  className="w-12 h-12 rounded-xl bg-white border border-red-200 text-2xl font-bold text-red-500 flex items-center justify-center shadow-sm">−</button>
                <span className="text-3xl font-bold text-red-600 min-w-[3rem] text-center">{delayDays}</span>
                <button onClick={() => setDelayDays(d => d + 1)}
                  className="w-12 h-12 rounded-xl bg-white border border-red-200 text-2xl font-bold text-red-500 flex items-center justify-center shadow-sm">+</button>
              </div>
              <p className="text-center text-xs text-red-400 mt-1">days</p>
            </div>
          )}
        </div>

        {/* Inspection */}
        {task.inspectionRequired && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500">OKLAHOMA INSPECTION</p>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Required</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {INSPECTION_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setInspStatus(opt.value)}
                  className={`py-3 rounded-xl border-2 text-xs font-bold transition active:scale-95 ${
                    inspStatus === opt.value ? opt.color + ' shadow-sm' : 'border-gray-200 text-gray-400 bg-white'
                  }`}>
                  <div className="text-base mb-0.5">{opt.icon}</div>
                  <div>{opt.label}</div>
                </button>
              ))}
            </div>
            {(inspStatus === 'passed' || inspStatus === 'failed') && (
              <textarea
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                placeholder={inspStatus === 'passed' ? 'Permit #, inspector name...' : 'What failed? Items to correct...'}
                rows={2} value={inspNotes} onChange={e => setInspNotes(e.target.value)}
              />
            )}
          </div>
        )}

        {/* Message to Builder */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">MESSAGE TO BUILDER</p>
          <textarea
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
            placeholder="Issues, questions, updates for your builder..."
            rows={3} value={subNotes} onChange={e => setSubNotes(e.target.value)}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        {saved ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-bold text-green-700">Builder notified!</p>
            <p className="text-xs text-green-600 mt-1">Your update has been sent successfully</p>
          </div>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="w-full py-4 rounded-2xl bg-[#2E7CF6] text-white font-bold text-base active:scale-[0.98] transition disabled:opacity-60 shadow-lg shadow-blue-200">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                </svg>
                Sending to builder...
              </span>
            ) : '📤 Send Update to Builder'}
          </button>
        )}

        <p className="text-center text-xs text-gray-400 pb-2">
          Powered by Brivox · Oklahoma Construction Management
        </p>
      </div>
    </div>
  )
}
