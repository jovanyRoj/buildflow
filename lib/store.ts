'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { Project, Task, HistoryEntry, AppNotification, InspectionStatus } from './types'
import { generateTasks } from './taskDefaults'
import { rescheduleFromTask, calculateProgress, deriveProjectStatus } from './scheduleEngine'
import { Session, getSession, saveSession, clearSession } from './auth'

// Each user's projects stored under their own key: buildflow-storage-{userId}
function getUserStorageKey(userId: string) {
  return `buildflow-projects-${userId}`
}

function loadUserProjects(userId: string): Project[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(getUserStorageKey(userId)) || '[]') } catch { return [] }
}

function saveUserProjects(userId: string, projects: Project[]): void {
  localStorage.setItem(getUserStorageKey(userId), JSON.stringify(projects))
}

interface BuildFlowStore {
  projects: Project[]
  currentUser: Session | null

  // Auth
  setCurrentUser: (user: Session | null) => void
  logout: () => void
  loadUserData: (userId: string) => void

  // Projects
  createProject: (data: { name: string; address: string; projectType: Project['projectType']; startDate: string }) => Project
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'address' | 'estimatedEndDate' | 'status'>>) => void
  deleteProject: (id: string) => void
  getProject: (id: string) => Project | undefined

  // Tasks
  updateTask: (projectId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'status' | 'startDate' | 'endDate' | 'notes' | 'assignedTo' | 'subcontractorPhone' | 'inspectionStatus' | 'inspectionNotes'>>) => void

  // Notifications
  markNotificationRead: (projectId: string, notifId: string) => void
  markAllNotificationsRead: (projectId: string) => void
  getAllNotifications: () => AppNotification[]
  getUnreadCount: () => number
}

export const useBuildFlowStore = create<BuildFlowStore>()(
  (set, get) => ({
    projects: [],
    currentUser: null,

    setCurrentUser: (user) => {
      if (user) {
        saveSession(user)
        const projects = loadUserProjects(user.id)
        set({ currentUser: user, projects })
      } else {
        clearSession()
        set({ currentUser: null, projects: [] })
      }
    },

    logout: () => {
      clearSession()
      set({ currentUser: null, projects: [] })
    },

    loadUserData: (userId) => {
      const projects = loadUserProjects(userId)
      set({ projects })
    },

    createProject: (data) => {
      const { currentUser, projects } = get()
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
        history: [{
          id: uuidv4(),
          projectId: id,
          type: 'taskAdded',
          description: 'Project created with 22 default tasks',
          timestamp: new Date().toISOString(),
        }],
        subcontractors: [],
        notifications: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const updated = [...projects, project]
      if (currentUser) saveUserProjects(currentUser.id, updated)
      set({ projects: updated })
      return project
    },

    updateProject: (id, data) => {
      const { currentUser } = get()
      set(state => {
        const updated = state.projects.map(p =>
          p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
        )
        if (currentUser) saveUserProjects(currentUser.id, updated)
        return { projects: updated }
      })
    },

    deleteProject: (id) => {
      const { currentUser } = get()
      set(state => {
        const updated = state.projects.filter(p => p.id !== id)
        if (currentUser) saveUserProjects(currentUser.id, updated)
        return { projects: updated }
      })
    },

    getProject: (id) => get().projects.find(p => p.id === id),

    updateTask: (projectId, taskId, data) => {
      const { currentUser } = get()
      set(state => {
        const project = state.projects.find(p => p.id === projectId)
        if (!project) return state
        const oldTask = project.tasks.find(t => t.id === taskId)
        if (!oldTask) return state

        const historyEntries: HistoryEntry[] = []
        const newNotifications: AppNotification[] = []

        if (data.status && data.status !== oldTask.status) {
          historyEntries.push({ id: uuidv4(), projectId, taskId, type: 'statusChange', description: `"${oldTask.name}" status changed`, previousValue: oldTask.status, newValue: data.status, timestamp: new Date().toISOString() })
          if (data.status === 'delayed') {
            newNotifications.push({ id: uuidv4(), projectId, taskId, type: 'delay', title: `${oldTask.name} marked as Delayed`, body: `This may affect downstream tasks. Timeline updated automatically.`, isRead: false, createdAt: new Date().toISOString() })
          }
          if (data.status === 'completed') {
            newNotifications.push({ id: uuidv4(), projectId, taskId, type: 'completion', title: `${oldTask.name} completed`, body: `Task marked as completed successfully.`, isRead: false, createdAt: new Date().toISOString() })
            // Auto-cascade: notify next subcontractors via SMS
            const directDependents = project.tasks.filter(t => t.dependencies.includes(taskId) && t.subcontractorPhone)
            for (const nextTask of directDependents) {
              fetch('/api/sms/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'cascade', nextTask, project, completedTaskName: oldTask.name }),
              }).catch(() => {})
              newNotifications.push({
                id: uuidv4(), projectId, taskId: nextTask.id, type: 'subcontractor',
                title: `SMS sent to ${nextTask.assignedTo || 'next subcontractor'}`,
                body: `"${nextTask.name}" — ${nextTask.assignedTo || 'Subcontractor'} was notified automatically`,
                isRead: false, createdAt: new Date().toISOString(),
              })
            }
          }
        }

        // Inspection status change history
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
            body: data.inspectionStatus === 'passed' ? '✅ Inspection passed! Ready for next phase.' : data.inspectionStatus === 'failed' ? '❌ Inspection failed. Review required.' : 'Inspection status updated.',
            isRead: false, createdAt: new Date().toISOString(),
          })
        }

        if (data.endDate && data.endDate !== oldTask.endDate) {
          historyEntries.push({ id: uuidv4(), projectId, taskId, type: 'dateChange', description: `"${oldTask.name}" end date changed`, previousValue: oldTask.endDate, newValue: data.endDate, timestamp: new Date().toISOString() })
        }

        let updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t)
        let cascadeHistory: HistoryEntry[] = []
        let cascadeNotifs: AppNotification[] = []

        if (data.endDate && data.endDate !== oldTask.endDate) {
          const result = rescheduleFromTask(updatedTasks, taskId)
          updatedTasks = result.updatedTasks
          cascadeHistory = result.historyEntries
          cascadeNotifs = result.notifications
          if (cascadeNotifs.length > 0) {
            cascadeNotifs = [{ id: uuidv4(), projectId, type: 'alert', title: `${project.name} timeline updated`, body: `${cascadeNotifs.length} task(s) were rescheduled automatically.`, isRead: false, createdAt: new Date().toISOString() }, ...cascadeNotifs]
          }
        }

        const updatedProject: Project = {
          ...project,
          tasks: updatedTasks,
          progressPercentage: calculateProgress(updatedTasks),
          status: deriveProjectStatus(updatedTasks),
          estimatedEndDate: updatedTasks[updatedTasks.length - 1].endDate,
          history: [...project.history, ...historyEntries, ...cascadeHistory],
          notifications: [...project.notifications, ...newNotifications, ...cascadeNotifs],
          updatedAt: new Date().toISOString(),
        }

        const updated = state.projects.map(p => p.id === projectId ? updatedProject : p)
        if (currentUser) saveUserProjects(currentUser.id, updated)
        return { projects: updated }
      })
    },

    markNotificationRead: (projectId, notifId) => {
      const { currentUser } = get()
      set(state => {
        const updated = state.projects.map(p =>
          p.id === projectId ? { ...p, notifications: p.notifications.map(n => n.id === notifId ? { ...n, isRead: true } : n) } : p
        )
        if (currentUser) saveUserProjects(currentUser.id, updated)
        return { projects: updated }
      })
    },

    markAllNotificationsRead: (projectId) => {
      const { currentUser } = get()
      set(state => {
        const updated = state.projects.map(p =>
          p.id === projectId ? { ...p, notifications: p.notifications.map(n => ({ ...n, isRead: true })) } : p
        )
        if (currentUser) saveUserProjects(currentUser.id, updated)
        return { projects: updated }
      })
    },

    getAllNotifications: () =>
      get().projects.flatMap(p => p.notifications).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

    getUnreadCount: () =>
      get().projects.reduce((sum, p) => sum + p.notifications.filter(n => !n.isRead).length, 0),
  })
)
