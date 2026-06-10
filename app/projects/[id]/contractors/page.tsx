'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useBuildFlowStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'
import { TRADES, getTradeLabel } from '@/lib/tradeMapping'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
  </div>
}

const TRADE_COLORS: Record<string, string> = {
  electrical: 'bg-yellow-100 text-yellow-800',
  plumbing:   'bg-blue-100 text-blue-800',
  hvac:       'bg-cyan-100 text-cyan-800',
  framing:    'bg-orange-100 text-orange-800',
  concrete:   'bg-stone-100 text-stone-700',
  roofing:    'bg-red-100 text-red-700',
  drywall:    'bg-gray-100 text-gray-700',
  paint:      'bg-purple-100 text-purple-700',
  flooring:   'bg-amber-100 text-amber-800',
  general:    'bg-green-100 text-green-700',
}

export default function ContractorsPage() {
  const { id } = useParams() as { id: string }
  const { getProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(id)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${id}`
    : `https://buildflow.vercel.app/join/${id}`

  useEffect(() => {
    if (!project) return
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(joinUrl, {
        width: 300, margin: 2,
        color: { dark: '#1A2B4A', light: '#FFFFFF' }
      }).then(setQrDataUrl)
    })
  }, [project, joinUrl])

  if (!ready) return <Spinner />
  if (!project) return <Spinner />

  const contractors = (project as any).subcontractors ?? []

  // Group tasks by trade for the "assigned" view
  const tradeTaskMap: Record<string, string[]> = {}
  project.tasks.forEach(t => {
    if (t.assignedTo && t.subcontractorPhone) {
      const key = `${t.assignedTo}|${t.subcontractorPhone}`
      if (!tradeTaskMap[key]) tradeTaskMap[key] = []
      tradeTaskMap[key].push(t.name)
    }
  })

  function handleCopy() {
    navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleNotify(contractor: any) {
    setSending(contractor.id)
    // Find their assigned tasks and send status update
    const assignedTasks = project!.tasks.filter(
      t => t.subcontractorPhone === contractor.phone
    )
    const nextTask = assignedTasks.find(t => t.status === 'pending' || t.status === 'active')
    if (nextTask) {
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'task_assigned',
          task: nextTask,
          project,
          builderName: 'Builder',
        }),
      })
    }
    setSending(null)
    setSent(contractor.id)
    setTimeout(() => setSent(null), 3000)
  }

  return (
    <div className="pb-24">
      <TopBar title="Subcontractors" backHref={`/projects/${id}`} />

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* QR + Link */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔗</span>
            <p className="text-sm font-bold text-[#1A2B4A]">Invite Subcontractors</p>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Share this link or QR — contractors register their company and trade area. No app needed.
          </p>

          {/* QR Code */}
          {qrDataUrl && (
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48"/>
              </div>
            </div>
          )}

          {/* Link */}
          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <p className="text-xs text-gray-400 mb-1">Registration Link</p>
            <p className="text-xs text-[#1A2B4A] font-mono break-all">{joinUrl}</p>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCopy}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                copied ? 'bg-green-500 text-white' : 'bg-[#1A2B4A] text-white'
              }`}>
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            <button onClick={() => {
              if (navigator.share) navigator.share({ title: `Join ${project.name}`, url: joinUrl })
            }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-[0.98]">
              📤 Share
            </button>
          </div>
        </div>

        {/* Registered Contractors */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#1A2B4A]">
              Registered ({contractors.length})
            </h2>
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
              {contractors.map((c: any) => {
                const assignedTasks = project.tasks.filter(t => t.subcontractorPhone === c.phone)
                const completedCount = assignedTasks.filter(t => t.status === 'completed').length
                const activeTask = assignedTasks.find(t => t.status === 'active' || t.status === 'in_progress')
                const tradeColor = TRADE_COLORS[c.trade] ?? 'bg-gray-100 text-gray-700'

                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-[#1A2B4A] text-sm">{c.company || c.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tradeColor}`}>
                            {getTradeLabel(c.trade).split(' /')[0]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{c.name} · {c.phone}</p>
                      </div>
                    </div>

                    {/* Task progress */}
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

                    {/* Task chips */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {assignedTasks.slice(0, 4).map(t => (
                        <span key={t.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.status === 'completed' ? 'bg-green-100 text-green-700' :
                          t.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                          t.status === 'delayed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{t.name}</span>
                      ))}
                      {assignedTasks.length > 4 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{assignedTasks.length - 4} more</span>
                      )}
                    </div>

                    <button onClick={() => handleNotify(c)} disabled={sending === c.id}
                      className={`w-full py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                        sent === c.id ? 'bg-green-500 text-white' :
                        'bg-[#1A2B4A] text-white hover:bg-blue-900'
                      } disabled:opacity-60`}>
                      {sending === c.id ? 'Sending...' : sent === c.id ? '✅ SMS Sent!' : '📱 Send SMS Update'}
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
              const covered = contractors.some((c: any) => c.trade === trade.value)
              return (
                <div key={trade.value} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{trade.label.split(' /')[0]}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    covered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {covered ? '✓ Assigned' : 'Pending'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
