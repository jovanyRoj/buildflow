import { TaskStatus, ProjectStatus } from './types'

export const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; border: string; dot: string }> = {
  pending:   { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300',   dot: 'bg-gray-400' },
  active:    { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-300',   dot: 'bg-blue-500' },
  delayed:   { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-300',    dot: 'bg-red-500' },
  completed: { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-300',  dot: 'bg-green-500' },
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
  active:    { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Active' },
  delayed:   { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Delayed' },
  completed: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Completed' },
  closed:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Closed' },
}

export const STATUS_ICONS: Record<TaskStatus, string> = {
  pending:   'clock',
  active:    'play-circle',
  delayed:   'alert-triangle',
  completed: 'check-circle',
}

export const TIMELINE_BAR_COLORS: Record<TaskStatus, string> = {
  pending:   'bg-gray-300',
  active:    'bg-blue-500',
  delayed:   'bg-red-500',
  completed: 'bg-green-500',
}
