'use client'
import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Project, Task, HistoryEntry, AppNotification, InspectionStatus } from './types'
import { generateTasks } from './taskDefaults'
import { rescheduleFromTask, calculateProgress, deriveProjectStatus } from './scheduleEngine'
import { Session, getSession, saveSession, clearSession } from './auth'
import {
  upsertUser, loadProjects, saveProject, deleteProject as dbDeleteProject,
  saveTasks, saveTask, addHistory, addNotifications,
  markNotifRead, markAllNotifsRead, saveSubcontractor,
} from './db'

interface BuildFlowStore {
  projects: Project[]
  currentUser: Session | null
  loading: boolean

  // Auth
  setCurrentUser: (user: Session | null) => void
  logout: () => void
  initSession: () => Promise<void>

  // Projects
  createProject: (data: { name: string; address: string; projectType: Project['projectType']; startDate: string }) => Promise<Project>
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'address' | 'estimatedEndDate' | 'status'>>) => void
  deleteProject: (id: string) => Promise<void>
  getProject: (id: string) => Project | undefined
  refreshProjects: () => Promise<void>

  // Tasks
  updateTask: (projectId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'status' | 'startDate' | 'endDate' | 'notes' | 'assignedTo' | 'subcontractorPhone' | 'inspectionStatus' | 'inspectionNotes'>>) => void

  // Notifications
  markNotificationRead: (projectId: string, notifId: string) => void
  markAllNotificationsRead: (projectId: string) => void
  getAllNotifications: () => AppNotification[]
  getUnreadCount: () => number
}

export const useBuildFlowStore = create<BuildFlowStore>()((set, get) => ({
  projects: [],
  currentUser: null,
  loading: true,

  initSession: async () => {
    const session = getSession()
    if (!session) { set({ loading: false }); return }
    set({ currentUser: session, loading: true })
    // Ensure user exists in DB
    await upsertUser(session)
    const projects = await loadProjects(session.id)
    set({ projects, loading: false })
  },

  setCurrentUser: async (user) => {
    if (user) {
      saveSession(user)
      // Upsert user in Supabase
      await upsertUser(user)
      const projects = await loadProjects(user.id)
      set({ currentUser: user, projects, loading: false })
    } else {
      clearSession()
      set({ currentUser: null, projects: [], loading: false })
    }
  },

  logout: () => {
    clearSession()
    set({ currentUser: null, projects: [] })
  },

  refreshProjects: async () => {
    const { currentUser } = get()
    if (!currentUser) return
    const projects = await loadProjects(currentUser.id)
    set({ projects })
  },

  createProject: async (data) => {
    const { currentUser } = get()
    if (!currentUser) throw new Error('Not logged in')

    const id = uuidv4()
    const tasks = generateTasks(id, data.startDate)
    const lastTask = tasks[tasks.length - 1]

    const project: Project = {
      id,
      name: data.name,
      address: data.address,
      projectType: data.projectType,
      startDate: data.startDate,
      estimatedEndDate: lastTask.endDate,
      status: 'active',
      progressPercentage: 0,
      tasks,
      subcontractors: [],
      history: [{
        id: uuidv4(), projectId: id, type: 'taskAdded',
        description: 'Project created with 22 default tasks',
        timestamp: new Date().toISOString(),
      }],
      notifications: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Save to Supabase
    await saveProject(currentUser.id, project)
    await saveTasks(tasks)
    await addHistory(project.history)

    set(state => ({ projects: [project, ...state.projects] }))
    return project
  },

  updateProject: (id, data) => {
    const { currentUser } = get()
    set(state => {
      const updated = state.projects.map(p =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
      )
      const project = updated.find(p => p.id === id)
      if (project && currentUser) saveProject(currentUser.id, project)
      return { projects: updated }
    })
  },

  deleteProject: async (id) => {
    await dbDeleteProject(id)
    set(state => ({ projects: state.projects.filter(p => p.id !== id) }))
  },

  getProject: (id) => get().projects.find(p => p.id === id),

  updateTask: (projectId, taskId, data) => {
    set(state => {
      const project = state.projects.find(p => p.id === projectId)
      if (!project) return state
      const oldTask = project.tasks.find(t => t.id === taskId)
      if (!oldTask) return state

      const historyEntries: HistoryEntry[] = []
      const newNotifications: AppNotification[] = []

      // Status change
      if (data.status && data.status !== oldTask.status) {
        historyEntries.push({
          id: uuidv4(), projectId, taskId, type: 'statusChange',
          description: `"${oldTask.name}" status: ${oldTask.status} → ${data.status}`,
          previousValue: oldTask.status, newValue: data.status,
          timestamp: new Date().toISOString(),
        })

        if (data.status === 'delayed') {
          newNotifications.push({
            id: uuidv4(), projectId, taskId, type: 'delay',
            title: `${oldTask.name} marked as Delayed`,
            body: 'This may affect downstream tasks. Timeline updated automatically.',
            isRead: false, createdAt: new Date().toISOString(),
          })
        }

        if (data.status === 'completed') {
          newNotifications.push({
            id: uuidv4(), projectId, taskId, type: 'completion',
            title: `${oldTask.name} completed ✅`,
            body: 'Task marked as completed.',
            isRead: false, createdAt: new Date().toISOString(),
          })
          // Auto-cascade SMS to next subcontractors
          const dependents = project.tasks.filter(t =>
            t.dependencies.includes(taskId) && t.subcontractorPhone
          )
          for (const next of dependents) {
            fetch('/api/sms/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'cascade', nextTask: next, project, completedTaskName: oldTask.name }),
            }).catch(() => {})
            newNotifications.push({
              id: uuidv4(), projectId, taskId: next.id, type: 'subcontractor',
              title: `SMS sent → ${next.assignedTo || 'next subcontractor'}`,
              body: `"${next.name}" — notified automatically`,
              isRead: false, createdAt: new Date().toISOString(),
            })
          }
        }
      }

      // Date change
      if (data.endDate && data.endDate !== oldTask.endDate) {
        historyEntries.push({
          id: uuidv4(), projectId, taskId, type: 'dateChange',
          description: `"${oldTask.name}" end date changed`,
          previousValue: oldTask.endDate, newValue: data.endDate,
          timestamp: new Date().toISOString(),
        })
      }

      // Inspection change
      if (data.inspectionStatus && data.inspectionStatus !== oldTask.inspectionStatus) {
        historyEntries.push({
          id: uuidv4(), projectId, taskId, type: 'inspectionUpdate',
          description: `"${oldTask.name}" inspection: ${data.inspectionStatus.toUpperCase()}`,
          previousValue: oldTask.inspectionStatus, newValue: data.inspectionStatus,
          timestamp: new Date().toISOString(),
        })
        newNotifications.push({
          id: uuidv4(), projectId, taskId, type: 'inspection',
          title: `${oldTask.name} — Inspection ${data.inspectionStatus}`,
          body: data.inspectionStatus === 'passed' ? '✅ Passed! Ready for next phase.' : data.inspectionStatus === 'failed' ? '❌ Failed. Review required.' : 'Inspection updated.',
          isRead: false, createdAt: new Date().toISOString(),
        })
      }

      // Apply update
      let updatedTasks = project.tasks.map(t =>
        t.id === taskId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
      )

      // Cascade reschedule
      let cascadeHistory: HistoryEntry[] = []
      let cascadeNotifs: AppNotification[] = []
      if (data.endDate && data.endDate !== oldTask.endDate) {
        const result = rescheduleFromTask(updatedTasks, taskId)
        updatedTasks = result.updatedTasks
        cascadeHistory = result.historyEntries
        cascadeNotifs = result.notifications
        if (cascadeNotifs.length > 0) {
          cascadeNotifs = [{
            id: uuidv4(), projectId, type: 'alert',
            title: `${project.name} timeline updated`,
            body: `${cascadeNotifs.length} task(s) rescheduled automatically.`,
            isRead: false, createdAt: new Date().toISOString(),
          }, ...cascadeNotifs]
        }
      }

      const allHistory = [...historyEntries, ...cascadeHistory]
      const allNotifs = [...newNotifications, ...cascadeNotifs]

      const updatedProject: Project = {
        ...project,
        tasks: updatedTasks,
        progressPercentage: calculateProgress(updatedTasks),
        status: deriveProjectStatus(updatedTasks),
        estimatedEndDate: updatedTasks[updatedTasks.length - 1].endDate,
        history: [...project.history, ...allHistory],
        notifications: [...allNotifs, ...project.notifications],
        updatedAt: new Date().toISOString(),
      }

      // Persist to Supabase async
      const changedTasks = updatedTasks.filter(t =>
        t.id === taskId || cascadeHistory.some(h => h.taskId === t.id)
      )
      saveTasks(changedTasks)
      saveProject(get().currentUser!.id, updatedProject)
      if (allHistory.length) addHistory(allHistory)
      if (allNotifs.length) addNotifications(allNotifs)

      return {
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
      }
    })
  },

  markNotificationRead: (projectId, notifId) => {
    markNotifRead(notifId)
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId
          ? { ...p, notifications: p.notifications.map(n => n.id === notifId ? { ...n, isRead: true } : n) }
          : p
      ),
    }))
  },

  markAllNotificationsRead: (projectId) => {
    markAllNotifsRead(projectId)
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId
          ? { ...p, notifications: p.notifications.map(n => ({ ...n, isRead: true })) }
          : p
      ),
    }))
  },

  getAllNotifications: () =>
    get().projects.flatMap(p => p.notifications)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

  getUnreadCount: () =>
    get().projects.reduce((sum, p) => sum + p.notifications.filter(n => !n.isRead).length, 0),
}))
