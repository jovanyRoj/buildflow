'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { ProjectStatusBadge, TaskStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'

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
  const { getProject, deleteProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project  = getProject(params.id as string)
  const [showDelete, setShowDelete]   = useState(false)
  const [files, setFiles]             = useState<ProjectFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [uploadCat, setUploadCat]     = useState('foundation')
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    fd.append('file', file)
    fd.append('category', uploadCat)
    const res  = await fetch(`/api/projects/${project.id}/files`, { method: 'POST', body: fd })
    const data = await res.json()
    if (data.ok) {
      setFiles(prev => [data.file, ...prev])
    } else {
      setUploadError(data.error ?? 'Upload failed')
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleDelete(fileId: string, filePath: string) {
    if (!project) return
    await fetch(`/api/projects/${project.id}/files/${fileId}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f.id !== fileId))
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
  const joinUrl   = `${typeof window !== 'undefined' ? window.location.origin : 'https://buildflow-eight-sigma.vercel.app'}/join/${project.id}`

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
      <div className="bg-[#1A2B4A] px-5 py-5">
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
          <div className={`h-full rounded-full transition-all duration-700 ${project.status === 'delayed' ? 'bg-red-400' : project.status === 'completed' ? 'bg-green-400' : 'bg-blue-400'}`}
            style={{ width: `${project.progressPercentage}%` }} />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-white/60">
          <span>Start: {format(parseISO(project.startDate), 'MMM d, yyyy')}</span>
          <span>Est. Close: {format(parseISO(project.estimatedEndDate), 'MMM d, yyyy')}</span>
        </div>
      </div>

      {/* Sofia AI banner */}
      <div className="mx-4 mt-3 px-3 py-2.5 bg-indigo-50 rounded-xl flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <circle cx="14" cy="13" r="9.5" stroke="#818CF8" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-700">Sofia AI is active</p>
          <p className="text-xs text-indigo-500 truncate">Monitoring subcontractor SMS updates 24/7</p>
        </div>
        <Link href={`/projects/${project.id}/contractors`} className="text-xs text-indigo-600 font-semibold whitespace-nowrap">
          Manage →
        </Link>
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

      {/* Tasks */}
      <div className="px-4 mb-5">
        <h2 className="text-sm font-bold text-[#1A2B4A] mb-3">Tasks</h2>
        <div className="card divide-y divide-gray-50">
          {project.tasks.map(task => (
            <Link key={task.id} href={`/projects/${project.id}/tasks/${task.id}`}>
              <div className="px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition">
                <span className="text-gray-300 text-xs w-5 text-right flex-shrink-0">{task.order}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A2B4A] truncate">{task.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(parseISO(task.startDate), 'MMM d')} → {format(parseISO(task.endDate), 'MMM d')}
                    {task.assignedTo && <span className="ml-2 text-gray-300">· {task.assignedTo}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.delayDays > 0 && <span className="text-xs text-red-500 font-medium">+{task.delayDays}d</span>}
                  <TaskStatusBadge status={task.status} />
                  <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Planos & Archivos */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#1A2B4A]">📐 Planos & Archivos</h2>
          <span className="text-xs text-gray-400">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Upload section */}
        <div className="card p-4 mb-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">UPLOAD FILE</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {FILE_CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => setUploadCat(cat.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                  uploadCat === cat.value
                    ? 'bg-[#1A2B4A] text-white border-[#1A2B4A]'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
          {uploadError && <p className="text-xs text-red-500 mb-2">{uploadError}</p>}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-50 transition disabled:opacity-50">
            {uploading ? (
              <><div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/> Uploading...</>
            ) : (
              <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload {FILE_CATEGORIES.find(c => c.value === uploadCat)?.label} File</>
            )}
          </button>
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.svg,.dwg,.dxf,.xlsx,.docx"
            onChange={handleUpload}/>
          <p className="text-xs text-gray-400 mt-1.5 text-center">PDF, PNG, JPG, DWG · Max 20 MB</p>
        </div>

        {/* Files list */}
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
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="p-2 text-blue-500 hover:text-blue-700 transition">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                    <button onClick={() => handleDelete(file.id, (file as any).file_path)}
                      className="p-2 text-gray-300 hover:text-red-400 transition">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Join link */}
      <div className="px-4 mb-5">
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1">🔗 SUBCONTRACTOR JOIN LINK</p>
          <p className="text-xs text-gray-400 mb-2">Share this link so subs can register and access project files</p>
          <button onClick={() => { navigator.clipboard?.writeText(joinUrl); }}
            className="w-full py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono truncate text-left px-3 flex items-center justify-between gap-2 hover:bg-gray-100 transition">
            <span className="truncate">{joinUrl}</span>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="flex-shrink-0"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </div>

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
