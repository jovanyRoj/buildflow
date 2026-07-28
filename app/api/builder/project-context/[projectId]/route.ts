import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

// GET /api/builder/project-context/[projectId]
// Returns full project context: tasks + builder estimates + sub real estimates + sub schedules
// Used by KORVIA to answer builder questions accurately
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params

  const { data: project } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, address, status, progress_percentage, start_date, estimated_end_date')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: tasks } = await supabaseAdmin
    .from('bf_tasks')
    .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, assigned_to, subcontractor_phone, notes, task_order')
    .eq('project_id', projectId)
    .order('task_order', { ascending: true })

  const taskIds = (tasks ?? []).map(t => t.id)

  // Builder estimates: sum of bf_quote_items per task
  const quoteMap: Record<string, number> = {}
  if (taskIds.length > 0) {
    const { data: qItems } = await supabaseAdmin
      .from('bf_quote_items')
      .select('task_id, estimated_amount')
      .eq('project_id', projectId)
      .in('task_id', taskIds)
    for (const q of qItems ?? []) {
      if (q.task_id) quoteMap[q.task_id] = (quoteMap[q.task_id] ?? 0) + (q.estimated_amount ?? 0)
    }
  }

  // Sub real estimates from bf_sub_budgets (set via portal quote flow)
  const subBudgetMap: Record<string, number> = {}
  let subProposedMap:   Record<string, number> = {}
  let approvedMap:      Record<string, number> = {}
  let finalAgreedMap:   Record<string, number> = {}
  if (taskIds.length > 0) {
    const { data: subB } = await supabaseAdmin
      .from('bf_sub_budgets')
      .select('task_id, quoted_amount, approved_amount, sub_proposed_amount, final_agreed_amount')
      .eq('project_id', projectId)
      .in('task_id', taskIds)
    subProposedMap = {}
    approvedMap    = {}
    finalAgreedMap = {}
    for (const b of subB ?? []) {
      if (b.task_id && subBudgetMap[b.task_id] === undefined) {
        subBudgetMap[b.task_id] = b.quoted_amount
      }
      if (b.task_id && b.sub_proposed_amount != null)  subProposedMap[b.task_id]  = b.sub_proposed_amount
      if (b.task_id && b.approved_amount != null)       approvedMap[b.task_id]     = b.approved_amount
      if (b.task_id && b.final_agreed_amount != null)   finalAgreedMap[b.task_id]  = b.final_agreed_amount
    }
  }

  // Task-level portal estimates (type='task' WITH non-null task_id) — most specific
  const portalEstMap: Record<string, { amount: number; notes: string | null; created_at: string }> = {}
  const { data: pEsts } = await supabaseAdmin
    .from('bf_portal_estimates')
    .select('task_id, amount, notes, created_at')
    .eq('project_id', projectId)
    .eq('type', 'task')
    .not('task_id', 'is', null)
    .order('created_at', { ascending: false })
  for (const e of pEsts ?? []) {
    if (e.task_id && !portalEstMap[e.task_id]) {
      portalEstMap[e.task_id] = { amount: e.amount, notes: e.notes, created_at: e.created_at }
    }
  }

  // Fallback: ALL estimates with null task_id (type='project' + orphaned type='task' with null task_id)
  // Keyed by sub_phone for per-sub project-level lookup
  const projEstByPhone: Record<string, number> = {}
  const { data: projPEsts } = await supabaseAdmin
    .from('bf_portal_estimates')
    .select('sub_phone, amount')
    .eq('project_id', projectId)
    .is('task_id', null)
    .order('created_at', { ascending: false })
  for (const e of projPEsts ?? []) {
    if (e.sub_phone && projEstByPhone[e.sub_phone] === undefined) {
      projEstByPhone[e.sub_phone] = e.amount
    }
  }

  // Subcontractors with schedule data
  const { data: subs } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id, company, phone, trade, sub_date_schedule, sub_schedule_notes')
    .eq('project_id', projectId)

  const subsByPhone: Record<string, any> = {}
  for (const s of subs ?? []) {
    if (s.phone) subsByPhone[s.phone] = s
  }

  // Find project-level fallback for a task — tries phone first, then company-name match
  function findProjFallback(task: any): number | null {
    if (task.subcontractor_phone && projEstByPhone[task.subcontractor_phone] !== undefined)
      return projEstByPhone[task.subcontractor_phone]
    if (task.assigned_to) {
      const atLower = (task.assigned_to as string).toLowerCase().trim()
      const matchedSub = (subs ?? []).find((s: any) => {
        if (!s.phone || !s.company) return false
        const cLower = (s.company as string).toLowerCase().trim()
        return cLower === atLower || cLower.includes(atLower) || atLower.includes(cLower)
      })
      if (matchedSub?.phone && projEstByPhone[matchedSub.phone] !== undefined)
        return projEstByPhone[matchedSub.phone]
    }
    return null
  }

  const enrichedTasks = (tasks ?? []).map(task => {
    const sub = task.subcontractor_phone ? subsByPhone[task.subcontractor_phone] : null
    const builderAmt    = quoteMap[task.id] ?? null
    const subBudgetAmt  = subBudgetMap[task.id] ?? null
    const portalEst     = portalEstMap[task.id] ?? null
    const projFallback  = findProjFallback(task)
    // Priority: bf_sub_budgets → task-level portal est → project/orphan fallback by phone/name
    const subAmt        = subBudgetAmt ?? portalEst?.amount ?? projFallback ?? null

    return {
      ...task,
      builder_estimate: builderAmt !== null ? { amount: builderAmt } : null,
      sub_estimate: subAmt !== null
        ? { amount: subAmt, notes: portalEst?.notes ?? null, submitted_at: portalEst?.created_at ?? null }
        : null,
      sub_company: sub?.company ?? task.assigned_to ?? null,
      sub_schedule: sub?.sub_date_schedule ?? null,
      sub_schedule_notes: sub?.sub_schedule_notes ?? null,
      sub_quoted_amount:    subBudgetMap[task.id]    ?? null,
      sub_proposed_amount:  subProposedMap[task.id]  ?? null,
      builder_proposed_amount: approvedMap[task.id]  ?? null,
      final_agreed_amount:  finalAgreedMap[task.id]  ?? null,
    }
  })

  const summary = {
    total:       enrichedTasks.length,
    completed:   enrichedTasks.filter(t => t.status === 'completed').length,
    in_progress: enrichedTasks.filter(t => t.status === 'in_progress').length,
    delayed:     enrichedTasks.filter(t => t.status === 'delayed').length,
    pending:     enrichedTasks.filter(t => ['pending', 'active'].includes(t.status)).length,
  }

  return NextResponse.json({ project, tasks: enrichedTasks, subs: subs ?? [], summary })
}
