'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { TRADES } from '@/lib/tradeMapping'

type Step = 'loading' | 'notfound' | 'form' | 'saving' | 'success'

interface ProjectInfo { id: string; name: string; address: string }

export default function JoinProjectPage() {
  const { projectId } = useParams() as { projectId: string }
  const [project, setProject]   = useState<ProjectInfo | null>(null)
  const [step, setStep]         = useState<Step>('loading')
  const [form, setForm]         = useState({ company: '', contactName: '', phone: '', email: '', trade: '' })
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch(`/api/join/${projectId}`)
      .then(r => r.json())
      .then(d => {
        if (d.project) { setProject(d.project); setStep('form') }
        else setStep('notfound')
      })
      .catch(() => setStep('notfound'))
  }, [projectId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.trade) return setError('Please select your trade area.')
    setError('')
    setStep('saving')

    const res = await fetch(`/api/join/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setError(data.error ?? 'Registration failed. Try again.')
      setStep('form')
    } else {
      setStep('success')
    }
  }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  if (step === 'loading' || step === 'saving') return (
    <div className="min-h-screen bg-[#1A2B4A] flex flex-col items-center justify-center gap-4">
      <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-14 w-14 rounded-2xl shadow-xl"/>
      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"/>
      {step === 'saving' && <p className="text-white/60 text-sm">Registering your company…</p>}
    </div>
  )

  if (step === 'notfound') return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl">🔗</div>
      <h2 className="font-bold text-[#1A2B4A] text-lg">Project not found</h2>
      <p className="text-gray-500 text-sm">This link may be expired or invalid. Contact your builder.</p>
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
          <Row label="Company"  value={form.company}/>
          <Row label="Contact"  value={form.contactName}/>
          <Row label="Phone"    value={form.phone}/>
          {form.email && <Row label="Email" value={form.email}/>}
          <Row label="Trade"    value={TRADES.find(t => t.value === form.trade)?.label ?? form.trade}/>
          <Row label="Project"  value={project?.name ?? ''}/>
        </div>
      </div>
      <p className="text-white/50 text-xs">
        Sofia will text you at {form.phone} when your work phase begins.<br/>No app needed.
      </p>
      <img src="/BuildFlowLogo.png" alt="" className="h-8 w-8 rounded-xl opacity-40 mt-2"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4F6F9] pb-10 max-w-[480px] mx-auto">
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-8 text-center">
        <img src="/BuildFlowLogo.png" alt="BuildFlow" className="h-12 w-12 rounded-2xl shadow-xl mx-auto mb-4"/>
        <h1 className="text-white text-xl font-bold">Join Construction Project</h1>
        <p className="text-white/70 text-sm mt-1">{project?.name}</p>
        <p className="text-white/40 text-xs mt-0.5 flex items-center justify-center gap-1">
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          {project?.address}
        </p>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold text-blue-700 mb-1">👷 Register your company</p>
          You'll receive SMS notifications when your work phase begins and when you're needed on site.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="card p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-500">COMPANY INFO</p>
            <Field label="Company Name *">
              <input className="input" placeholder="e.g. Garcia Electric LLC"
                value={form.company} onChange={e => set('company', e.target.value)} required/>
            </Field>
            <Field label="Contact Name *">
              <input className="input" placeholder="e.g. Juan Garcia"
                value={form.contactName} onChange={e => set('contactName', e.target.value)} required/>
            </Field>
            <Field label="Phone Number *">
              <input className="input pl-3" placeholder="(405) 555-1234" type="tel"
                value={form.phone} onChange={e => set('phone', e.target.value)} required/>
              <p className="text-xs text-gray-400 mt-1">Sofia will contact you via SMS</p>
            </Field>
            <Field label="Email (optional)">
              <input className="input" placeholder="you@company.com" type="email"
                value={form.email} onChange={e => set('email', e.target.value)}/>
            </Field>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">YOUR TRADE AREA *</p>
            <div className="flex flex-col gap-2">
              {TRADES.map(trade => (
                <button key={trade.value} type="button"
                  onClick={() => set('trade', trade.value)}
                  className={`w-full py-3 px-4 rounded-xl border-2 text-left text-sm font-medium transition active:scale-[0.98] ${
                    form.trade === trade.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="font-semibold">{trade.label}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">Tasks: {trade.tasks.join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl py-3">{error}</p>}

          <button type="submit"
            className="w-full py-4 rounded-2xl bg-[#2E7CF6] text-white font-bold text-base active:scale-[0.98] transition shadow-lg">
            ✅ Register & Join Project
          </button>
          <p className="text-center text-xs text-gray-400">No app required · SMS notifications only</p>
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
