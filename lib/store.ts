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

interface BrivoxStore {
  projects: Project[]
  currentUser: Session | null
  loading: boolean

  // Auth
  setCurrentUser: (user: Session | null) => Promise<void>
  logout: () => void
  initSession: () => Promise<void>

  // Projects
  createProject: (data: { name: string; address: string; projectType: Project['projectType']; startDate: string; bgColor?: string }) => Promise<Project>
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'address' | 'estimatedEndDate' | 'status' | 'bgColor'>>) => void
  deleteProject: (id: string) => Promise<void>
  getProject: (id: string) => Project | undefined
  refreshProjects: () => Promise<void>

  // Tasks
  updateTask: (projectId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'status' | 'startDate' | 'endDate' | 'notes' | 'assignedTo' | 'subcontractorPhone' | 'inspectionStatus' | 'inspectionNotes'>>) => void
  addTask: (projectId: string, taskData: { name: string; startDate: string; endDate: string; notes?: string }) => void
  deleteTask: (projectId: string, taskId: string) => void

  // Notifications
  markNotificationRead: (projectId: string, notifId: string) => void
  markAllNotificationsRead: (projectId: string) => void
  getAllNotifications: () => AppNotification[]
  getUnreadCount: () => number
}

export const useBrivoxStore = create<BrivoxStore>()((set, get) => ({
  projects: [],
  currentUser: null,
  loading: true,

  initSession: async () => {
    const session = await getSession()
    if (!session) { set({ loading: false }); return }
    set({ currentUser: session, loading: true })
    await upsertUser(session)
    const projects = await loadProjects(session.id)
    set({ projects, loading: false })
  },

  setCurrentUser: async (user) => {
    if (user) {
      saveSession(user)
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsertUser', user }),
      }).catch(e => console.error('upsertUser api:', e))
      const projects = await loadProjects(user.id)
      set({ currentUser: user, projects, loading: false })
    } else {
      void clearSession()
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
      bgColor: data.bgColor ?? '#1A2B4A',
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

    const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
    await fetch(`${appUrl}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveProject', userId: currentUser.id, project }),
    }).catch(e => console.error('saveProject api:', e))
    await fetch(`${appUrl}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveTasks', tasks }),
    }).catch(e => console.error('saveTasks api:', e))
    await fetch(`${appUrl}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addHistory', entries: project.history }),
    }).catch(e => console.error('addHistory api:', e))

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

      if (data.endDate && data.endDate !== oldTask.endDate) {
        historyEntries.push({
          id: uuidv4(), projectId, taskId, type: 'dateChange',
          description: `"${oldTask.name}" end date changed`,
          previousValue: oldTask.endDate, newValue: data.endDate,
          timestamp: new Date().toISOString(),
        })
      }

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

      let updatedTasks = project.tasks.map(t =>
        t.id === taskId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
      )

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

      const changedTasks = updatedTasks.filter(t =>
        t.id === taskId || cascadeHistory.some(h => h.taskId === t.id)
      )
      saveTasks(changedTasks)
      saveProject(get().currentUser!.id, updatedProject)
      if (allHistory.length) addHistory(allHistory)
      if (allNotifs.length) addNotifications(allNotifs)

      // KORVIA auto-notify: sub assigned to this project for the first time
      const newPhone = data.subcontractorPhone
      const oldPhone = oldTask.subcontractorPhone
      if (newPhone && newPhone !== oldPhone && typeof window !== 'undefined') {
        const updatedTask = updatedTasks.find(t => t.id === taskId)
        fetch('/api/korvia/assign-sub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            projectId,
            subPhone: newPhone,
            subName:  updatedTask?.assignedTo ?? data.assignedTo ?? '',
            taskName: updatedTask?.name ?? oldTask.name,
            projectName: project.name,
          }),
        }).catch(() => {})
      }

      return {
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
      }
    })
  },

  addTask: (projectId, taskData) => {
    set(state => {
      const project = state.projects.find(p => p.id === projectId)
      if (!project) return state
      const id = uuidv4()
      const raw = `${projectId}:${id}:${Date.now()}`
      const portalToken = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const now = new Date().toISOString()
      const startDate = taskData.startDate
      const endDate = taskData.endDate
      const durationDays = Math.max(1, Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      ))
      const newTask: Task = {
        id, projectId, name: taskData.name,
        order: project.tasks.length + 1,
        startDate, endDate, originalEndDate: endDate,
        durationDays, status: 'pending', delayDays: 0,
        assignedTo: '', notes: taskData.notes ?? '',
        dependencies: [], inspectionRequired: false,
        inspectionStatus: 'not_required', portalToken,
        updatedAt: now,
      }
      const history: HistoryEntry = {
        id: uuidv4(), projectId, taskId: id, type: 'taskAdded',
        description: `Task "${taskData.name}" added manually`,
        timestamp: now,
      }
      const updatedProject: Project = {
        ...project,
        tasks: [...project.tasks, newTask],
        history: [...project.history, history],
        updatedAt: now,
      }
      const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
      fetch(`${appUrl}/api/db`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveTasks', tasks: [newTask] }),
      }).catch(() => {})
      fetch(`${appUrl}/api/db`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addHistory', entries: [history] }),
      }).catch(() => {})
      return { projects: state.projects.map(p => p.id === projectId ? updatedProject : p) }
    })
  },

  deleteTask: (projectId, taskId) => {
    set(state => {
      const project = state.projects.find(p => p.id === projectId)
      if (!project) return state
      const task = project.tasks.find(t => t.id === taskId)
      const history: HistoryEntry = {
        id: uuidv4(), projectId, taskId, type: 'taskRemoved',
        description: `Task "${task?.name ?? taskId}" deleted`,
        timestamp: new Date().toISOString(),
      }
      const updatedTasks = project.tasks.filter(t => t.id !== taskId)
      const updatedProject: Project = {
        ...project,
        tasks: updatedTasks,
        progressPercentage: calculateProgress(updatedTasks),
        status: deriveProjectStatus(updatedTasks),
        history: [...project.history, history],
        updatedAt: new Date().toISOString(),
      }
      const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
      fetch(`${appUrl}/api/db`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteTask', taskId }),
      }).catch(() => {})
      return { projects: state.projects.map(p => p.id === projectId ? updatedProject : p) }
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
