'use client'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { NotificationType } from '@/lib/types'
import { useAuthGuard } from '@/lib/useAuthGuard'

const NOTIF_ICONS: Record<NotificationType, { icon: string; bg: string; text: string }> = {
  delay:          { icon: '⚠️', bg: 'bg-red-50',     text: 'text-red-600' },
  reschedule:     { icon: '📅', bg: 'bg-amber-50',   text: 'text-amber-700' },
  completion:     { icon: '✅', bg: 'bg-green-50',   text: 'text-green-700' },
  alert:          { icon: '🔔', bg: 'bg-blue-50',    text: 'text-blue-700' },
  inspection:     { icon: '🏛️', bg: 'bg-purple-50',  text: 'text-purple-700' },
  subcontractor:  { icon: '👷', bg: 'bg-orange-50',  text: 'text-orange-700' },
}

export default function NotificationsPage() {
  const router = useRouter()
  const { projects, getAllNotifications, markNotificationRead, markAllNotificationsRead } = useBuildFlowStore()
  const { ready } = useAuthGuard()

  if (!ready) return <Spinner />

  const all = getAllNotifications()
  const unread = all.filter(n => !n.isRead).length

  function handleNotifPress(projectId: string, notifId: string, taskId?: string) {
    markNotificationRead(projectId, notifId)
    if (taskId) {
      router.push(`/projects/${projectId}/tasks/${taskId}`)
    } else {
      router.push(`/projects/${projectId}`)
    }
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Notifications"
        backHref="/dashboard"
        action={
          unread > 0 ? (
            <button onClick={() => projects.forEach(p => markAllNotificationsRead(p.id))}
              className="text-xs font-semibold text-blue-600">
              Mark all read
            </button>
          ) : undefined
        }
      />

      {all.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-3xl">🔔</div>
          <h3 className="font-semibold text-[#1A2B4A] mb-1">All caught up</h3>
          <p className="text-gray-400 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="px-4 py-4 flex flex-col gap-2">
          {unread > 0 && <p className="text-xs font-semibold text-gray-500 px-1 mb-1">{unread} unread</p>}
          {all.map(notif => {
            const style = NOTIF_ICONS[notif.type]
            const project = projects.find(p => p.id === notif.projectId)
            const task = project?.tasks.find(t => t.id === notif.taskId)
            return (
              <div key={notif.id}
                className={`card p-4 transition cursor-pointer active:scale-[0.99] ${!notif.isRead ? 'border-l-4 border-blue-500' : ''}`}
                onClick={() => handleNotifPress(notif.projectId, notif.id, notif.taskId)}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bg} text-xl`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${notif.isRead ? 'text-gray-600' : 'text-[#1A2B4A]'}`}>{notif.title}</p>
                      {!notif.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"/>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-400 font-medium">{project?.name ?? ''}</span>
                      {task && (
                        <>
                          <span className="text-gray-200 text-xs">·</span>
                          <span className="text-xs text-blue-500 truncate max-w-[140px]">{task.name}</span>
                        </>
                      )}
                      <span className="text-gray-200 text-xs">·</span>
                      <span className="text-xs text-gray-400">{format(parseISO(notif.createdAt), 'MMM d, h:mm a')}</span>
                    </div>
                    {/* Tap hint */}
                    <p className="text-xs text-blue-400 mt-1.5 flex items-center gap-1">
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
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

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}
