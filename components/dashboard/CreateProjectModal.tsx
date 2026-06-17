'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'

export default function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useBuildFlowStore(s => s.createProject)
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    address: '',
    projectType: 'singleFamily' as const,
    startDate: format(new Date(), 'yyyy-MM-dd'),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await new Promise(r => setTimeout(r, 300))
      const project = await createProject(form)
      onClose()
      router.push(`/projects/${project.id}`)
    } catch (err: any) {
      console.error('createProject error:', err)
      setError(err?.message ?? 'Error creating project. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-white rounded-t-3xl shadow-2xl overflow-y-auto"
        style={{ maxHeight: '92dvh', padding: '1.5rem 1.5rem 2.5rem' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5"/>
        <h2 className="text-lg font-bold text-[#1A2B4A] mb-5">New Project</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Project Name" required>
            <input
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
              placeholder="e.g. Oak Ridge Residence"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </Field>

          <Field label="Address" required>
            <input
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
              placeholder="e.g. 123 Main St, Edmond OK"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              required
            />
          </Field>

          <Field label="Project Type">
            <select
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
              value={form.projectType}
              onChange={e => setForm(f => ({ ...f, projectType: e.target.value as any }))}
            >
              <option value="singleFamily">Single Family Home</option>
              <option value="remodel">Remodel</option>
              <option value="duplex">Duplex</option>
              <option value="commercial">Commercial</option>
            </select>
          </Field>

          <Field label="Start Date">
            <input
              type="date"
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              required
            />
          </Field>

          <p className="text-xs text-gray-400 bg-blue-50 rounded-xl p-3 text-center">
            22 tasks will be auto-generated with default durations and dependencies.
          </p>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-[#2E7CF6] text-white font-semibold rounded-xl hover:bg-blue-600 transition disabled:opacity-60"
          >
            {saving ? 'Creating project...' : 'Create Project'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
