export type TaskStatus = 'pending' | 'active' | 'in_progress' | 'delayed' | 'completed'
export type ProjectStatus = 'active' | 'delayed' | 'completed' | 'closed'
export type ProjectType = 'singleFamily' | 'remodel' | 'duplex' | 'commercial'
export type HistoryType = 'statusChange' | 'dateChange' | 'reschedule' | 'taskAdded' | 'taskRemoved' | 'noteChange' | 'inspectionUpdate' | 'subNotified'
export type NotificationType = 'delay' | 'reschedule' | 'completion' | 'alert' | 'inspection' | 'subcontractor'
export type InspectionStatus = 'not_required' | 'pending' | 'scheduled' | 'passed' | 'failed'

export interface Subcontractor {
  id: string
  name: string
  phone: string               // E.164 format: +15551234567
  trade: string               // e.g. "Electrical", "Plumbing", "Framing"
  email?: string
  notes?: string
}

export interface Task {
  id: string
  projectId: string
  name: string
  order: number
  startDate: string
  endDate: string
  originalEndDate: string
  durationDays: number
  status: TaskStatus
  delayDays: number
  assignedTo: string           // display name
  subcontractorId?: string
  subcontractorPhone?: string  // direct phone for SMS
  notes: string
  dependencies: string[]
  inspectionRequired: boolean
  inspectionStatus: InspectionStatus
  inspectionNotes?: string
  portalToken?: string         // unique token for subcontractor web portal
  smsLastSent?: string         // ISO timestamp
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
  bgColor?: string             // project theme color (hex), default '#1A2B4A'
  tasks: Task[]
  subcontractors: Subcontractor[]
  history: HistoryEntry[]
  notifications: AppNotification[]
  createdAt: string
  updatedAt: string
}

// Preset colors for project backgrounds
export const PROJECT_COLORS = [
  { value: '#1A2B4A', label: 'Navy',   preview: 'bg-[#1A2B4A]' },
  { value: '#1A4A2B', label: 'Forest', preview: 'bg-[#1A4A2B]' },
  { value: '#4A1A1A', label: 'Brick',  preview: 'bg-[#4A1A1A]' },
  { value: '#2B1A4A', label: 'Purple', preview: 'bg-[#2B1A4A]' },
  { value: '#1A3D4A', label: 'Teal',   preview: 'bg-[#1A3D4A]' },
  { value: '#4A2B1A', label: 'Walnut', preview: 'bg-[#4A2B1A]' },
  { value: '#4A1A3A', label: 'Rose',   preview: 'bg-[#4A1A3A]' },
  { value: '#1A3A1A', label: 'Green',  preview: 'bg-[#1A3A1A]' },
]
