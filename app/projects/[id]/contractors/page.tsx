'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { TRADES, getTradeLabel } from '@/lib/tradeMapping'

type Sub = {
  id: string; name: string; company: string; phone: string;
  trade: string; email: string; notes: string
}

type CrossSub = Sub & {
  projectId: string; projectName: string; alreadyHere: boolean
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
  const { getProject, refreshProjects, updateTask, currentUser } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(id)

  const [activeTab, setActiveTab] = useState<'subs' | 'tasks'>('subs')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [editSub, setEditSub] = useState<Sub | null>(null)
  const [editForm, setEditForm] = useState<Sub | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Assign sub to task
  const [assignTask, setAssignTask] = useState<any | null>(null)
  const [assignSub, setAssignSub]   = useState('')
  const [assigning, setAssigning]   = useState(false)

  // Import sub from another project
  const [showImport, setShowImport]         = useState(false)
  const [crossSubs, setCrossSubs]           = useState<CrossSub[]>([])
  const [loadingCross, setLoadingCross]     = useState(false)
  const [importingSub, setImportingSub]     = useState<string | null>(null)
  const [importedSubs, setImportedSubs]     = useState<Set<string>>(new Set())

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

  function getTaskSub(task: any): Sub | undefined {
    return contractors.find((c: Sub) =>
      (task.assignedTo && c.company?.toLowerCase().trim() === task.assignedTo?.toLowerCase().trim()) ||
      (task.subcontractorPhone && c.phone === task.subcontractorPhone)
    )
  }

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

  function openEdit(c: Sub) { setEditSub(c); setEditForm({ ...c }) }

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
    if (!confirm('Remove this subcontractor from this project?')) return
    setDeleting(subId)
    await fetch(`/api/join/${id}?subId=${subId}`, { method: 'DELETE' })
    await refreshProjects()
    setDeleting(null)
  }

  async function handleAssignSub() {
    if (!assignTask || !assignSub) return
    const sub = contractors.find(c => c.id === assignSub)
    if (!sub) return
    setAssigning(true)
    updateTask(id, assignTask.id, { assignedTo: sub.company, subcontractorPhone: sub.phone })
    await new Promise(r => setTimeout(r, 800))
    setAssigning(false); setAssignTask(null); setAssignSub('')
  }

  // ── Import from another project ──────────────────────────────────────────

  async function openImportModal() {
    if (!currentUser) return
    setShowImport(true)
    setLoadingCross(true)
    const res = await fetch(`/api/builder/subs?userId=${currentUser.id}&excludeProjectId=${id}`)
    const data = await res.json()
    setCrossSubs(data.subs ?? [])
    setLoadingCross(false)
  }

  async function handleImportSub(sub: CrossSub) {
    setImportingSub(sub.id)
    // Re-use the public join endpoint — creates sub, auto-assigns matching tasks
    await fetch(`/api/join/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: sub.company,
        contactName: sub.name,
        phone: sub.phone,
        email: sub.email,
        trade: sub.trade,
      }),
    })
    setImportedSubs(prev => new Set([...prev, sub.id]))
    setImportingSub(null)
    await refreshProjects()
  }

  // Group cross-subs by project name for the modal
  const crossSubsByProject = crossSubs.reduce<Record<string, CrossSub[]>>((acc, s) => {
    ;(acc[s.projectName] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="pb-24">
      <TopBar title="Subcontractors" backHref={`/projects/${id}`} />

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        {[
          { key: 'subs',  label: `Subs (${contractors.length})`, icon: '👷' },
          { key: 'tasks', label: `Tasks (${project.tasks.length})`, icon: '📋' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-0.5 border-b-2 transition ${
              activeTab === t.key ? 'border-[#2E7CF6] text-[#2E7CF6]' : 'border-transparent text-gray-400'
            }`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">

        {/* ── SUBS TAB ──────────────────────────────────── */}
        {activeTab === 'subs' && (<>
          {/* QR + Link */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <svg width="18" height="18" fill="none" stroke="#2E7CF6" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              <p className="text-sm font-bold text-[#1A2B4A]">Invite Subcontractors</p>
            </div>
            <p className="text-xs text-gray-500 mb-4">Share this link or QR. Contractors register — no app needed.</p>
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
                  const assignedTasks = project.tasks.filter(t =>
                    (t.assignedTo && c.company?.toLowerCase().trim() === t.assignedTo?.toLowerCase().trim()) ||
                    (t.subcontractorPhone && c.phone === t.subcontractorPhone)
                  )
                  const completedCount = assignedTasks.filter(t => t.status === 'completed').length
                  const activeTask = assignedTasks.find(t => t.status === 'active' || t.status === 'in_progress')
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
                            <span className="w-2 h-2 rounded-full bg-green-500" title="Registered"/>
                          </div>
                          <p className="text-xs text-gray-500">{c.name} · {c.phone}</p>
                          {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Link href={`/portal/${id}/${c.id}`} target="_blank"
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition text-blue-600" title="View portal">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </Link>
                          <button onClick={() => openEdit(c)}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition" title="Edit">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition text-red-500 disabled:opacity-50" title="Remove from project">
                            {deleting === c.id
                              ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>
                              : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                            }
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: assignedTasks.length ? `${(completedCount / assignedTasks.length) * 100}%` : '0%' }}/>
                        </div>
                        <span className="text-xs text-gray-400">{completedCount}/{assignedTasks.length} tasks</span>
                      </div>

                      {activeTask && (
                        <div className="mb-2 bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
                          <span className="text-blue-500">🔨</span>
                          <p className="text-xs text-blue-700 font-medium truncate">{activeTask.name}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {assignedTasks.slice(0, 4).map(t => (
                          <Link key={t.id} href={`/projects/${id}/tasks/${t.id}`}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 ${
                              t.status === 'completed' ? 'bg-green-100 text-green-700' :
                              t.status === 'active' || t.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                              t.status === 'delayed'  ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                            }`}>{t.name}</Link>
                        ))}
                        {assignedTasks.length > 4 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{assignedTasks.length - 4} more</span>
                        )}
                        {assignedTasks.length === 0 && (
                          <span className="text-xs text-gray-400 italic">No tasks assigned yet</span>
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

            {/* Import from another project */}
            <button
              onClick={openImportModal}
              className="w-full mt-3 py-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-indigo-50 transition active:scale-[0.98]"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import sub from another project
            </button>
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
                      {covered ? '✓ Registered' : 'Pending'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>)}

        {/* ── TASKS TAB ─────────────────────────────────── */}
        {activeTab === 'tasks' && (<>
          {/* Legend */}
          <div className="flex gap-2 flex-wrap">
            {[
              { color: 'bg-green-500', label: 'Registered sub' },
              { color: 'bg-amber-400', label: 'Assigned, not registered' },
              { color: 'bg-red-400',   label: 'Needs sub' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${l.color}`}/>
                <span className="text-xs text-gray-500">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Summary pills */}
          {(() => {
            const registered  = project.tasks.filter(t => getTaskSub(t))
            const awaitingReg = project.tasks.filter(t => t.assignedTo && !getTaskSub(t))
            const unassigned  = project.tasks.filter(t => !t.assignedTo)
            return (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-2.5 py-1 font-medium">
                  ✅ {registered.length} covered
                </span>
                {awaitingReg.length > 0 && (
                  <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 font-medium">
                    ⏳ {awaitingReg.length} awaiting
                  </span>
                )}
                {unassigned.length > 0 && (
                  <span className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2.5 py-1 font-medium">
                    🔴 {unassigned.length} need sub
                  </span>
                )}
              </div>
            )
          })()}

          {/* Tasks list */}
          <div className="card divide-y divide-gray-50">
            {project.tasks.map(task => {
              const registeredSub = getTaskSub(task)
              return (
                <div key={task.id} className="px-4 py-3.5 flex items-start gap-3">
                  {/* Status dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full block ${
                      registeredSub ? 'bg-green-500' :
                      task.assignedTo ? 'bg-amber-400' : 'bg-red-400'
                    }`}/>
                  </div>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/projects/${id}/tasks/${task.id}`}
                        className="text-sm font-semibold text-[#1A2B4A] hover:text-blue-600 transition truncate flex-1">
                        {task.name}
                      </Link>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        task.status === 'completed' ? 'bg-green-100 text-green-700' :
                        task.status === 'in_progress' || task.status === 'active' ? 'bg-orange-100 text-orange-700' :
                        task.status === 'delayed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                      }`}>{task.status?.replace('_', ' ')}</span>
                    </div>

                    {/* Date range */}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {task.startDate ? format(parseISO(task.startDate), 'MMM d') : '—'} →{' '}
                      {task.endDate ? format(parseISO(task.endDate), 'MMM d') : '—'}
                    </p>

                    {/* Sub assignment */}
                    <div className="mt-1.5">
                      {registeredSub ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-2 py-0.5 font-medium">
                            ✓ {registeredSub.company}
                          </span>
                          <button onClick={() => { setEditSub(registeredSub); setEditForm({ ...registeredSub }) }}
                            className="text-xs text-gray-400 hover:text-blue-600 transition">Edit</button>
                          <Link href={`/portal/${id}/${registeredSub.id}`} target="_blank"
                            className="text-xs text-blue-500 hover:text-blue-700 transition">Portal ↗</Link>
                        </div>
                      ) : task.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                            ⏳ {task.assignedTo} · not registered
                          </span>
                          <button onClick={() => { setAssignTask(task); setAssignSub('') }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium transition">Reassign</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAssignTask(task); setAssignSub('') }}
                          className="inline-flex items-center gap-1 text-xs bg-red-50 border border-red-100 text-red-600 rounded-full px-2 py-0.5 font-medium hover:bg-red-100 transition">
                          + Assign sub
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>)}
      </div>

      <BottomNav />

      {/* ── MODALS ──────────────────────────────────────── */}

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
                <Link href={`/portal/${id}/${editSub.id}`} target="_blank"
                  className="text-xs text-blue-600 font-semibold border border-blue-200 rounded-lg px-2 py-1">
                  Portal ↗
                </Link>
                <button onClick={() => setEditSub(null)} className="text-gray-400 hover:text-gray-600">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Company',      field: 'company', type: 'text' },
                { label: 'Contact Name', field: 'name',    type: 'text' },
                { label: 'Phone',        field: 'phone',   type: 'tel' },
                { label: 'Email',        field: 'email',   type: 'email' },
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

      {/* Assign Sub Modal */}
      {assignTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setAssignTask(null)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#1A2B4A]">Assign Subcontractor</h3>
                <p className="text-xs text-gray-400 mt-0.5">{assignTask.name}</p>
              </div>
              <button onClick={() => setAssignTask(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {contractors.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                <p>No registered subs yet.</p>
                <p className="text-xs mt-1">Share the join link so contractors can register.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {contractors.map((c: Sub) => (
                  <button key={c.id} onClick={() => setAssignSub(c.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition text-left ${
                      assignSub === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-blue-700">{c.company?.charAt(0)?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1A2B4A] truncate">{c.company}</p>
                      <p className="text-xs text-gray-400">{c.trade} · {c.name}</p>
                    </div>
                    {assignSub === c.id && (
                      <svg width="18" height="18" fill="none" stroke="#2E7CF6" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button onClick={handleAssignSub} disabled={!assignSub || assigning}
              className="w-full py-3.5 rounded-2xl bg-[#2E7CF6] text-white font-bold text-sm disabled:opacity-50">
              {assigning ? 'Assigning…' : '✓ Assign to Task'}
            </button>
          </div>
        </div>
      )}

      {/* ── Import Sub from Another Project Modal ── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="font-bold text-[#1A2B4A]">Import Subcontractor</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pick a sub from another project</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {loadingCross ? (
                <div className="flex justify-center py-10">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : crossSubs.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-2xl mb-2">🤷</p>
                  <p className="text-sm">No subs found in other projects</p>
                  <p className="text-xs mt-1">Create more projects or invite subs first</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {Object.entries(crossSubsByProject).map(([projectName, subs]) => (
                    <div key={projectName}>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                        📁 {projectName}
                      </p>
                      <div className="flex flex-col gap-2">
                        {subs.map(sub => {
                          const alreadyImported = importedSubs.has(sub.id) || sub.alreadyHere
                          const isImporting     = importingSub === sub.id
                          const tradeColor      = TRADE_COLORS[sub.trade] ?? 'bg-gray-100 text-gray-700'
                          return (
                            <div key={sub.id}
                              className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                                alreadyImported ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white hover:border-indigo-200'
                              }`}>
                              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-bold text-indigo-700">{sub.company?.charAt(0)?.toUpperCase() ?? '?'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[#1A2B4A] truncate">{sub.company || sub.name}</p>
                                <p className="text-xs text-gray-400">{sub.name} · {sub.phone}</p>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tradeColor}`}>
                                  {getTradeLabel(sub.trade).split(' /')[0]}
                                </span>
                              </div>
                              <button
                                onClick={() => !alreadyImported && handleImportSub(sub)}
                                disabled={alreadyImported || isImporting}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex-shrink-0 ${
                                  alreadyImported
                                    ? 'bg-green-100 text-green-700 cursor-default'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 disabled:opacity-60'
                                }`}
                              >
                                {isImporting
                                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                  : alreadyImported ? '✓ Added' : 'Import'
                                }
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
