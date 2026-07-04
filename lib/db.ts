'use client'
import { supabase } from './supabase'
import { Project, Task, HistoryEntry, AppNotification, Subcontractor } from './types'
import { calculateProgress } from './scheduleEngine'

// ─── USER ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: { id: string; email: string; name: string; avatar?: string; provider?: string }) {
  const { data, error } = await supabase
    .from('bf_users')
    .upsert({ id: user.id, email: user.email, name: user.name, avatar: user.avatar ?? '', provider: user.provider ?? 'email' }, { onConflict: 'email' })
    .select('id')
    .single()
  if (error) console.error('upsertUser:', error)
  return data?.id as string | undefined
}

export async function getUserByEmail(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const { data } = await supabase.from('bf_users').select('id, name, email').eq('email', email).single()
  return data ?? null
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export async function loadProjects(userId: string): Promise<Project[]> {
  const { data: projects, error } = await supabase
    .from('bf_projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error || !projects) return []

  const projectIds = projects.map(p => p.id)

  const [tasksRes, subsRes, histRes, notifRes] = await Promise.all([
    supabase.from('bf_tasks').select('*').in('project_id', projectIds).order('task_order'),
    supabase.from('bf_subcontractors').select('*').in('project_id', projectIds),
    supabase.from('bf_history').select('*').in('project_id', projectIds).order('created_at'),
    supabase.from('bf_notifications').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
  ])

  return projects.map(p => dbToProject(p,
    tasksRes.data?.filter(t => t.project_id === p.id) ?? [],
    subsRes.data?.filter(s => s.project_id === p.id) ?? [],
    histRes.data?.filter(h => h.project_id === p.id) ?? [],
    notifRes.data?.filter(n => n.project_id === p.id) ?? [],
  ))
}

export async function saveProject(userId: string, project: Project): Promise<void> {
  const { error } = await supabase.from('bf_projects').upsert({
    id: project.id,
    user_id: userId,
    name: project.name,
    address: project.address,
    project_type: project.projectType,
    start_date: project.startDate,
    estimated_end_date: project.estimatedEndDate,
    status: project.status,
    progress_percentage: project.progressPercentage,
    bg_color: project.bgColor ?? '#1A2B4A',
    updated_at: new Date().toISOString(),
  })
  if (error) console.error('saveProject:', error)
}

export async function deleteProject(projectId: string): Promise<void> {
  await supabase.from('bf_projects').delete().eq('id', projectId)
}

// ─── TASKS ───────────────────────────────────────────────────────────────────

export async function saveTasks(tasks: Task[]): Promise<void> {
  if (!tasks.length) return
  const rows = tasks.map(taskToDb)
  const { error } = await supabase.from('bf_tasks').upsert(rows, { onConflict: 'id' })
  if (error) console.error('saveTasks:', error)
}

export async function saveTask(task: Task): Promise<void> {
  const { error } = await supabase.from('bf_tasks').upsert(taskToDb(task), { onConflict: 'id' })
  if (error) console.error('saveTask:', error)
}

// ─── SUBCONTRACTORS ──────────────────────────────────────────────────────────

export async function saveSubcontractor(sub: Subcontractor & { projectId: string; company?: string }): Promise<void> {
  const { error } = await supabase.from('bf_subcontractors').upsert({
    id: sub.id,
    project_id: sub.projectId,
    name: sub.name,
    company: (sub as any).company ?? '',
    phone: sub.phone,
    trade: sub.trade,
    email: sub.email ?? '',
    notes: sub.notes ?? '',
  }, { onConflict: 'id' })
  if (error) console.error('saveSubcontractor:', error)
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────

export async function addHistory(entries: HistoryEntry[]): Promise<void> {
  if (!entries.length) return
  const { error } = await supabase.from('bf_history').insert(
    entries.map(h => ({
      id: h.id, project_id: h.projectId, task_id: h.taskId ?? null,
      type: h.type, description: h.description,
      previous_value: h.previousValue ?? null, new_value: h.newValue ?? null,
      created_at: h.timestamp,
    }))
  )
  if (error) console.error('addHistory:', error)
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export async function addNotifications(notifs: AppNotification[]): Promise<void> {
  if (!notifs.length) return
  const { error } = await supabase.from('bf_notifications').insert(
    notifs.map(n => ({
      id: n.id, project_id: n.projectId, task_id: n.taskId ?? null,
      type: n.type, title: n.title, body: n.body,
      is_read: n.isRead, created_at: n.createdAt,
    }))
  )
  if (error) console.error('addNotifications:', error)
}

export async function markNotifRead(notifId: string): Promise<void> {
  await supabase.from('bf_notifications').update({ is_read: true }).eq('id', notifId)
}

export async function markAllNotifsRead(projectId: string): Promise<void> {
  await supabase.from('bf_notifications').update({ is_read: true }).eq('project_id', projectId)
}

// ─── CONVERTERS ──────────────────────────────────────────────────────────────

function taskToDb(t: Task) {
  return {
    id: t.id, project_id: t.projectId, name: t.name,
    task_order: t.order, start_date: t.startDate, end_date: t.endDate,
    original_end_date: t.originalEndDate, duration_days: t.durationDays,
    status: t.status, delay_days: t.delayDays,
    assigned_to: t.assignedTo, subcontractor_phone: t.subcontractorPhone ?? '',
    notes: t.notes, dependencies: t.dependencies,
    inspection_required: t.inspectionRequired, inspection_status: t.inspectionStatus,
    inspection_notes: t.inspectionNotes ?? '', portal_token: t.portalToken ?? null,
    sms_last_sent: t.smsLastSent ?? null, updated_at: t.updatedAt,
  }
}

function dbToProject(p: any, tasks: any[], subs: any[], history: any[], notifs: any[]): Project {
  // Map tasks first so we can recalculate progress from live statuses
  // (prevents stale 100% when sub portal updates task status independently)
  const mappedTasks = tasks.map(dbToTask)
  return {
    id: p.id, name: p.name, address: p.address,
    projectType: p.project_type, startDate: p.start_date,
    estimatedEndDate: p.estimated_end_date, status: p.status,
    progressPercentage: calculateProgress(mappedTasks),   // ← live recalculation
    bgColor: p.bg_color ?? '#1A2B4A',
    tasks: mappedTasks,
    subcontractors: subs.map(dbToSub),
    history: history.map(dbToHistory),
    notifications: notifs.map(dbToNotif),
    createdAt: p.created_at, updatedAt: p.updated_at,
  }
}

function dbToTask(t: any): Task {
  return {
    id: t.id, projectId: t.project_id, name: t.name,
    order: t.task_order, startDate: t.start_date, endDate: t.end_date,
    originalEndDate: t.original_end_date, durationDays: t.duration_days,
    status: t.status, delayDays: t.delay_days,
    assignedTo: t.assigned_to, subcontractorPhone: t.subcontractor_phone,
    notes: t.notes, dependencies: t.dependencies ?? [],
    inspectionRequired: t.inspection_required, inspectionStatus: t.inspection_status,
    inspectionNotes: t.inspection_notes, portalToken: t.portal_token,
    smsLastSent: t.sms_last_sent, updatedAt: t.updated_at,
  }
}

function dbToSub(s: any): Subcontractor & { company: string } {
  return {
    id: s.id, name: s.name, company: s.company ?? '',
    phone: s.phone, trade: s.trade, email: s.email, notes: s.notes,
  }
}

function dbToHistory(h: any): HistoryEntry {
  return {
    id: h.id, projectId: h.project_id, taskId: h.task_id,
    type: h.type, description: h.description,
    previousValue: h.previous_value, newValue: h.new_value,
    timestamp: h.created_at,
  }
}

function dbToNotif(n: any): AppNotification {
  return {
    id: n.id, projectId: n.project_id, taskId: n.task_id,
    type: n.type, title: n.title, body: n.body,
    isRead: n.is_read, createdAt: n.created_at,
  }
}
