'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { format, addDays } from 'date-fns'
import { Project, Task, TaskStatus, HistoryEntry, AppNotification } from './types'
import { generateTasks } from './taskDefaults'
import {
  rescheduleFromTask,
  calculateProgress,
  deriveProjectStatus,
} from './scheduleEngine'

interface BuildFlowStore {
  projects: Project[]
  currentUser: { name: string; email: string } | null

  // Auth
  login: (email: string, password: string) => boolean
  logout: () => void

  // Projects
  createProject: (data: {
    name: string
    address: string
    projectType: Project['projectType']
    startDate: string
  }) => Project
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'address' | 'estimatedEndDate' | 'status'>>) => void
  deleteProject: (id: string) => void
  getProject: (id: string) => Project | undefined

  // Tasks
  updateTask: (projectId: string, taskId: string, data: Partial<Pick<Task, 'name' | 'status' | 'startDate' | 'endDate' | 'notes' | 'assignedTo'>>) => void

  // Notifications
  markNotificationRead: (projectId: string, notifId: string) => void
  markAllNotificationsRead: (projectId: string) => void
  getAllNotifications: () => AppNotification[]
  getUnreadCount: () => number
}

const DEMO_USER = { name: 'Builder', email: 'builder@buildflow.app', password: 'build123' }

export const useBuildFlowStore = create<BuildFlowStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentUser: null,

      login: (email, password) => {
        if (email === DEMO_USER.email && password === DEMO_USER.password) {
          set({ currentUser: { name: DEMO_USER.name, email: DEMO_USER.email } })
          return true
        }
        return false
      },

      logout: () => set({ currentUser: null }),

      createProject: (data) => {
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
          notifications: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set(state => ({ projects: [...state.projects, project] }))
        return project
      },

      updateProject: (id, data) => {
        set(state => ({
          projects: state.projects.map(p =>
            p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
          ),
        }))
      },

      deleteProject: (id) => {
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

          // Build history for each changed field
          if (data.status && data.status !== oldTask.status) {
            historyEntries.push({
              id: uuidv4(),
              projectId,
              taskId,
              type: 'statusChange',
              description: `"${oldTask.name}" status changed`,
              previousValue: oldTask.status,
              newValue: data.status,
              timestamp: new Date().toISOString(),
            })

            if (data.status === 'delayed') {
              newNotifications.push({
                id: uuidv4(),
                projectId,
                taskId,
                type: 'delay',
                title: `${oldTask.name} marked as Delayed`,
                body: `This may affect downstream tasks. Timeline updated automatically.`,
                isRead: false,
                createdAt: new Date().toISOString(),
              })
            }

            if (data.status === 'completed') {
              newNotifications.push({
                id: uuidv4(),
                projectId,
                taskId,
                type: 'completion',
                title: `${oldTask.name} completed`,
                body: `Task marked as completed successfully.`,
                isRead: false,
                createdAt: new Date().toISOString(),
              })
            }
          }

          if (data.endDate && data.endDate !== oldTask.endDate) {
            historyEntries.push({
              id: uuidv4(),
              projectId,
              taskId,
              type: 'dateChange',
              description: `"${oldTask.name}" end date changed`,
              previousValue: oldTask.endDate,
              newValue: data.endDate,
              timestamp: new Date().toISOString(),
            })
          }

          // Apply the change to the task
          let updatedTasks = project.tasks.map(t =>
            t.id === taskId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
          )

          // If end date changed or status is delayed → cascade reschedule
          let cascadeHistory: HistoryEntry[] = []
          let cascadeNotifs: AppNotification[] = []

          if (data.endDate && data.endDate !== oldTask.endDate) {
            const result = rescheduleFromTask(updatedTasks, taskId)
            updatedTasks = result.updatedTasks
            cascadeHistory = result.historyEntries
            cascadeNotifs = result.notifications

            if (cascadeNotifs.length > 0) {
              const projectAlert: AppNotification = {
                id: uuidv4(),
                projectId,
                type: 'alert',
                title: `${project.name} timeline updated`,
                body: `${cascadeNotifs.length} task(s) were rescheduled automatically.`,
                isRead: false,
                createdAt: new Date().toISOString(),
              }
              cascadeNotifs = [projectAlert, ...cascadeNotifs]
            }
          }

          const progress = calculateProgress(updatedTasks)
          const projectStatus = deriveProjectStatus(updatedTasks)
          const lastTask = updatedTasks[updatedTasks.length - 1]

          const updatedProject: Project = {
            ...project,
            tasks: updatedTasks,
            progressPercentage: progress,
            status: projectStatus,
            estimatedEndDate: lastTask.endDate,
            history: [...project.history, ...historyEntries, ...cascadeHistory],
            notifications: [...project.notifications, ...newNotifications, ...cascadeNotifs],
            updatedAt: new Date().toISOString(),
          }

          return {
            projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
          }
        })
      },

      markNotificationRead: (projectId, notifId) => {
        set(state => ({
          projects: state.projects.map(p =>
            p.id === projectId
              ? {
                  ...p,
                  notifications: p.notifications.map(n =>
                    n.id === notifId ? { ...n, isRead: true } : n
                  ),
                }
              : p
          ),
        }))
      },

      markAllNotificationsRead: (projectId) => {
        set(state => ({
          projects: state.projects.map(p =>
            p.id === projectId
              ? { ...p, notifications: p.notifications.map(n => ({ ...n, isRead: true })) }
              : p
          ),
        }))
      },

      getAllNotifications: () => {
        return get()
          .projects.flatMap(p => p.notifications)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      },

      getUnreadCount: () => {
        return get().projects.reduce(
          (sum, p) => sum + p.notifications.filter(n => !n.isRead).length,
          0
        )
      },
    }),
    { name: 'buildflow-storage' }
  )
)
