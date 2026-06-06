'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isPast } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import BottomNav from '@/components/ui/BottomNav'
import { useHydrated } from '@/lib/useHydrated'

export default function DashboardPage() {
  const { currentUser, projects, logout } = useBuildFlowStore()
  const router = useRouter()
  const hydrated = useHydrated()

  useEffect(() => {
    if (hydrated && !currentUser) router.replace('/login')
  }, [hydrated, currentUser])

  if (!hydrated || !currentUser) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const active = projects.filter(p => p.status === 'active')
  const delayed = projects.filter(p => p.status === 'delayed')
  const completed = projects.filter(p => p.status === 'completed')
  const total = projects.length

  const upcomingTasks = projects
    .flatMap(p => p.tasks.map(t => ({ ...t, projectName: p.name, projectId: p.id })))
    .filter(t => t.status === 'active' || t.status === 'pending')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5)

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-[#1A2B4A] px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-white/60 text-sm">Good morning,</p>
            <h1 className="text-white text-xl font-bold">{currentUser.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/notifications" className="relative p-2 bg-white/10 rounded-xl">
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </Link>
            <button
              onClick={() => { logout(); router.push('/login') }}
              className="p-2 bg-white/10 rounded-xl"
            >
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <p className="text-white/50 text-xs mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats */}
      <div className="px-4 -mt-3">
        <div className="card p-4 grid grid-cols-3 gap-2">
          <StatCard label="Active" value={active.length} color="text-blue-600" />
          <StatCard label="Delayed" value={delayed.length} color="text-red-500" />
          <StatCard label="Completed" value={completed.length} color="text-green-600" />
        </div>
      </div>

      {/* Alerts */}
      {delayed.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-3">
            <svg className="flex-shrink-0 mt-0.5" width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <p className="text-red-700 text-sm font-semibold">{delayed.length} project{delayed.length > 1 ? 's' : ''} delayed</p>
              <p className="text-red-600 text-xs mt-0.5">{delayed.map(p => p.name).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Projects */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[#1A2B4A]">Projects</h2>
          <Link href="/projects" className="text-xs font-semibold text-blue-600">See all</Link>
        </div>

        {projects.length === 0 ? (
          <EmptyState onNew={() => router.push('/projects')} />
        ) : (
          <div className="flex flex-col gap-3">
            {projects.slice(0, 4).map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <div className="card p-4 hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[#1A2B4A] text-sm truncate">{p.name}</h3>
                      <p className="text-gray-400 text-xs truncate mt-0.5">{p.address}</p>
                    </div>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Progress</span>
                      <span className="text-xs font-semibold text-[#1A2B4A]">{p.progressPercentage}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${p.status === 'delayed' ? 'bg-red-500' : p.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${p.progressPercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                    <span>Est. close: {format(parseISO(p.estimatedEndDate), 'MMM d, yyyy')}</span>
                    <span>{p.tasks.filter(t => t.status === 'completed').length}/{p.tasks.length} tasks</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Tasks */}
      {upcomingTasks.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-base font-bold text-[#1A2B4A] mb-3">Upcoming Tasks</h2>
          <div className="card divide-y divide-gray-50">
            {upcomingTasks.map(t => (
              <Link key={t.id} href={`/projects/${t.projectId}`}>
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A2B4A] truncate">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.projectName}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{format(parseISO(t.startDate), 'MMM d')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center py-1">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
        <svg width="28" height="28" fill="none" stroke="#2E7CF6" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M2 7l10-5 10 5v10l-10 5-10-5V7z"/>
        </svg>
      </div>
      <h3 className="font-semibold text-[#1A2B4A] mb-1">No projects yet</h3>
      <p className="text-gray-400 text-sm mb-4">Create your first construction project</p>
      <button onClick={onNew} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl">
        + New Project
      </button>
    </div>
  )
}
