'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useBuildFlowStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { TRADES, getTradeLabel } from '@/lib/tradeMapping'

type Sub = {
  id: string; name: string; company: string; phone: string;
  trade: string; email: string; notes: string
}

const TRADE_COLORS: Record<string, string> = {
  electrical: 'bg-yellow-100 text-yellow-800', plumbing: 'bg-blue-100 text-blue-800',
  hvac: 'bg-cyan-100 text-cyan-800',           framing:  'bg-orange-100 text-orange-800',
  concrete: 'bg-stone-100 text-stone-700',     roofing:  'bg-red-100 text-red-700',
  drywall: 'bg-gray-100 text-gray-700',        paint:    'bg-purple-100 text-purple-700',
  flooring: 'bg-amber-100 text-amber-800',     general:  'bg-green-100 text-green-700',
}

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
  </div>
}

export default function ContractorsPage() {
  const { id } = useParams() as { id: string }
  const { getProject, refreshProjects } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(id)

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [editSub, setEditSub] = useState<Sub | null>(null)
  const [editForm, setEditForm] = useState<Sub | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${id}`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app'}/join/${id}`

  useEffect(() => {
    if (!project) return
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(joinUrl, { width: 300, margin: 2, color: { dark: '#1A2B4A', light: '#FFFFFF' } })
        .then(setQrDataUrl)
    })
  }, [project, joinUrl])

  if (!ready || !project) return <Spinner />

  const contractors: Sub[] = (project as any).subcontractors ?? []

  function handleCopy() {
    navigator.clipboard.writeText(joinUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  async function handleNotify(c: Sub) {
    setSending(c.id)
    const assignedTasks = project!.tasks.filter(t => t.subcontractorPhone === c.phone)
    const nextTask = assignedTasks.find(t => t.status === 'pending' || t.status === 'active')
    if (nextTask) {
      await fetch('/api/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'task_assigned', task: nextTask, project, builderName: 'Builder' }),
      })
    }
    setSending(null); setSent(c.id); setTimeout(() => setSent(null), 3000)
  }

  function openEdit(c: Sub) {
    setEditSub(c); setEditForm({ ...c })
  }

  async function handleEditSave() {
    if (!editForm) return
    setEditSaving(true)
    await fetch(`/api/join/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    await refreshProjects()
    setEditSaving(false); setEditSub(null)
  }

  async function handleDelete(subId: string) {
    if (!confirm('Remove this subcontractor?')) return
    setDeleting(subId)
    await fetch(`/api/join/${id}?subId=${subId}`, { method: 'DELETE' })
    await refreshProjects()
    setDeleting(null)
  }

  return (
    <div className="pb-24">
      <TopBar title="Subcontractors" backHref={`/projects/${id}`} />

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* QR + Link */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <svg width="18" height="18" fill="none" stroke="#2E7CF6" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <p className="text-sm font-bold text-[#1A2B4A]">Invite Subcontractors</p>
          </div>
          <p className="text-xs text-gray-500 mb-4">Share this link or QR. Contractors register their info — no app needed.</p>
          {qrDataUrl && (
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48"/>
              </div>
            </div>
          )}
          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <p className="text-xs text-gray-400 mb-1">Registration Link</p>
            <p className="text-xs text-[#1A2B4A] font-mono break-all">{joinUrl}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCopy}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${copied ? 'bg-green-500 text-white' : 'bg-[#1A2B4A] text-white'}`}>
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            <button onClick={() => navigator.share?.({ title: `Join ${project.name}`, url: joinUrl })}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-[0.98]">
              📤 Share
            </button>
          </div>
        </div>

        {/* Contractors list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#1A2B4A]">Registered ({contractors.length})</h2>
            {contractors.length > 0 && (
              <span className="text-xs text-gray-400">{project.tasks.filter(t => t.subcontractorPhone).length} tasks assigned</span>
            )}
          </div>

          {contractors.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">👷</div>
              <p className="font-semibold text-[#1A2B4A] mb-1">No contractors yet</p>
              <p className="text-gray-400 text-sm">Share the link above — they register in 30 seconds</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {contractors.map((c: Sub) => {
                const assignedTasks = project.tasks.filter(t => t.subcontractorPhone === c.phone)
                const completedCount = assignedTasks.filter(t => t.status === 'completed').length
                const activeTask = assignedTasks.find(t => t.status === 'active')
                const tradeColor = TRADE_COLORS[c.trade] ?? 'bg-gray-100 text-gray-700'
                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-[#1A2B4A] text-sm">{c.company || c.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tradeColor}`}>
                            {getTradeLabel(c.trade).split(' /')[0]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{c.name} · {c.phone}</p>
                        {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition" title="Edit">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition text-red-500" title="Delete">
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: assignedTasks.length ? `${(completedCount / assignedTasks.length) * 100}%` : '0%' }}/>
                      </div>
                      <span className="text-xs text-gray-400">{completedCount}/{assignedTasks.length} tasks</span>
                    </div>

                    {activeTask && (
                      <div className="mb-3 bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
                        <span className="text-blue-500">🔨</span>
                        <p className="text-xs text-blue-700 font-medium">{activeTask.name}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {assignedTasks.slice(0, 4).map(t => (
                        <span key={t.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === 'completed' ? 'bg-green-100 text-green-700' :
                          t.status === 'active'    ? 'bg-orange-100 text-orange-700' :
                          t.status === 'delayed'   ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>{t.name}</span>
                      ))}
                      {assignedTasks.length > 4 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{assignedTasks.length - 4} more</span>
                      )}
                    </div>

                    <button onClick={() => handleNotify(c)} disabled={sending === c.id}
                      className={`w-full py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                        sent === c.id ? 'bg-green-500 text-white' : 'bg-[#1A2B4A] text-white'
                      } disabled:opacity-60`}>
                      {sending === c.id ? 'Sending…' : sent === c.id ? '✅ SMS Sent!' : '📱 Send SMS Update'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Trade coverage */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">TRADE COVERAGE</p>
          <div className="flex flex-col gap-2">
            {TRADES.map(trade => {
              const covered = contractors.some((c: Sub) => c.trade === trade.value)
              return (
                <div key={trade.value} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{trade.label.split(' /')[0]}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${covered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {covered ? '✓ Assigned' : 'Pending'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <BottomNav />

      {/* Edit Modal */}
      {editSub && editForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditSub(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#1A2B4A]">Edit Subcontractor</h3>
              <button onClick={() => setEditSub(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <EditField label="Company">
                <input className="input" value={editForm.company}
                  onChange={e => setEditForm(f => f ? { ...f, company: e.target.value } : f)}/>
              </EditField>
              <EditField label="Contact Name">
                <input className="input" value={editForm.name}
                  onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)}/>
              </EditField>
              <EditField label="Phone">
                <input className="input" value={editForm.phone} type="tel"
                  onChange={e => setEditForm(f => f ? { ...f, phone: e.target.value } : f)}/>
              </EditField>
              <EditField label="Email">
                <input className="input" value={editForm.email} type="email"
                  onChange={e => setEditForm(f => f ? { ...f, email: e.target.value } : f)}/>
              </EditField>
              <EditField label="Trade">
                <select className="input"
                  value={editForm.trade} onChange={e => setEditForm(f => f ? { ...f, trade: e.target.value } : f)}>
                  {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </EditField>
              <EditField label="Notes">
                <textarea className="input" rows={2} value={editForm.notes}
                  onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)}/>
              </EditField>
            </div>
            <button onClick={handleEditSave} disabled={editSaving}
              className="w-full mt-4 py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-60">
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
