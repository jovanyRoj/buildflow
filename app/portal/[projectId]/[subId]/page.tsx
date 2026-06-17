'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, parseISO } from 'date-fns'

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

function formatBytes(b: number) {
  if (!b) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function GuestPortal() {
  const { projectId, subId } = useParams() as { projectId: string; subId: string }
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState<'info' | 'tasks' | 'files'>('info')

  useEffect(() => {
    fetch(`/api/portal/${projectId}/${subId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => setError('Could not load project'))
      .finally(() => setLoading(false))
  }, [projectId, subId])

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
        <div className="mt-3 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
          <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="text-white text-xs font-medium">{sub.company}</span>
          {sub.trade && <span className="text-white/50 text-xs">· {sub.trade}</span>}
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

        {/* INFO TAB */}
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

            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="w-full py-3.5 rounded-2xl bg-[#1A2B4A] text-white font-bold text-sm flex items-center justify-center gap-2">
              <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Open in Google Maps
            </a>
          </div>
        )}

        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <div className="flex flex-col gap-2">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No tasks assigned yet</div>
            ) : tasks.map((task: any) => (
              <div key={task.id} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-[#1A2B4A] leading-tight">{task.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                    task.status === 'completed' ? 'bg-green-100 text-green-700' :
                    task.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                    task.status === 'delayed'     ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{task.status?.replace('_',' ')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-blue-400 mb-0.5">Start</p>
                    <p className="font-bold text-blue-700">{task.start_date ? format(parseISO(task.start_date), 'MMM d') : '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-gray-400 mb-0.5">Due</p>
                    <p className="font-bold text-gray-700">{task.end_date ? format(parseISO(task.end_date), 'MMM d') : '—'}</p>
                  </div>
                </div>
                {task.notes && (
                  <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-700">{task.notes}</p>
                  </div>
                )}
                {task.portal_token && (
                  <a href={`/sub/${task.portal_token}`}
                    className="mt-2.5 w-full py-2 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                    📤 Update Status
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* FILES TAB */}
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
