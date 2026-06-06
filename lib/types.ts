export type TaskStatus = 'pending' | 'active' | 'delayed' | 'completed'
export type ProjectStatus = 'active' | 'delayed' | 'completed' | 'closed'
export type ProjectType = 'singleFamily' | 'remodel' | 'duplex' | 'commercial'
export type HistoryType = 'statusChange' | 'dateChange' | 'reschedule' | 'taskAdded' | 'taskRemoved' | 'noteChange'
export type NotificationType = 'delay' | 'reschedule' | 'completion' | 'alert'

export interface Task {
  id: string
  projectId: string
  name: string
  order: number
  startDate: string // ISO date string
  endDate: string
  originalEndDate: string
  durationDays: number
  status: TaskStatus
  delayDays: number
  assignedTo: string
  notes: string
  dependencies: string[] // task ids
  updatedAt: string
}

export interface HistoryEntry {
  id: string
  projectId: string
  taskId?: string
  type: HistoryType
  description: string
  previousValue?: string
  newValue?: string
  timestamp: string
}

export interface AppNotification {
  id: string
  projectId: string
  taskId?: string
  type: NotificationType
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

export interface Project {
  id: string
  name: string
  address: string
  projectType: ProjectType
  startDate: string
  estimatedEndDate: string
  actualEndDate?: string
  status: ProjectStatus
  progressPercentage: number
  tasks: Task[]
  history: HistoryEntry[]
  notifications: AppNotification[]
  createdAt: string
  updatedAt: string
}
