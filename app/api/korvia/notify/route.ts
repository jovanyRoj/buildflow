import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'
import { buildKorviaTaskReminder, buildKorviaInspectionReminder, KorviaContext } from '@/lib/korvia'

// ─── POST /api/korvia/notify ───────────────────────────────────────────────────
// KORVIA proactively contacts subcontractors.
// Types: 'task_reminder' | 'inspection_reminder' | 'daily_report'
//
// Can be called:
//   - From store.ts when task status changes to 'active'
//   - From a Vercel Cron Job every morning (add to vercel.json)
//   - Manually from the builder's project view

export async function POST(req: NextRequest) {
  // Verify internal secret so only Brivox can trigger this
  const secret = req.headers.get('x-sofia-secret')
  if (secret !== process.env.SOFIA_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { type, taskId, userId } = body as {
      type: 'task_reminder' | 'inspection_reminder' | 'daily_report'
      taskId?: string
      userId?: string
    }

    if (type === 'task_reminder' && taskId) {
      return await sendTaskReminder(taskId)
    }

    if (type === 'inspection_reminder' && taskId) {
      return await sendInspectionReminder(taskId)
    }

    if (type === 'daily_report' && userId) {
      return await sendDailyReport(userId)
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (e: any) {
    console.error('[Sofia/notify]', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// ─── Task Reminder ────────────────────────────────────────────────────────────

async function sendTaskReminder(taskId: string) {
  const { data: task } = await supabaseAdmin
    .from('bf_tasks')
    .select(`
      id, project_id, name, status, start_date, end_date, notes,
      inspection_required, assigned_to, subcontractor_phone, portal_token,
      bf_projects!inner(id, name, address, user_id)
    `)
    .eq('id', taskId)
    .single()

  if (!task || !task.subcontractor_phone) {
    return NextResponse.json({ ok: false, error: 'Task not found or no phone' })
  }

  const project = (task as any).bf_projects
  const today = new Date().toISOString().split('T')[0]
  const startDate = task.start_date
  const daysUntil = Math.round(
    (new Date(startDate).getTime() - new Date(today).getTime()) / 86400000
  )

  if (daysUntil < 0 || daysUntil > 3) {
    return NextResponse.json({ ok: false, skipped: `Task starts in ${daysUntil} days — no reminder needed` })
  }

  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('name')
    .or(`phone.eq.${task.subcontractor_phone}`)
    .maybeSingle()

  const ctx: KorviaContext = {
    subName: sub?.name ?? task.assigned_to ?? '',
    subPhone: task.subcontractor_phone,
    taskId: task.id,
    taskName: task.name,
    taskStatus: task.status,
    taskStartDate: task.start_date,
    taskEndDate: task.end_date,
    taskNotes: task.notes ?? '',
    inspectionRequired: task.inspection_required ?? false,
    projectId: project.id,
    projectName: project.name,
    projectAddress: project.address,
    userId: project.user_id,
  }

  const message = buildKorviaTaskReminder(ctx, daysUntil)
  const result = await sendSMS(task.subcontractor_phone, message)
  return NextResponse.json({ ok: result.ok, message })
}

// ─── Inspection Reminder ──────────────────────────────────────────────────────

async function sendInspectionReminder(taskId: string) {
  const { data: task } = await supabaseAdmin
    .from('bf_tasks')
    .select(`
      id, project_id, name, status, start_date, end_date,
      inspection_required, inspection_status, assigned_to, subcontractor_phone,
      bf_projects!inner(id, name, address, user_id)
    `)
    .eq('id', taskId)
    .single()

  if (!task?.inspection_required || !task.subcontractor_phone) {
    return NextResponse.json({ ok: false, skipped: 'No inspection required or no phone' })
  }

  const project = (task as any).bf_projects
  const ctx: KorviaContext = {
    subName: task.assigned_to ?? '',
    subPhone: task.subcontractor_phone,
    taskId: task.id,
    taskName: task.name,
    taskStatus: task.status,
    taskStartDate: task.start_date,
    taskEndDate: task.end_date,
    taskNotes: '',
    inspectionRequired: true,
    projectId: project.id,
    projectName: project.name,
    projectAddress: project.address,
    userId: project.user_id,
  }

  const message = buildKorviaInspectionReminder(ctx)
  const result = await sendSMS(task.subcontractor_phone, message)
  return NextResponse.json({ ok: result.ok, message })
}

// ─── Daily Report to Builder ──────────────────────────────────────────────────

async function sendDailyReport(userId: string) {
  const { data: user } = await supabaseAdmin
    .from('bf_users')
    .select('name, phone')
    .eq('id', userId)
    .single()

  if (!user?.phone) {
    return NextResponse.json({ ok: false, error: 'Builder has no phone on file' })
  }

  const { data: projects } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, status, progress_percentage')
    .eq('user_id', userId)
    .in('status', ['active', 'delayed'])

  if (!projects?.length) {
    return NextResponse.json({ ok: true, skipped: 'No active projects' })
  }

  const active   = projects.filter(p => p.status === 'active').length
  const delayed  = projects.filter(p => p.status === 'delayed').length
  const avgProg  = Math.round(projects.reduce((s, p) => s + p.progress_percentage, 0) / projects.length)

  const delayedNames = projects
    .filter(p => p.status === 'delayed')
    .map(p => p.name)
    .join(', ')

  const report = `☀️ Brivox Daily — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}\n` +
    `Hi ${user.name?.split(' ')[0] ?? 'Builder'}!\n\n` +
    `📊 ${active} active | ${delayed} delayed\n` +
    `📈 Avg progress: ${avgProg}%\n` +
    (delayed > 0 ? `⚠️ Delayed: ${delayedNames}\n` : '') +
    `\nSofia is monitoring all projects. 🤖`

  const result = await sendSMS(user.phone, report)
  return NextResponse.json({ ok: result.ok, report })
}
