'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { TRADES } from '@/lib/tradeMapping'

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-gray-100 text-gray-600',
  active:      'bg-blue-100 text-blue-700',
  in_progress: 'bg-orange-100 text-orange-700',
  delayed:     'bg-red-100 text-red-700',
  completed:   'bg-green-100 text-green-700',
}

const FILE_CATEGORIES = [
  { value: 'foundation',  label: 'Foundation',  icon: '🏗️' },
  { value: 'framing',     label: 'Framing',      icon: '🪵' },
  { value: 'roof',        label: 'Roof',         icon: '🏠' },
  { value: 'windows',     label: 'Windows',      icon: '🪟' },
  { value: 'renders',     label: 'Renders',      icon: '🎨' },
  { value: 'cabinets',    label: 'Cabinets',     icon: '🚪' },
  { value: 'permits',     label: 'Permits',      icon: '📋' },
  { value: 'other',       label: 'Other',        icon: '📁' },
]

interface ProjectFile {
  id: string; name: string; category: string
  file_url: string; file_size: number; file_type: string; uploaded_at: string
}

interface Sub { id: string; name: string; company: string; phone: string; trade: string; email: string; notes: string }

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function ProjectDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const { getProject, deleteProject, deleteTask, refreshProjects } = useBrivoxStore()
  const { ready } = useAuthGuard()
  const project  = getProject(params.id as string)
  const contractors: Sub[] = (project as any)?.subcontractors ?? []

  const [showDelete, setShowDelete]       = useState(false)
  const [taskToDelete, setTaskToDelete]   = useState<string | null>(null)
  const [files, setFiles]                 = useState<ProjectFile[]>([])
  const [loadingFiles, setLoadingFiles]   = useState(true)
  const [uploading, setUploading]         = useState(false)
  const [uploadCat, setUploadCat]         = useState('foundation')
  const [uploadError, setUploadError]     = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editSub, setEditSub]   = useState<Sub | null>(null)
  const [editForm, setEditForm] = useState<Sub | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // ── KORVIA chat ──
  const [korviaOpen, setKorviaOpen]       = useState(false)
  const [korviaQ, setKorviaQ]             = useState('')
  const [korviaA, setKorviaA]             = useState('')
  const [korviaLoading, setKorviaLoading] = useState(false)
  const [korviaSync, setKorviaSync]       = useState(false)
  const [korviaCtx, setKorviaCtx]         = useState<{ tasks: any[]; subs: any[]; finance: any; computed: any } | null>(null)
  const [korviaCtxLoading, setKorviaCtxLoading] = useState(false)

  useEffect(() => { refreshProjects() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project) return
    fetch(`/api/projects/${project.id}/files`)
      .then(r => r.json())
      .then(d => setFiles(d.files ?? []))
      .catch(() => {})
      .finally(() => setLoadingFiles(false))
  }, [project?.id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !project) return
    if (file.size > 20 * 1024 * 1024) { setUploadError('Max file size is 20 MB'); return }
    setUploading(true); setUploadError('')
    const fd = new FormData()
    fd.append('file', file); fd.append('category', uploadCat)
    const res  = await fetch(`/api/projects/${project.id}/files`, { method: 'POST', body: fd })
    const data = await res.json()
    if (data.ok) { setFiles(prev => [data.file, ...prev]) } else { setUploadError(data.error ?? 'Upload failed') }
    setUploading(false); e.target.value = ''
  }

  async function handleDeleteFile(fileId: string) {
    if (!project) return
    await fetch(`/api/projects/${project.id}/files/${fileId}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  function openEditSub(c: Sub) { setEditSub(c); setEditForm({ ...c }) }

  async function handleEditSave() {
    if (!editForm || !project) return
    setEditSaving(true)
    await fetch(`/api/join/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    await refreshProjects()
    setEditSaving(false); setEditSub(null)
  }

  function getTaskSub(task: any): Sub | undefined {
    return contractors.find((c: Sub) =>
      (task.assignedTo && c.company?.toLowerCase().trim() === task.assignedTo?.toLowerCase().trim()) ||
      (task.subcontractorPhone && c.phone === task.subcontractorPhone)
    )
  }

  async function openKorvia() {
    setKorviaOpen(true)
    if (!project?.id || korviaCtx) return
    setKorviaCtxLoading(true)
    try {
      const [ctxRes, finRes] = await Promise.all([
        fetch(`/api/builder/project-context/${project.id}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/builder/projects/${project.id}/financials`).then(r => r.ok ? r.json() : null),
      ])
      setKorviaCtx({
        tasks:    ctxRes?.tasks    ?? [],
        subs:     ctxRes?.subs     ?? [],
        finance:  finRes?.financials ?? null,
        computed: finRes?.computed   ?? null,
      })
    } catch {}
    setKorviaCtxLoading(false)
  }

  async function askKorvia() {
    if (!korviaQ.trim() || !project) return
    setKorviaLoading(true); setKorviaA('')
    try {
      const res  = await fetch('/api/builder/ask-korvia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, question: korviaQ }),
      })
      const data = await res.json()
      setKorviaA(data.answer ?? data.error ?? '⚠️ KORVIA no respondió. Revisa los logs de Vercel.')
    } catch (e: any) {
      setKorviaA(`⚠️ Error de red: ${e.message}`)
    }
    setKorviaLoading(false)
  }

  async function runKorviaSync() {
    if (!project) return
    setKorviaSync(true)
    try {
      await fetch(`/api/builder/project-sync/${project.id}`, { method: 'POST' })
      await refreshProjects()
    } catch {}
    setKorviaSync(false)
  }

  if (!ready) return <Spinner />
  if (!project) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-gray-400">
        <p>Project not found</p>
        <Link href="/projects" className="text-blue-600 text-sm mt-2 block">Back to Projects</Link>
      </div>
    </div>
  )

  const active    = project.tasks.filter(t => t.status === 'active').length
  const delayed   = project.tasks.filter(t => t.status === 'delayed').length
  const completed = project.tasks.filter(t => t.status === 'completed').length
  const mapsUrl   = `https://maps.google.com/?q=${encodeURIComponent(project.address)}`
  const joinUrl   = `${typeof window !== 'undefined' ? window.location.origin : 'https://brivox-jovanyrojs-projects.vercel.app'}/join/${project.id}`
  const bgColor   = (project as any).bgColor || '#1A2B4A'

  const unassignedTasks      = project.tasks.filter(t => !t.assignedTo)
  const assignedUnregistered = project.tasks.filter(t => t.assignedTo && !getTaskSub(t))
  const fullyAssigned        = project.tasks.filter(t => t.assignedTo && getTaskSub(t))

  return (
    <div className="pb-24">
      <TopBar
        title={project.name}
        backHref="/projects"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/projects/${project.id}/contractors`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-xl">
              👷 Subs
            </Link>
            <Link href={`/projects/${project.id}/timeline`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
              <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><line x1="17" y1="12" x2="3" y2="12"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              Timeline
            </Link>
            <button onClick={() => setShowDelete(true)} className="p-1.5 text-gray-400 hover:text-red-500 transition">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        }
      />

      {/* Header */}
      <div className="px-5 py-5" style={{ backgroundColor: bgColor }}>
        <div className="flex items-start justify-between mb-3">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="text-white/60 text-xs flex items-center gap-1 underline underline-offset-2 hover:text-white/80 transition">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {project.address}
          </a>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-white/70 text-xs">Overall Progress</span>
          <span className="text-white font-bold text-sm">{project.progressPercentage}%</span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${project.status === 'delayed' ? 'bg-red-400' : project.status === 'completed' ? 'bg-green-400' : 'bg-blue-300'}`}
            style={{ width: `${project.progressPercentage}%` }} />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-white/60">
          <span>Start: {format(parseISO(project.startDate), 'MMM d, yyyy')}</span>
          <span>Est. Close: {format(parseISO(project.estimatedEndDate), 'MMM d, yyyy')}</span>
        </div>
      </div>

      {/* KORVIA AI banner */}
      <div className="mx-4 mt-3 px-3 py-2.5 bg-indigo-50 rounded-xl flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <ellipse cx="14" cy="15" rx="11" ry="12" fill="#E8EDF5" stroke="#CBD5E1" strokeWidth="1"/>
          <ellipse cx="14" cy="13" rx="8" ry="9" fill="white" stroke="#CBD5E1" strokeWidth="0.8"/>
          <ellipse cx="10.5" cy="11" rx="2.5" ry="2" fill="#3B82F6"/>
          <ellipse cx="17.5" cy="11" rx="2.5" ry="2" fill="#3B82F6"/>
          <ellipse cx="10.5" cy="11" rx="1.2" ry="1" fill="#1D4ED8"/>
          <ellipse cx="17.5" cy="11" rx="1.2" ry="1" fill="#1D4ED8"/>
          <circle cx="11.1" cy="10.4" r="0.5" fill="white"/>
          <circle cx="18.1" cy="10.4" r="0.5" fill="white"/>
          <path d="M11 15.5 Q14 17.5 17 15.5" stroke="#94A3B8" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
          <rect x="12" y="23" width="4" height="2.5" rx="1" fill="#CBD5E1"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-700">KORVIA is active</p>
          <p className="text-xs text-indigo-500 truncate">Monitoring subcontractor updates 24/7</p>
        </div>
        <button onClick={runKorviaSync} disabled={korviaSync}
          title="KORVIA re-matches all registered subs to tasks by trade"
          className="text-xs text-indigo-600 font-semibold border border-indigo-200 rounded-lg px-2 py-1 disabled:opacity-50 mr-1">
          {korviaSync ? '⟳' : '🔄 Sync'}
        </button>
        <button onClick={openKorvia}
          className="text-xs text-white font-semibold bg-indigo-600 rounded-lg px-2.5 py-1">
          Ask 🤖
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 py-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Total',   value: project.tasks.length, color: 'text-gray-700' },
          { label: 'Active',  value: active,    color: 'text-blue-600' },
          { label: 'Delayed', value: delayed,   color: 'text-red-500' },
          { label: 'Done',    value: completed, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Access — Project Modules */}
      <div className="px-4 mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Project Modules</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { href: `/projects/${project.id}/finances`,    icon: '💰', label: 'Finances',     color: 'bg-green-50 text-green-700' },
            { href: `/projects/${project.id}/quote`,       icon: '📋', label: 'Quote',        color: 'bg-blue-50 text-blue-700'  },
            { href: `/projects/${project.id}/materials`,   icon: '🪵', label: 'Materials',    color: 'bg-amber-50 text-amber-700' },
            { href: `/projects/${project.id}/documents`,   icon: '📂', label: 'Documents',    color: 'bg-purple-50 text-purple-700' },
            { href: `/projects/${project.id}/inspections`, icon: '🔍', label: 'Inspections',  color: 'bg-orange-50 text-orange-700' },
            { href: `/projects/${project.id}/timeline`,    icon: '📅', label: 'Timeline',     color: 'bg-indigo-50 text-indigo-700' },
          ].map(m => (
            <Link key={m.href} href={m.href}
              className={`shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-2xl ${m.color} min-w-[72px]`}>
              <span className="text-xl">{m.icon}</span>
              <span className="text-xs font-semibold">{m.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* TASKS */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A2B4A]">Tasks ({project.tasks.length})</h2>
        </div>
        <div className="card divide-y divide-gray-50">
          {project.tasks.map(task => {
            const registeredSub = getTaskSub(task)
            return (
              <div key={task.id} className="flex items-center hover:bg-gray-50 transition group">
                <Link href={`/projects/${project.id}/tasks/${task.id}`} className="flex-1 px-4 py-3.5 flex items-start gap-3 min-w-0">
                  <span className="text-gray-300 text-xs w-5 text-right flex-shrink-0 mt-0.5">{task.order}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A2B4A] truncate">{task.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(parseISO(task.startDate), 'MMM d')} → {format(parseISO(task.endDate), 'MMM d')}
                    </p>
                    <div className="mt-1">
                      {task.assignedTo ? (
                        registeredSub ? (
                          <button onClick={e => { e.preventDefault(); openEditSub(registeredSub) }}
                            className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs rounded-full px-2 py-0.5 font-medium hover:bg-green-100 transition">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"/>
                            {task.assignedTo}
                          </button>
                        ) : (
                          <Link href={`/projects/${project.id}/contractors`} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-full px-2 py-0.5 font-medium hover:bg-amber-100 transition">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"/>
                            {task.assignedTo} · awaiting
                          </Link>
                        )
                      ) : (
                        <Link href={`/projects/${project.id}/contractors`} onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 bg-red-50 border border-red-100 text-red-500 text-xs rounded-full px-2 py-0.5 font-medium hover:bg-red-100 transition">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"/>
                          Needs sub
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    {task.delayDays > 0 && <span className="text-xs text-red-500 font-medium">+{task.delayDays}d</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </Link>
                <button onClick={() => setTaskToDelete(task.id)}
                  className="px-3 py-3.5 text-gray-200 hover:text-red-400 transition opacity-0 group-hover:opacity-100 flex-shrink-0">
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* SUBCONTRACTORS MINI PANEL */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A2B4A]">👷 Subcontractors</h2>
          <Link href={`/projects/${project.id}/contractors`} className="text-xs text-blue-600 font-semibold">Manage all →</Link>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-green-500"/>
            <span className="text-xs text-green-700 font-medium">{fullyAssigned.length} assigned</span>
          </div>
          {assignedUnregistered.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"/>
              <span className="text-xs text-amber-700 font-medium">{assignedUnregistered.length} awaiting</span>
            </div>
          )}
          {unassignedTasks.length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-red-400"/>
              <span className="text-xs text-red-600 font-medium">{unassignedTasks.length} need sub</span>
            </div>
          )}
        </div>
        {contractors.length === 0 ? (
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">👷</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-600">No subs registered yet</p>
              <p className="text-xs text-gray-400 mt-0.5">Share the join link so contractors can register</p>
            </div>
            <button onClick={() => navigator.clipboard?.writeText(joinUrl)}
              className="text-xs text-blue-600 font-semibold flex-shrink-0">Copy link</button>
          </div>
        ) : (
          <div className="card divide-y divide-gray-50">
            {contractors.map((c: Sub) => {
              const cTasks = project.tasks.filter(t =>
                (t.assignedTo && c.company?.toLowerCase().trim() === t.assignedTo?.toLowerCase().trim()) ||
                (t.subcontractorPhone && c.phone === t.subcontractorPhone)
              )
              const doneCount = cTasks.filter(t => t.status === 'completed').length
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-700">{c.company?.charAt(0)?.toUpperCase() ?? '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A2B4A] truncate">{c.company}</p>
                    <p className="text-xs text-gray-400">{c.trade} · {doneCount}/{cTasks.length} tasks done</p>
                    {cTasks.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {cTasks.slice(0, 3).map(t => (
                          <Link key={t.id} href={`/projects/${project.id}/tasks/${t.id}`}
                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              t.status === 'completed' ? 'bg-green-100 text-green-700' :
                              t.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                              t.status === 'delayed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>{t.name}</Link>
                        ))}
                        {cTasks.length > 3 && <span className="text-xs text-gray-400">+{cTasks.length - 3}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => openEditSub(c)}
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition" title="Edit">
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <Link href={`/portal/${project.id}/${c.id}`} target="_blank"
                      className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition" title="View portal">
                      <svg width="13" height="13" fill="none" stroke="#2E7CF6" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-3 card p-3 flex items-center gap-2">
          <p className="text-xs text-gray-400 flex-1 truncate">🔗 {joinUrl}</p>
          <button onClick={() => navigator.clipboard?.writeText(joinUrl)}
            className="text-xs text-blue-600 font-semibold flex-shrink-0 px-2 py-1 bg-blue-50 rounded-lg">Copy</button>
        </div>
      </div>

      {/* PLANOS & ARCHIVOS */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A2B4A]">📐 Planos & Archivos</h2>
          <span className="text-xs text-gray-400">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card p-4 mb-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">UPLOAD FILE</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {FILE_CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => setUploadCat(cat.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  uploadCat === cat.value ? 'bg-[#1A2B4A] text-white border-[#1A2B4A]' : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
          {uploadError && <p className="text-xs text-red-500 mb-2">{uploadError}</p>}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-full py-3 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-50 transition disabled:opacity-50">
            {uploading
              ? <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/> Uploading...</>
              : <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload {FILE_CATEGORIES.find(c => c.value === uploadCat)?.label} File</>
            }
          </button>
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.svg,.dwg,.dxf,.xlsx,.docx"
            onChange={handleUpload}/>
          <p className="text-xs text-gray-400 mt-1.5 text-center">PDF, PNG, JPG, DWG · Max 20 MB</p>
        </div>
        {loadingFiles ? (
          <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>
        ) : files.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">No files uploaded yet</div>
        ) : (
          <div className="flex flex-col gap-2">
            {FILE_CATEGORIES.filter(cat => files.some(f => f.category === cat.value)).map(cat => (
              <div key={cat.value}>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">{cat.icon} {cat.label}</p>
                {files.filter(f => f.category === cat.value).map(file => (
                  <div key={file.id} className="card flex items-center gap-3 px-3 py-2.5 mb-1.5">
                    <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      {file.file_type?.includes('pdf') ? '📄' : file.file_type?.includes('image') ? '🖼️' : '📁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1A2B4A] truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(file.file_size)} · {format(parseISO(file.uploaded_at), 'MMM d, yyyy')}</p>
                    </div>
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:text-blue-700 transition">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                    <button onClick={() => handleDeleteFile(file.id)} className="p-2 text-gray-300 hover:text-red-400 transition">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ASK KORVIA MODAL ──────────────────────────────────────────────── */}
      {korviaOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => { setKorviaOpen(false); setKorviaA(''); setKorviaQ('') }}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="text-sm font-bold text-[#1A2B4A]">Ask KORVIA</h3>
              </div>
              <button onClick={() => { setKorviaOpen(false); setKorviaA(''); setKorviaQ('') }}
                className="text-gray-400 hover:text-gray-600 p-1">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* ── KORVIA Knowledge Panel ── */}
            {korviaCtxLoading && (
              <div className="bg-indigo-50/40 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                <p className="text-[11px] text-indigo-500">Cargando contexto del proyecto…</p>
              </div>
            )}
            {korviaCtx && !korviaCtxLoading && !korviaA && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 mb-3">
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mb-2">📡 KORVIA tiene acceso a</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="bg-white rounded-lg p-2 text-center border border-indigo-50">
                    <p className="text-[9px] text-gray-400 mb-0.5">Tareas</p>
                    <p className="text-base font-bold text-indigo-700">{korviaCtx.tasks.length}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border border-indigo-50">
                    <p className="text-[9px] text-gray-400 mb-0.5">Subs</p>
                    <p className="text-base font-bold text-indigo-700">{korviaCtx.subs.length}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border border-indigo-50">
                    <p className="text-[9px] text-gray-400 mb-0.5">Finanzas</p>
                    <p className="text-base font-bold text-indigo-700">{korviaCtx.finance ? '✅' : '—'}</p>
                  </div>
                </div>
                {korviaCtx.finance?.sqft ? (
                  <p className="text-[10px] text-indigo-600 bg-white rounded-lg px-2.5 py-1.5 border border-indigo-50">
                    💰 {korviaCtx.finance.sqft.toLocaleString()} sqft
                    {korviaCtx.finance.construction_cost_per_sqft ? ` · $${korviaCtx.finance.construction_cost_per_sqft}/sqft costo` : ''}
                    {korviaCtx.finance.sale_price_per_sqft ? ` · $${korviaCtx.finance.sale_price_per_sqft}/sqft venta` : ''}
                    {korviaCtx.computed?.projectedMargin != null ? ` · ${korviaCtx.computed.projectedMargin.toFixed(0)}% margen` : ''}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                    💡 Agrega datos en Finanzas para que KORVIA pueda responder sobre márgenes y costos
                  </p>
                )}
              </div>
            )}

            {/* Answer */}
            {korviaLoading && (
              <div className="bg-indigo-50 rounded-2xl p-3 mb-3 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                <p className="text-xs text-indigo-600">KORVIA is thinking…</p>
              </div>
            )}
            {korviaA && !korviaLoading && (
              <div className="bg-indigo-50 rounded-2xl p-3 mb-3">
                <p className="text-xs font-semibold text-indigo-500 mb-1.5">🤖 KORVIA</p>
                <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{korviaA}</p>
              </div>
            )}

            {/* Input */}
            <textarea
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none focus:outline-none focus:border-indigo-400"
              rows={3}
              placeholder="Pregunta lo que quieras… ej: '¿Cuál es el margen proyectado?' o 'What tasks are delayed?'"
              value={korviaQ}
              onChange={e => setKorviaQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askKorvia() } }}
            />
            <button onClick={askKorvia} disabled={korviaLoading || !korviaQ.trim()}
              className="w-full mt-2 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50 active:scale-95 transition">
              {korviaLoading ? 'Thinking…' : 'Ask KORVIA →'}
            </button>

            {!korviaA && !korviaLoading && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  '¿Cuál es el margen proyectado?',
                  '¿Qué tareas están retrasadas?',
                  '¿Cuánto se ha cotizado en total?',
                  '¿Qué falta por hacer?',
                ].map(q => (
                  <button key={q} onClick={() => setKorviaQ(q)}
                    className="text-xs text-indigo-600 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-50 transition">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Sub Modal */}
      {editSub && editForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditSub(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#1A2B4A]">Edit Subcontractor</h3>
                <p className="text-xs text-gray-400 mt-0.5">{editSub.company}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/portal/${project.id}/${editSub.id}`} target="_blank"
                  className="text-xs text-blue-600 font-semibold border border-blue-200 rounded-lg px-2 py-1">
                  View Portal ↗
                </Link>
                <button onClick={() => setEditSub(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Company', field: 'company', type: 'text' },
                { label: 'Contact Name', field: 'name', type: 'text' },
                { label: 'Phone', field: 'phone', type: 'tel' },
                { label: 'Email', field: 'email', type: 'email' },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                  <input className="input" type={type} value={(editForm as any)[field] ?? ''}
                    onChange={e => setEditForm(f => f ? { ...f, [field]: e.target.value } : f)}/>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Trade</label>
                <select className="input" value={editForm.trade}
                  onChange={e => setEditForm(f => f ? { ...f, trade: e.target.value } : f)}>
                  {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <textarea className="input" rows={2} value={editForm.notes}
                  onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)}/>
              </div>
            </div>
            <button onClick={handleEditSave} disabled={editSaving}
              className="w-full mt-4 py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-60">
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Delete task confirm */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete Task?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <strong>{project.tasks.find(t => t.id === taskToDelete)?.name}</strong> will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setTaskToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
              <button onClick={() => { deleteTask(project.id, taskToDelete); setTaskToDelete(null) }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete project confirm */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">Delete Project?</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently delete <strong>{project.name}</strong> and all its tasks.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
              <button onClick={() => { deleteProject(project.id); router.replace('/projects') }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
