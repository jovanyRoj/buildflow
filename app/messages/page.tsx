'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'

// ─── types ────────────────────────────────────────────────────────────────────
interface Msg {
  id: string
  sender: 'sub' | 'korvia'
  senderName: string
  content: string
  createdAt: string
  type: 'message' | 'report'
  urgency: string | null
}
interface ProjectThread {
  id: string
  name: string
  bgColor: string
  status: string
  messages: Msg[]
  subCount: number
}

const URGENCY_STYLE: Record<string, string> = {
  emergency: 'bg-red-600 text-white',
  urgent:    'bg-red-100 text-red-700',
  normal:    'bg-yellow-50 text-yellow-700',
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { ready, user } = useAuthGuard()
  const [threads, setThreads]       = useState<ProjectThread[]>([])
  const [loading, setLoading]       = useState(true)
  const [openProject, setOpenProject] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/builder/messages?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.projects) setThreads(d.projects) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.id])

  if (!ready || loading) return <Spinner />

  const selected = threads.find(t => t.id === openProject) ?? null

  return (
    <div className="pb-24">
      <TopBar
        title={selected ? selected.name : 'Messages'}
        backHref={selected ? undefined : '/dashboard'}
        onBack={selected ? () => setOpenProject(null) : undefined}
      />

      {/* ── Project list ─────────────────────────────────────────────────── */}
      {!selected && (
        <div className="px-4 py-4 flex flex-col gap-3">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center text-center py-16 gap-3">
              <span className="text-5xl">🤖</span>
              <p className="text-[#1A2B4A] font-semibold">No messages yet</p>
              <p className="text-gray-400 text-sm max-w-[240px]">
                When your subs send messages or reports via their portal link, they'll appear here organized by project.
              </p>
            </div>
          ) : (
            threads.map(t => {
              const lastMsg = t.messages[t.messages.length - 1]
              const hasEmergency = t.messages.some(m => m.urgency === 'emergency')
              const hasUrgent    = t.messages.some(m => m.urgency === 'urgent')
              return (
                <button key={t.id} onClick={() => setOpenProject(t.id)}
                  className="w-full text-left bg-white rounded-2xl shadow-sm overflow-hidden active:scale-[0.99] transition">
                  <div className="h-1.5 w-full" style={{ backgroundColor: t.bgColor }} />
                  <div className="px-4 py-3 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: t.bgColor + '22' }}>
                      <span className="text-lg">🏗️</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-bold text-[#1A2B4A] text-sm truncate">{t.name}</p>
                        <div className="flex gap-1 shrink-0">
                          {hasEmergency && (
                            <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5">🆘</span>
                          )}
                          {hasUrgent && !hasEmergency && (
                            <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">🔴</span>
                          )}
                          {t.messages.length > 0 && (
                            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">
                              {t.messages.length}
                            </span>
                          )}
                        </div>
                      </div>
                      {lastMsg ? (
                        <>
                          <p className="text-xs text-gray-500 truncate">
                            <span className="font-medium text-gray-600">{lastMsg.senderName}:</span> {lastMsg.content}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {format(parseISO(lastMsg.createdAt), 'MMM d, h:mm a')}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">No messages yet</p>
                      )}
                    </div>
                    <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="2" viewBox="0 0 24 24" className="mt-1 shrink-0">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* ── Thread view ──────────────────────────────────────────────────── */}
      {selected && (
        <div className="flex flex-col">
          {/* Project label */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selected.bgColor }} />
            <span className="text-xs text-gray-500 font-medium">{selected.status?.replace('_', ' ') ?? 'Active'}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-500">{selected.messages.length} message{selected.messages.length !== 1 ? 's' : ''}</span>
          </div>

          {selected.messages.length === 0 ? (
            <div className="flex flex-col items-center text-center py-16 gap-3 px-4">
              <span className="text-4xl">🤖</span>
              <p className="text-[#1A2B4A] font-semibold">No messages for this project</p>
              <p className="text-gray-400 text-sm">When subs send messages or reports via their portal, they'll appear here.</p>
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col gap-3 pb-24">
              {selected.messages.map(msg => {
                const isKorvia = msg.sender === 'korvia'
                const isReport = msg.type === 'report'
                return (
                  <div key={msg.id} className={`flex gap-2 ${isKorvia ? 'flex-row' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                      isKorvia ? 'bg-[#1A2B4A] text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {isKorvia ? '🤖' : msg.senderName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 max-w-[82%]">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-bold text-[#1A2B4A]">{msg.senderName}</span>
                        {isReport && (
                          <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                            URGENCY_STYLE[msg.urgency ?? 'normal'] ?? URGENCY_STYLE.normal
                          }`}>
                            {msg.urgency === 'emergency' ? '🆘 EMERGENCY' : msg.urgency === 'urgent' ? '🔴 URGENT' : '⚠️ REPORT'}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 ml-auto">
                          {format(parseISO(msg.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        isKorvia
                          ? 'bg-[#1A2B4A] text-white rounded-tl-sm'
                          : isReport
                            ? 'bg-red-50 border border-red-200 text-red-800 rounded-tl-sm'
                            : 'bg-white shadow-sm text-[#1A2B4A] rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
