'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { TRADES } from '@/lib/tradeMapping'
import { Project } from '@/lib/types'

type Step = 'loading' | 'notfound' | 'form' | 'success'

export default function JoinProjectPage() {
  const { projectId } = useParams() as { projectId: string }
  const [project, setProject] = useState<Project | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [form, setForm] = useState({ company: '', contactName: '', phone: '', trade: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Find project across all users' localStorage
    let found: Project | null = null
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('buildflow-projects-')) continue
      const projects: Project[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      const p = projects.find(p => p.id === projectId)
      if (p) { found = p; break }
    }
    if (found) { setProject(found); setStep('form') }
    else setStep('notfound')
  }, [projectId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.trade) return setError('Please select your trade area.')
    setError('')
    setSaving(true)

    // Save contractor to project in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('buildflow-projects-')) continue
      const projects: Project[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      const pIdx = projects.findIndex(p => p.id === projectId)
      if (pIdx === -1) continue

      const { v4: uuidv4 } = await import('uuid')
      const { getTasksForTrade } = await import('@/lib/tradeMapping')
      const normalizedPhone = form.phone.replace(/\D/g, '')
      const e164 = normalizedPhone.length === 10 ? `+1${normalizedPhone}` : `+${normalizedPhone}`

      // Create contractor entry
      const contractor = {
        id: uuidv4(),
        name: form.contactName,
        company: form.company,
        phone: e164,
        trade: form.trade,
        email: '',
        notes: '',
        joinedAt: new Date().toISOString(),
      }

      // Add to subcontractors list
      if (!projects[pIdx].subcontractors) projects[pIdx].subcontractors = []
      projects[pIdx].subcontractors.push(contractor)

      // Auto-assign to matching tasks
      const taskNames = getTasksForTrade(form.trade)
      let assignedCount = 0
      projects[pIdx].tasks = projects[pIdx].tasks.map(task => {
        if (taskNames.includes(task.name)) {
          assignedCount++
          return { ...task, assignedTo: `${form.company}`, subcontractorPhone: e164, updatedAt: new Date().toISOString() }
        }
        return task
      })

      // Add notification for builder
      projects[pIdx].notifications.push({
        id: uuidv4(),
        projectId,
        type: 'subcontractor',
        title: `${form.company} joined the project`,
        body: `${form.contactName} (${form.trade}) registered and was assigned to ${assignedCount} task(s).`,
        isRead: false,
        createdAt: new Date().toISOString(),
      })

      projects[pIdx].history.push({
        id: uuidv4(),
        projectId,
        type: 'subNotified',
        description: `${form.company} joined as ${form.trade} contractor. Assigned to ${assignedCount} tasks.`,
        timestamp: new Date().toISOString(),
      })

      localStorage.setItem(key, JSON.stringify(projects))

      // Send welcome SMS via API
      await fetch('/api/contractors/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: e164,
          company: form.company,
          contactName: form.contactName,
          trade: form.trade,
          projectName: projects[pIdx].name,
          projectAddress: projects[pIdx].address,
          assignedCount,
        }),
      }).catch(() => {})

      break
    }

    setSaving(false)
    setStep('success')
  }

  if (step === 'loading') return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (step === 'notfound') return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="text-5xl">🔗</div>
      <h2 className="font-bold text-[#1A2B4A] text-lg">Project not found</h2>
      <p className="text-gray-500 text-sm">This link may be expired. Contact your builder for a new one.</p>
    </div>
  )

  if (step === 'success') return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center px-6 text-center gap-5">
      <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-4xl shadow-xl">✅</div>
      <div>
        <h2 className="text-2xl font-bold text-white">You're registered!</h2>
        <p className="text-white/70 mt-2 text-sm">Welcome to <strong className="text-white">{project?.name}</strong></p>
      </div>
      <div className="card w-full p-5 text-left">
        <p className="text-xs font-semibold text-gray-500 mb-3">YOUR REGISTRATION</p>
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Company" value={form.company}/>
          <Row label="Contact" value={form.contactName}/>
          <Row label="Phone" value={form.phone}/>
          <Row label="Trade" value={TRADES.find(t => t.value === form.trade)?.label ?? form.trade}/>
          <Row label="Project" value={project?.name ?? ''}/>
        </div>
      </div>
      <p className="text-white/50 text-xs text-center">
        You'll receive an SMS at {form.phone} when your tasks are ready to start.
        <br/>No app download needed.
      </p>
      <img src="/BuildFlowLogo.png" alt="" className="h-8 w-8 rounded-xl opacity-40 mt-2"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4F6F9] pb-10 max-w-[480px] mx-auto">
      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-8 text-center">
        <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-12 w-12 rounded-2xl shadow-xl mx-auto mb-4"/>
        <h1 className="text-white text-xl font-bold">Join Construction Project</h1>
        <p className="text-white/60 text-sm mt-1">{project?.name}</p>
        <p className="text-white/40 text-xs mt-0.5 flex items-center justify-center gap-1">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {project?.address}
        </p>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold text-blue-700 mb-1">👷 Register your company</p>
          You'll automatically receive SMS notifications when your work phase begins, when parallel trades start, and when inspections are needed.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="card p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-500">COMPANY INFO</p>

            <Field label="Company Name *">
              <input className="input" placeholder="e.g. Garcia Electric LLC"
                value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} required/>
            </Field>

            <Field label="Contact Name *">
              <input className="input" placeholder="e.g. Juan Garcia"
                value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} required/>
            </Field>

            <Field label="Phone Number *">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1 19.79 19.79 0 0 1 1.61 4.52 2 2 0 0 1 3.6 2.34h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1-1.03a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </span>
                <input className="input pl-9" placeholder="(405) 555-1234" type="tel"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required/>
              </div>
              <p className="text-xs text-gray-400 mt-1">You'll receive updates via SMS</p>
            </Field>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">YOUR TRADE AREA *</p>
            <div className="flex flex-col gap-2">
              {TRADES.map(trade => (
                <button key={trade.value} type="button"
                  onClick={() => setForm(f => ({ ...f, trade: trade.value }))}
                  className={`w-full py-3 px-4 rounded-xl border-2 text-left text-sm font-medium transition active:scale-[0.98] ${
                    form.trade === trade.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <span className="font-semibold">{trade.label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Tasks: {trade.tasks.join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl py-3">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-2xl bg-[#2E7CF6] text-white font-bold text-base active:scale-[0.98] transition disabled:opacity-60 shadow-lg">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                </svg>
                Registering...
              </span>
            ) : '✅ Register & Join Project'}
          </button>

          <p className="text-center text-xs text-gray-400">
            No app download required · SMS notifications only
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="font-medium text-[#1A2B4A] text-right">{value}</span>
    </div>
  )
}
