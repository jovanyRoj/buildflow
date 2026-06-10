'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useBuildFlowStore } from '@/lib/store'
import { ProjectStatusBadge, TaskStatusBadge } from '@/components/ui/StatusBadge'
import TopBar from '@/components/ui/TopBar'
import BottomNav from '@/components/ui/BottomNav'
import { useAuthGuard } from '@/lib/useAuthGuard'

function Spinner() {
  return <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/></div>
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { getProject, deleteProject } = useBuildFlowStore()
  const { ready } = useAuthGuard()
  const project = getProject(params.id as string)
  const [showDelete, setShowDelete] = useState(false)

  if (!ready) return <Spinner />

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-gray-400">
          <p>Project not found</p>
          <Link href="/projects" className="text-blue-600 text-sm mt-2 block">Back to Projects</Link>
        </div>
      </div>
    )
  }

  const active    = project.tasks.filter(t => t.status === 'active').length
  const delayed   = project.tasks.filter(t => t.status === 'delayed').length
  const completed = project.tasks.filter(t => t.status === 'completed').length

  return (
    <div className="pb-24">
      <TopBar
        title={project.name}
        backHref="/projects"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/projects/${project.id}/contractors`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-xl">
              👷 Subs
            </Link>
            <Link href={`/projects/${project.id}/timeline`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl">
              <svg width="13" height="13" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><line x1="17" y1="12" x2="3" y2="12"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
              Timeline
            </Link>
            <button onClick={() => setShowDelete(true)} className="p-1.5 text-gray-400 hover:text-red-500 transition">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        }
      />

      <div className="bg-[#1A2B4A] px-5 py-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-white/60 text-xs flex items-center gap-1">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {project.address}
          </p>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-white/70 text-xs">Overall Progress</span>
          <span className="text-white font-bold text-sm">{project.progressPercentage}%</span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${project.status === 'delayed' ? 'bg-red-400' : project.status === 'completed' ? 'bg-green-400' : 'bg-blue-400'}`}
            style={{ width: `${project.progressPercentage}%` }} />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-white/60">
          <span>Start: {format(parseISO(project.startDate), 'MMM d, yyyy')}</span>
          <span>Est. Close: {format(parseISO(project.estimatedEndDate), 'MMM d, yyyy')}</span>
        </div>
      </div>

      <div className="px-4 py-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Total',   value: project.tasks.length, color: 'text-gray-700' },
          { label: 'Active',  value: active,    color: 'text-blue-600' },
          { label: 'Delayed', value: delayed,   color: 'text-red-500' },
          { label: 'Done',    value: completed, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="px-4">
        <h2 className="text-sm font-bold text-[#1A2B4A] mb-3">Tasks</h2>
        <div className="card divide-y divide-gray-50">
          {project.tasks.map(task => (
            <Link key={task.id} href={`/projects/${project.id}/tasks/${task.id}`}>
              <div className="px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition">
                <span className="text-gray-300 text-xs w-5 text-right flex-shrink-0">{task.order}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A2B4A] truncate">{task.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(parseISO(task.startDate), 'MMM d')} → {format(parseISO(task.endDate), 'MMM d')}
                    {task.assignedTo && <span className="ml-2 text-gray-300">· {task.assignedTo}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.delayDays > 0 && <span className="text-xs text-red-500 font-medium">+{task.delayDays}d</span>}
                  <TaskStatusBadge status={task.status} />
                  <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {project.history.length > 0 && (
        <div className="px-4 mt-5">
          <h2 className="text-sm font-bold text-[#1A2B4A] mb-3">Recent History</h2>
          <div className="card divide-y divide-gray-50">
            {[...project.history].reverse().slice(0, 8).map(h => (
              <div key={h.id} className="px-4 py-3">
                <p className="text-xs text-gray-700">{h.description}</p>
                {h.previousValue && h.newValue && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="line-through">{h.previousValue}</span><span className="mx-1">→</span>
                    <span className="text-blue-600">{h.newValue}</span>
                  </p>
                )}
                <p className="text-xs text-gray-300 mt-0.5">{format(parseISO(h.timestamp), 'MMM d, h:mm a')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6" onClick={() => setShowDelete(false)}>
          <div className="card w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1A2B4A] mb-2">Delete Project?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600" onClick={() => setShowDelete(false)}>Cancel</button>
              <button className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold"
                onClick={() => { deleteProject(project.id); router.push('/projects') }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
