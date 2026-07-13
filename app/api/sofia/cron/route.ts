import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'
import { buildSofiaTaskReminder, SofiaContext } from '@/lib/sofia'

// ─── GET /api/sofia/cron ──────────────────────────────────────────────────────
// Vercel Cron calls this every day at 8am (configured in vercel.json).
// Sofia checks all active projects and:
//   1. Sends task reminders to subs whose task starts in 0-1 days
//   2. Sends daily summary to all builders with active projects

export async function GET(req: NextRequest) {
  // Vercel adds this header on cron calls
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const isSofia = req.headers.get('x-sofia-secret') === process.env.SOFIA_SECRET
  if (!isVercelCron && !isSofia && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const results: string[] = []

  // 1. Find tasks starting today or tomorrow with a phone number
  const { data: upcomingTasks } = await supabaseAdmin
    .from('bf_tasks')
    .select(`
      id, project_id, name, status, start_date, end_date,
      notes, inspection_required, assigned_to, subcontractor_phone,
      bf_projects!inner(id, name, address, user_id)
    `)
    .in('start_date', [today, tomorrow])
    .in('status', ['pending', 'active'])
    .not('subcontractor_phone', 'is', null)
    .neq('subcontractor_phone', '')

  for (const task of upcomingTasks ?? []) {
    const project = (task as any).bf_projects
    const daysUntil = task.start_date === today ? 0 : 1

    const ctx: SofiaContext = {
      subName: task.assigned_to ?? '',
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

    const message = buildSofiaTaskReminder(ctx, daysUntil)
    const res = await sendSMS(task.subcontractor_phone, message)
    results.push(`${task.name}: ${res.ok ? 'sent' : res.error}`)
  }

  // 2. Daily summary to all builders with active/delayed projects
  const { data: builders } = await supabaseAdmin
    .from('bf_users')
    .select('id, name, phone')
    .not('phone', 'is', null)
    .neq('phone', '')

  for (const builder of builders ?? []) {
    const { data: projects } = await supabaseAdmin
      .from('bf_projects')
      .select('name, status, progress_percentage')
      .eq('user_id', builder.id)
      .in('status', ['active', 'delayed'])

    if (!projects?.length) continue

    const active  = projects.filter(p => p.status === 'active').length
    const delayed = projects.filter(p => p.status === 'delayed').length
    const avg     = Math.round(projects.reduce((s, p) => s + p.progress_percentage, 0) / projects.length)

    const msg = `☀️ Brivox — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}\n` +
      `Hi ${builder.name?.split(' ')[0]}! Sofia here.\n` +
      `📊 ${active} active | ${delayed} delayed | avg ${avg}%\n` +
      (delayed > 0 ? `⚠️ ${projects.filter(p => p.status === 'delayed').map(p => p.name).join(', ')} delayed\n` : '') +
      `All systems monitored. 🤖`

    const res = await sendSMS(builder.phone, msg)
    results.push(`Builder ${builder.name}: ${res.ok ? 'sent' : res.error}`)
  }

  return NextResponse.json({ ok: true, date: today, results })
}
