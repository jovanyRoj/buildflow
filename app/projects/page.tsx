'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import CreateProjectModal from '@/components/dashboard/CreateProjectModal'
import { useAuthGuard } from '@/lib/useAuthGuard'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
}

export default function ProjectsPage() {
  const { projects } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const [showCreate, setShowCreate] = useState(false)

  if (!ready) return <Spinner />

  return (
    <div className="pb-24">
      <TopBar
        title="Projects"
        backHref="/dashboard"
        action={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-xl">
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            New
          </button>
        }
      />

      <div className="px-4 py-4 flex flex-col gap-3">
        {projects.length === 0 ? (
          <div className="card p-8 flex flex-col items-center text-center mt-8">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <svg width="28" height="28" fill="none" stroke="#2E7CF6" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M2 7l10-5 10 5v10l-10 5-10-5V7z"/></svg>
            </div>
            <h3 className="font-semibold text-[#1A2B4A] mb-1">No projects yet</h3>
            <p className="text-gray-400 text-sm mb-4">Tap "New" to create your first project</p>
          </div>
        ) : (
          projects.map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <div className="card p-4 hover:shadow-md transition active:scale-[0.99]">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-2">
                    <h3 className="font-semibold text-[#1A2B4A] truncate">{p.name}</h3>
                    <p className="text-gray-400 text-xs truncate mt-0.5">
                      <svg className="inline w-3 h-3 mr-1 -mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {p.address}
                    </p>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Overall progress</span>
                    <span className="text-xs font-bold text-[#1A2B4A]">{p.progressPercentage}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${p.status === 'delayed' ? 'bg-red-500' : p.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${p.progressPercentage}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <span>Start: {format(parseISO(p.startDate), 'MMM d, yyyy')}</span>
                  <span>Close: {format(parseISO(p.estimatedEndDate), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      <BottomNav />
    </div>
  )
}
