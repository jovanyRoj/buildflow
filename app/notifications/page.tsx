'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { useBrivoxStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'

// ─── icon map (extensible — no crash on unknown types) ────────────────────────
const NOTIF_ICONS: Record<string, { icon: string; bg: string; text: string }> = {
  delay:          { icon: '⚠️', bg: 'bg-red-50',     text: 'text-red-600' },
  reschedule:     { icon: '📅', bg: 'bg-amber-50',   text: 'text-amber-700' },
  completion:     { icon: '✅', bg: 'bg-green-50',   text: 'text-green-700' },
  alert:          { icon: '🔔', bg: 'bg-blue-50',    text: 'text-blue-700' },
  inspection:     { icon: '🏛️', bg: 'bg-purple-50',  text: 'text-purple-700' },
  subcontractor:  { icon: '👷', bg: 'bg-orange-50',  text: 'text-orange-700' },
  budget_agreed:  { icon: '💰', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  estimate:       { icon: '📋', bg: 'bg-sky-50',     text: 'text-sky-700' },
  message:        { icon: '💬', bg: 'bg-blue-50',    text: 'text-blue-700' },
  sync:           { icon: '🔄', bg: 'bg-indigo-50',  text: 'text-indigo-700' },
}
const FALLBACK_STYLE = { icon: '🔔', bg: 'bg-gray-50', text: 'text-gray-600' }

// ─── unified notification shape ───────────────────────────────────────────────
interface UNotif {
  id: string
  projectId: string
  projectName: string
  type: string
  title: string
  body: string
  isRead: boolean
  createdAt: string
  taskId?: string
  source: 'db' | 'local'
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

export default function NotificationsPage() {
  const router = useRouter()
  const { ready, user } = useAuthGuard()
  const { projects, getAllNotifications, markNotificationRead, markAllNotificationsRead } = useBrivoxStore()

  const [dbNotifs, setDbNotifs] = useState<UNotif[]>([])
  const [loading, setLoading]   = useState(true)
  const [readIds, setReadIds]   = useState<Set<string>>(new Set())

  // ── fetch DB notifications ──────────────────────────────────────────────────
  const loadNotifs = useCallback(() => {
    if (!user?.id) return
    fetch(`/api/builder/notifications?userId=${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.notifications)) setDbNotifs(d.notifications)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => { loadNotifs() }, [loadNotifs])

  if (!ready || loading) return <Spinner />

  // ── local notifications from Zustand ───────────────────────────────────────
  const localRaw = getAllNotifications()
  const localNotifs: UNotif[] = localRaw.map(n => {
    const project = projects.find(p => p.id === n.projectId)
    return {
      id:          n.id,
      projectId:   n.projectId,
      projectName: project?.name ?? '',
      type:        n.type,
      title:       n.title,
      body:        n.body,
      isRead:      n.isRead,
      createdAt:   n.createdAt,
      taskId:      n.taskId,
      source:      'local' as const,
    }
  })

  // ── merge: DB first, then local not already in DB ─────────────────────────
  const dbIds = new Set(dbNotifs.map(n => n.id))
  const merged: UNotif[] = [
    ...dbNotifs.map(n => ({ ...n, isRead: n.isRead || readIds.has(n.id) })),
    ...localNotifs.filter(n => !dbIds.has(n.id)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const unread = merged.filter(n => !n.isRead).length

  // ── mark single read ───────────────────────────────────────────────────────
  function handlePress(notif: UNotif) {
    if (notif.source === 'local') {
      markNotificationRead(notif.projectId, notif.id)
    } else {
      setReadIds(prev => new Set([...prev, notif.id]))
      fetch('/api/builder/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notif.id }),
      }).catch(() => {})
    }
    if (notif.taskId) {
      router.push(`/projects/${notif.projectId}/tasks/${notif.taskId}`)
    } else {
      router.push(`/projects/${notif.projectId}`)
    }
  }

  // ── mark all read ──────────────────────────────────────────────────────────
  function markAllRead() {
    projects.forEach(p => markAllNotificationsRead(p.id))
    const unreadIds = dbNotifs.filter(n => !n.isRead).map(n => n.id)
    setReadIds(prev => new Set([...prev, ...unreadIds]))
    const projectIds = [...new Set(dbNotifs.map(n => n.projectId))]
    if (projectIds.length) {
      fetch('/api/builder/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true, projectIds }),
      }).catch(() => {})
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Notifications"
        backHref="/dashboard"
        action={
          unread > 0 ? (
            <button onClick={markAllRead} className="text-xs font-semibold text-blue-600">
              Mark all read
            </button>
          ) : undefined
        }
      />

      {merged.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">🔔</div>
          <h3 className="font-semibold text-[#1A2B4A] mb-1">All caught up</h3>
          <p className="text-gray-400 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="px-4 py-4 flex flex-col gap-2">
          {unread > 0 && (
            <p className="text-xs font-semibold text-gray-500 px-1 mb-1">{unread} unread</p>
          )}
          {merged.map(notif => {
            const style  = NOTIF_ICONS[notif.type] ?? FALLBACK_STYLE
            const isRead = notif.isRead
            return (
              <div
                key={notif.id}
                className={`card p-4 transition cursor-pointer active:scale-[0.99] ${!isRead ? 'border-l-4 border-blue-500' : ''}`}
                onClick={() => handlePress(notif)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bg} text-xl`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${isRead ? 'text-gray-600' : 'text-[#1A2B4A]'}`}>
                        {notif.title}
                      </p>
                      {!isRead && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"/>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {notif.projectName && (
                        <span className="text-xs text-gray-400 font-medium">{notif.projectName}</span>
                      )}
                      <span className="text-gray-200 text-xs">·</span>
                      <span className="text-xs text-gray-400">
                        {format(parseISO(notif.createdAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-xs text-blue-400 mt-1.5 flex items-center gap-1">
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                      {notif.taskId ? 'View task details' : 'View project'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <BottomNav />
    </div>
  )
}
