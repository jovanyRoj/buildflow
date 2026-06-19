'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday } from 'date-fns'

const FILE_CATEGORIES = [
  { value: 'foundation', label: 'Foundation', icon: '🏗️' },
  { value: 'framing',    label: 'Framing',    icon: '🪵' },
  { value: 'roof',       label: 'Roof',       icon: '🏠' },
  { value: 'windows',    label: 'Windows',    icon: '🪟' },
  { value: 'renders',    label: 'Renders',    icon: '🎨' },
  { value: 'cabinets',   label: 'Cabinets',   icon: '🚪' },
  { value: 'permits',    label: 'Permits',    icon: '📋' },
  { value: 'other',      label: 'Other',      icon: '📁' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Not started',    color: 'bg-gray-100 text-gray-500' },
  active:      { label: 'Ready to start', color: 'bg-blue-100 text-blue-600' },
  in_progress: { label: 'In progress',    color: 'bg-orange-100 text-orange-600' },
  delayed:     { label: 'Delayed',        color: 'bg-red-100 text-red-600' },
  completed:   { label: 'Completed',      color: 'bg-green-100 text-green-700' },
}

function formatBytes(b: number) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function daysLabel(dateStr: string | null | undefined) {
  if (!dateStr) return null
  try {
    const d = parseISO(dateStr)
    if (isToday(d)) return { text: 'Today', cls: 'text-orange-500' }
    const diff = differenceInDays(d, new Date())
    if (diff < 0) return { text: `${Math.abs(diff)}d ago`, cls: 'text-red-500' }
    return { text: `in ${diff}d`, cls: 'text-blue-500' }
  } catch { return null }
}

export default function GuestPortal() {
  const { projectId, subId } = useParams() as { projectId: string; subId: string }
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'info' | 'tasks' | 'files'>('info')

  // Editing state per task: taskId -> { sub_start_date, sub_end_date, sub_notes }
  const [editing, setEditing]   = useState<Record<string, { sub_start_date: string; sub_end_date: string; sub_notes: string }>>({})
  const [saving,  setSaving]    = useState<Record<string, boolean>>({})
  const [saved,   setSaved]     = useState<Record<string, boolean>>({})
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetch(`/api/portal/${projectId}/${subId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        // Pre-fill editing state from existing sub values
        const init: typeof editing = {}
        for (const t of d.tasks ?? []) {
          init[t.id] = {
            sub_start_date: t.sub_start_date ?? '',
            sub_end_date:   t.sub_end_date ?? '',
            sub_notes:      t.sub_notes ?? '',
          }
        }
        setEditing(init)
      })
      .catch(() => setError('Could not load project'))
      .finally(() => setLoading(false))
  }, [projectId, subId])

  async function saveTask(taskId: string) {
    const vals = editing[taskId]
    if (!vals) return
    setSaving(s => ({ ...s, [taskId]: true }))
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...vals }),
      })
      const json = await res.json()
      if (json.conflicts?.length) {
        setConflicts(c => ({ ...c, [taskId]: json.conflicts }))
      } else {
        setConflicts(c => ({ ...c, [taskId]: [] }))
      }
      setSaved(s => ({ ...s, [taskId]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [taskId]: false })), 3000)
      // Update local data
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) => t.id === taskId ? { ...t, ...vals } : t),
      }))
    } finally {
      setSaving(s => ({ ...s, [taskId]: false }))
    }
  }

  function setField(taskId: string, field: string, value: string) {
    setEditing(e => ({ ...e, [taskId]: { ...e[taskId], [field]: value } }))
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="text-5xl">🔗</div>
      <h2 className="font-bold text-[#1A2B4A] text-lg">Access not found</h2>
      <p className="text-gray-500 text-sm">This portal link may be invalid.<br/>Contact your builder for a new link.</p>
    </div>
  )

  const { project, sub, tasks, files } = data
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(project.address)}`
  const filesByCategory = FILE_CATEGORIES.filter(cat => files.some((f: any) => f.category === cat.value))
  const completedCount = tasks.filter((t: any) => t.status === 'completed').length

  return (
    <div className="min-h-screen bg-[#F4F6F9] max-w-[480px] mx-auto pb-10">
      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-5">
        <div className="flex items-center gap-2 mb-4">
          <img src="/BuildFlowLogo.png" alt="" className="h-7 w-7 rounded-lg"/>
          <span className="text-white/50 text-xs font-medium">BuildFlow — Project Portal</span>
        </div>
        <h1 className="text-white text-xl font-bold leading-tight">{project.name}</h1>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="text-white/50 text-xs flex items-center gap-1 mt-1 underline underline-offset-2">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {project.address}
        </a>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-white text-xs font-medium">{sub.company}</span>
            {sub.trade && <span className="text-white/50 text-xs">· {sub.trade}</span>}
          </div>
          {tasks.length > 0 && (
            <div className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <span className="text-white text-xs">{completedCount}/{tasks.length} tasks done</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        {[
          { key: 'info',  label: 'Project',  icon: '🏗️' },
          { key: 'tasks', label: `Tasks (${tasks.length})`, icon: '📋' },
          { key: 'files', label: `Files (${files.length})`,  icon: '📐' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-0.5 border-b-2 transition ${
              tab === t.key ? 'border-[#2E7CF6] text-[#2E7CF6]' : 'border-transparent text-gray-400'
            }`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4">

        {/* ── INFO TAB ─────────────────────────────────────── */}
        {tab === 'info' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">PROJECT DETAILS</p>
              <div className="flex flex-col gap-2.5 text-sm">
                <Row label="Project" value={project.name}/>
                <Row label="Status"  value={project.status?.replace('_',' ') ?? 'Active'}/>
                <Row label="Start"   value={project.start_date ? format(parseISO(project.start_date), 'MMM d, yyyy') : '—'}/>
                <Row label="Est. End" value={project.estimated_end_date ? format(parseISO(project.estimated_end_date), 'MMM d, yyyy') : '—'}/>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">YOUR REGISTRATION</p>
              <div className="flex flex-col gap-2.5 text-sm">
                <Row label="Company" value={sub.company}/>
                <Row label="Contact" value={sub.name}/>
                <Row label="Trade"   value={sub.trade}/>
                {sub.phone && <Row label="Phone" value={sub.phone}/>}
              </div>
            </div>

            {/* Sofia notice */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-xs font-bold text-blue-700 mb-1">Sofia AI is tracking your schedule</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Go to the <strong>Tasks</strong> tab to set your actual start &amp; end dates.
                  If there&apos;s a delay, update your dates — Sofia will alert the builder automatically.
                </p>
              </div>
            </div>

            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="w-full py-3.5 rounded-2xl bg-[#1A2B4A] text-white font-bold text-sm flex items-center justify-center gap-2">
              <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Open in Google Maps
            </a>
          </div>
        )}

        {/* ── TASKS TAB ────────────────────────────────────── */}
        {tab === 'tasks' && (
          <div className="flex flex-col gap-4">
            {/* Sofia tip */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
              <span className="text-lg mt-0.5">🤖</span>
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Your commitment matters.</strong> Set your actual start/end dates below.
                If something changes (material delay, crew issue), update your dates and add a note —
                Sofia will notify your builder and check for schedule conflicts automatically.
              </p>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No tasks assigned yet</div>
            ) : tasks.map((task: any) => {
              const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
              const startLabel = daysLabel(task.start_date)
              const hasSubDates = editing[task.id]?.sub_start_date || editing[task.id]?.sub_end_date
              const isSaving = saving[task.id]
              const wasSaved = saved[task.id]
              const taskConflicts = conflicts[task.id] ?? []
              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Task header */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-[#1A2B4A] leading-tight">{task.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    {task.inspection_required && (
                      <div className="inline-flex items-center gap-1 bg-purple-50 rounded-full px-2 py-0.5 mb-2">
                        <span className="text-xs text-purple-600">🔍 Inspection required</span>
                      </div>
                    )}
                    {/* Builder's planned dates */}
                    <p className="text-xs font-semibold text-gray-400 mb-1.5">BUILDER&apos;S PLAN</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned Start</p>
                        <p className="font-bold text-gray-700 text-sm">{task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'}</p>
                        {startLabel && <p className={`text-xs mt-0.5 font-medium ${startLabel.cls}`}>{startLabel.text}</p>}
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned End</p>
                        <p className="font-bold text-gray-700 text-sm">{task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</p>
                        {task.start_date && task.end_date && (
                          <p className="text-xs text-gray-400 mt-0.5">{differenceInDays(parseISO(task.end_date), parseISO(task.start_date))}d duration</p>
                        )}
                      </div>
                    </div>
                    {task.notes && (
                      <div className="mt-2 bg-amber-50 rounded-xl px-3 py-2">
                        <p className="text-xs text-amber-700 font-semibold mb-0.5">📝 Builder note</p>
                        <p className="text-xs text-amber-600">{task.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Sub's commitment section */}
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-blue-600 mb-2.5">YOUR COMMITMENT</p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">My Start Date</label>
                        <input type="date" className="w-full text-xs border border-gray-200 rounded-xl px-2 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                          value={editing[task.id]?.sub_start_date ?? ''}
                          onChange={e => setField(task.id, 'sub_start_date', e.target.value)}/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">My End Date</label>
                        <input type="date" className="w-full text-xs border border-gray-200 rounded-xl px-2 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                          value={editing[task.id]?.sub_end_date ?? ''}
                          onChange={e => setField(task.id, 'sub_end_date', e.target.value)}/>
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-gray-400 block mb-1">Update / Note (optional)</label>
                      <textarea rows={2} placeholder="e.g. Material delayed — will start 1 day late, will work in parallel with HVAC..."
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-blue-400 resize-none"
                        value={editing[task.id]?.sub_notes ?? ''}
                        onChange={e => setField(task.id, 'sub_notes', e.target.value)}/>
                    </div>

                    {/* Conflicts warning */}
                    {taskConflicts.length > 0 && (
                      <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-3">
                        <p className="text-xs font-bold text-red-600 mb-1">⚠️ Sofia detected an issue</p>
                        {taskConflicts.map((c: string, i: number) => (
                          <p key={i} className="text-xs text-red-500 leading-relaxed">{c}</p>
                        ))}
                        <p className="text-xs text-red-400 mt-1">Your builder has been notified.</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {task.portal_token && (
                        <a href={`/sub/${task.portal_token}`}
                          className="flex-1 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-bold flex items-center justify-center gap-1.5">
                          📤 Update Status
                        </a>
                      )}
                      <button onClick={() => saveTask(task.id)} disabled={isSaving}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          wasSaved ? 'bg-green-500 text-white' : 'bg-[#2E7CF6] text-white active:scale-[0.97]'
                        }`}>
                        {isSaving ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> Saving…</>
                        ) : wasSaved ? (
                          <>✅ Saved!</>
                        ) : (
                          <>💾 Save My Dates</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── FILES TAB ────────────────────────────────────── */}
        {tab === 'files' && (
          <div className="flex flex-col gap-4">
            {files.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No files available yet</div>
            ) : filesByCategory.map(cat => (
              <div key={cat.value}>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">{cat.icon} {cat.label}</p>
                <div className="flex flex-col gap-2">
                  {files.filter((f: any) => f.category === cat.value).map((file: any) => (
                    <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3 hover:bg-gray-50 transition">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                        {file.file_type?.includes('pdf') ? '📄' : file.file_type?.includes('image') ? '🖼️' : '📁'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1A2B4A] truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatBytes(file.file_size)} · {file.uploaded_at ? format(parseISO(file.uploaded_at), 'MMM d, yyyy') : ''}
                        </p>
                      </div>
                      <svg width="18" height="18" fill="none" stroke="#3B82F6" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 pb-2 mt-2">
        Powered by BuildFlow · Oklahoma Construction Management
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="font-semibold text-[#1A2B4A] text-right capitalize">{value}</span>
    </div>
  )
}
