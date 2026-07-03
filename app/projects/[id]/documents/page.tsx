'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useBuildFlowStore } from '@/lib/store'
import { useAuthGuard } from '@/lib/useAuthGuard'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}

const DOC_TYPES = [
  { value: 'blueprint',         label: 'Blueprint',          icon: '📐' },
  { value: 'permit',            label: 'Permit',             icon: '📋' },
  { value: 'contract',          label: 'Contract',           icon: '📄' },
  { value: 'inspection_report', label: 'Inspection Report',  icon: '🔍' },
  { value: 'photo',             label: 'Photo',              icon: '📸' },
  { value: 'other',             label: 'Other',              icon: '📁' },
]

interface DocFile {
  id: string; document_type: string; title: string; file_url: string
  file_name: string; file_size_kb?: number; mime_type?: string
  version: number; is_current: boolean; visible_to_subs: boolean
  uploaded_by: string; notes?: string; created_at: string; task_id?: string
}

export default function DocumentsPage() {
  const params = useParams()
  const { getProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)

  const [docs, setDocs]           = useState<DocFile[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ document_type: 'blueprint', title: '', visible_to_subs: true, notes: '' })
  const [filterType, setFilterType] = useState('all')
  const [error, setError]         = useState('')
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    if (!project?.id) return
    const res = await fetch(`/api/builder/projects/${project.id}/documents`)
    const d = await res.json()
    setDocs(d.documents ?? [])
    setLoading(false)
  }, [project?.id])

  useEffect(() => { load() }, [load])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setError('Max 50 MB'); return }
    setSelectedFile(file)
    if (!uploadForm.title) setUploadForm(f => ({ ...f, title: file.name.replace(/\.[^/.]+$/, '') }))
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !selectedFile) return
    setUploading(true); setError('')
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('document_type', uploadForm.document_type)
    fd.append('title', uploadForm.title || selectedFile.name)
    fd.append('visible_to_subs', String(uploadForm.visible_to_subs))
    if (uploadForm.notes) fd.append('notes', uploadForm.notes)

    const res = await fetch(`/api/builder/projects/${project.id}/documents`, { method: 'POST', body: fd })
    const d = await res.json()
    if (d.ok) {
      setDocs(prev => [d.document, ...prev])
      setShowUpload(false); setSelectedFile(null)
      setUploadForm({ document_type: 'blueprint', title: '', visible_to_subs: true, notes: '' })
    } else {
      setError(d.error ?? 'Upload failed')
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    if (!project) return
    await fetch(`/api/builder/projects/${project.id}/documents?id=${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  if (!ready || !project) return <Spinner />

  const filtered = docs.filter(d => filterType === 'all' || d.document_type === filterType)

  const docInfo = (type: string) => DOC_TYPES.find(t => t.value === type) ?? { icon: '📁', label: type }

  function formatSize(kb?: number) {
    if (!kb) return ''
    if (kb < 1024) return `${kb} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  return (
    <div className="pb-24 bg-[#F4F6F9] min-h-screen">
      <TopBar
        title="Documents"
        backHref={`/projects/${project.id}`}
        action={
          <button onClick={() => setShowUpload(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
            + Upload
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterType('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterType === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}>
            All ({docs.length})
          </button>
          {DOC_TYPES.map(t => {
            const count = docs.filter(d => d.document_type === t.value).length
            if (count === 0) return null
            return (
              <button key={t.value} onClick={() => setFilterType(t.value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterType === t.value ? 'bg-gray-800 text-white' : 'bg-white text-gray-500'}`}>
                {t.icon} {t.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <div className="px-5">
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-semibold text-gray-800 mb-1">No documents yet</p>
            <p className="text-sm text-gray-400 mb-4">Upload blueprints, permits, contracts, and inspection reports for this project.</p>
            <button onClick={() => setShowUpload(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
              Upload First Document
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {filtered.map(doc => {
            const info = docInfo(doc.document_type)
            const isImage = doc.mime_type?.startsWith('image/')
            return (
              <div key={doc.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl shrink-0">
                    {isImage ? '🖼️' : info.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
                    <p className="text-xs text-gray-400 truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{info.label}</span>
                      {doc.file_size_kb && <span className="text-xs text-gray-300">• {formatSize(doc.file_size_kb)}</span>}
                      {doc.version > 1 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">v{doc.version}</span>}
                      {!doc.visible_to_subs && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">🔒 Private</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-xl">
                      Open
                    </a>
                    <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-gray-300 hover:text-red-400">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {doc.notes && <p className="text-xs text-gray-400 mt-2 italic">{doc.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">Upload Document</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Document Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {DOC_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setUploadForm(f => ({ ...f, document_type: t.value }))}
                      className={`py-2.5 rounded-xl text-xs font-medium text-center ${uploadForm.document_type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer ${selectedFile ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <>
                    <p className="text-2xl mb-1">✅</p>
                    <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl mb-1">📎</p>
                    <p className="text-sm font-medium text-gray-600">Tap to select file</p>
                    <p className="text-xs text-gray-400">PDF, images, Word — max 50 MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.dwg"
                  onChange={handleFileSelect}/>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Title</label>
                <input type="text" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm"
                  placeholder="Floor Plan v2, Electrical Permit..." value={uploadForm.title}
                  onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}/>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="visible" checked={uploadForm.visible_to_subs}
                  onChange={e => setUploadForm(f => ({ ...f, visible_to_subs: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"/>
                <label htmlFor="visible" className="text-sm text-gray-600">Visible to subcontractors</label>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none"
                  value={uploadForm.notes} onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null) }}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
                <button type="submit" disabled={uploading || !selectedFile}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
