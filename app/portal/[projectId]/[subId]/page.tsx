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

const MATERIALS_OPTIONS = [
  { value: 'not_ordered', label: '📦 Not yet ordered',     color: 'border-red-200 bg-red-50 text-red-700' },
  { value: 'ordered',     label: '🚚 Ordered / En route',  color: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'on_site',     label: '✅ Materials on site',   color: 'border-green-200 bg-green-50 text-green-700' },
  { value: 'not_needed',  label: '—  No materials needed', color: 'border-gray-200 bg-gray-50 text-gray-600' },
]

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

interface CommitForm {
  sub_start_date: string; sub_end_date: string; sub_notes: string
  sub_crew_size: string; sub_materials_status: string; sub_confirmed: boolean
}

export default function GuestPortal() {
  const { projectId, subId } = useParams() as { projectId: string; subId: string }
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'info' | 'tasks' | 'files'>('info')

  // Per-task editing state
  const [editTask, setEditTask]   = useState<any | null>(null)    // task currently open in modal
  const [form, setForm]           = useState<CommitForm | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetch(`/api/portal/${projectId}/${subId}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); return }; setData(d) })
      .catch(() => setError('Could not load project'))
      .finally(() => setLoading(false))
  }, [projectId, subId])

  function openCommit(task: any) {
    setEditTask(task)
    setForm({
      sub_start_date:       task.sub_start_date ?? '',
      sub_end_date:         task.sub_end_date   ?? '',
      sub_notes:            task.sub_notes      ?? '',
      sub_crew_size:        task.sub_crew_size   ? String(task.sub_crew_size) : '',
      sub_materials_status: task.sub_materials_status ?? '',
      sub_confirmed:        task.sub_confirmed  ?? false,
    })
  }

  async function handleSave() {
    if (!editTask || !form) return
    setSaving(true)
    try {
      const res = await fetch(`/api/portal/${projectId}/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: editTask.id,
          sub_start_date:       form.sub_start_date || null,
          sub_end_date:         form.sub_end_date   || null,
          sub_notes:            form.sub_notes      || null,
          sub_crew_size:        form.sub_crew_size ? parseInt(form.sub_crew_size) : null,
          sub_materials_status: form.sub_materials_status || null,
          sub_confirmed:        form.sub_confirmed,
        }),
      })
      const json = await res.json()
      if (json.conflicts?.length) setConflicts(c => ({ ...c, [editTask.id]: json.conflicts }))
      else setConflicts(c => ({ ...c, [editTask.id]: [] }))
      // Update local task data
      setData((d: any) => ({
        ...d,
        tasks: d.tasks.map((t: any) => t.id === editTask.id ? { ...t, ...form, sub_crew_size: form.sub_crew_size ? parseInt(form.sub_crew_size) : null } : t),
      }))
      setSaved(editTask.id)
      setTimeout(() => setSaved(null), 3000)
      setEditTask(null)
    } finally {
      setSaving(false)
    }
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
              <span className="text-white text-xs">{completedCount}/{tasks.length} done</span>
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
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4">

        {/* ── INFO TAB ── */}
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
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-xs font-bold text-blue-700 mb-1">Sofia AI is tracking your schedule</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Go to <strong>Tasks</strong> to set your commitment — dates, crew, materials.
                  Any change you make alerts the builder automatically.
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

        {/* ── TASKS TAB ── */}
        {tab === 'tasks' && (
          <div className="flex flex-col gap-4">
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
              const hasCommitment = task.sub_start_date || task.sub_end_date || task.sub_confirmed
              const taskConflicts = conflicts[task.id] ?? []
              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-bold text-[#1A2B4A]">{task.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    {/* Builder plan */}
                    <p className="text-xs font-semibold text-gray-400 mb-1.5">BUILDER&apos;S PLAN</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned Start</p>
                        <p className="font-bold text-gray-700 text-sm">{task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'}</p>
                        {startLabel && <p className={`text-xs mt-0.5 ${startLabel.cls}`}>{startLabel.text}</p>}
                      </div>
                      <div className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-gray-400 text-xs mb-0.5">Planned End</p>
                        <p className="font-bold text-gray-700 text-sm">{task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</p>
                        {task.start_date && task.end_date && (
                          <p className="text-xs text-gray-400">{differenceInDays(parseISO(task.end_date), parseISO(task.start_date))}d</p>
                        )}
                      </div>
                    </div>
                    {task.notes && (
                      <div className="bg-amber-50 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs text-amber-700 font-semibold mb-0.5">📝 Builder note</p>
                        <p className="text-xs text-amber-600">{task.notes}</p>
                      </div>
                    )}

                    {/* Commitment summary if set */}
                    {hasCommitment && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs font-semibold text-blue-600 mb-1">YOUR COMMITMENT</p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {task.sub_start_date && <span className="text-blue-700">▶ {format(parseISO(task.sub_start_date), 'MMM d')}</span>}
                          {task.sub_end_date   && <span className="text-blue-700">⏹ {format(parseISO(task.sub_end_date), 'MMM d')}</span>}
                          {task.sub_crew_size  && <span className="text-blue-700">👷 {task.sub_crew_size} crew</span>}
                          {task.sub_materials_status && <span className="text-blue-700">{MATERIALS_OPTIONS.find(m => m.value === task.sub_materials_status)?.label ?? task.sub_materials_status}</span>}
                          {task.sub_confirmed && <span className="text-green-700 font-semibold">✅ Confirmed</span>}
                        </div>
                        {task.sub_notes && <p className="text-xs text-blue-600 mt-1 italic">&ldquo;{task.sub_notes}&rdquo;</p>}
                      </div>
                    )}

                    {/* Conflict warnings */}
                    {taskConflicts.length > 0 && (
                      <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
                        <p className="text-xs font-bold text-red-600 mb-1">⚠️ Sofia alert</p>
                        {taskConflicts.map((c: string, i: number) => <p key={i} className="text-xs text-red-500">{c}</p>)}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2">
                      {task.portal_token && (
                        <a href={`/sub/${task.portal_token}`}
                          className="flex-1 py-2.5 rounded-xl border border-blue-200 text-blue-600 text-xs font-bold flex items-center justify-center gap-1">
                          📤 Update Status
                        </a>
                      )}
                      <button onClick={() => openCommit(task)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition active:scale-[0.97] ${
                          saved === task.id ? 'bg-green-500 text-white' :
                          hasCommitment ? 'bg-[#1A2B4A] text-white' : 'bg-[#2E7CF6] text-white'
                        }`}>
                        {saved === task.id ? '✅ Saved!' : hasCommitment ? '✏️ Edit Commitment' : '📅 Set My Schedule'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── FILES TAB ── */}
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
                        <p className="text-xs text-gray-400">{formatBytes(file.file_size)} · {file.uploaded_at ? format(parseISO(file.uploaded_at), 'MMM d, yyyy') : ''}</p>
                      </div>
                      <svg width="18" height="18" fill="none" stroke="#3B82F6" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
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

      {/* ── Commitment Modal ── */}
      {editTask && form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setEditTask(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-2">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="text-base font-bold text-[#1A2B4A]">My Commitment</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{editTask.name}</p>
                </div>
                <button onClick={() => setEditTask(null)} className="p-1 text-gray-400">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {/* Builder reference */}
              <div className="bg-gray-50 rounded-xl px-3 py-2 mt-3 flex gap-4 text-xs text-center">
                <div className="flex-1">
                  <p className="text-gray-400">Planned Start</p>
                  <p className="font-bold text-gray-600">{editTask.start_date ? format(parseISO(editTask.start_date), 'MMM d') : '—'}</p>
                </div>
                <div className="w-px bg-gray-200"/>
                <div className="flex-1">
                  <p className="text-gray-400">Planned End</p>
                  <p className="font-bold text-gray-600">{editTask.end_date ? format(parseISO(editTask.end_date), 'MMM d') : '—'}</p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-6 flex flex-col gap-4 mt-3">
              {/* Dates */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📅 MY ACTUAL DATES</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">My Start</p>
                    <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                      value={form.sub_start_date}
                      onChange={e => setForm(f => f ? { ...f, sub_start_date: e.target.value } : f)}/>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">My End</p>
                    <input type="date" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] font-semibold focus:outline-none focus:border-blue-400"
                      value={form.sub_end_date}
                      onChange={e => setForm(f => f ? { ...f, sub_end_date: e.target.value } : f)}/>
                  </div>
                </div>
              </div>

              {/* Crew size */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">👷 CREW SIZE</label>
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3,4,5,6,8,10].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => f ? { ...f, sub_crew_size: String(n) } : f)}
                      className={`w-12 h-10 rounded-xl border-2 text-sm font-bold transition ${
                        form.sub_crew_size === String(n)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>{n}</button>
                  ))}
                  <input type="number" min="1" max="50" placeholder="Other"
                    className="w-16 h-10 text-center text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
                    value={!['1','2','3','4','5','6','8','10'].includes(form.sub_crew_size) ? form.sub_crew_size : ''}
                    onChange={e => setForm(f => f ? { ...f, sub_crew_size: e.target.value } : f)}/>
                </div>
              </div>

              {/* Materials status */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📦 MATERIALS STATUS</label>
                <div className="flex flex-col gap-2">
                  {MATERIALS_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => f ? { ...f, sub_materials_status: opt.value } : f)}
                      className={`w-full py-2.5 px-3 rounded-xl border-2 text-left text-xs font-semibold transition ${
                        form.sub_materials_status === opt.value ? opt.color + ' border-current' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">📝 UPDATE / NOTE</label>
                <textarea rows={3} placeholder="e.g. Material delayed 1 day — will work in parallel with HVAC on Friday..."
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 text-[#1A2B4A] focus:outline-none focus:border-blue-400 resize-none"
                  value={form.sub_notes}
                  onChange={e => setForm(f => f ? { ...f, sub_notes: e.target.value } : f)}/>
              </div>

              {/* Confirm commitment toggle */}
              <button type="button"
                onClick={() => setForm(f => f ? { ...f, sub_confirmed: !f.sub_confirmed } : f)}
                className={`w-full py-3 rounded-2xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition ${
                  form.sub_confirmed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'
                }`}>
                {form.sub_confirmed ? '✅ Schedule Confirmed' : '☑️ Confirm my commitment'}
              </button>

              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {saving
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Saving…</>
                  : '💾 Save My Schedule'
                }
              </button>
            </div>
          </div>
        </div>
      )}
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
