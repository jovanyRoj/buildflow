import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { v4 as uuidv4 } from 'uuid'

// POST /api/builder/restore-task
// Body: { projectId, subId }
// Recreates a bf_tasks row for an orphaned sub (registered but no linked task).
export async function POST(req: NextRequest) {
  try {
    const { projectId, subId } = await req.json()
    if (!projectId || !subId) {
      return NextResponse.json({ error: 'Missing projectId or subId' }, { status: 400 })
    }

    // 1. Get sub
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, trade, phone')
      .eq('id', subId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!sub) return NextResponse.json({ error: 'Sub not found' }, { status: 404 })

    const e164    = sub.phone ?? ''
    const company = sub.company ?? sub.name ?? 'Sub'
    const trade   = (sub.trade ?? 'General').toLowerCase()

    // 2. Check if a task already exists for this sub
    const { data: existingTasks } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status')
      .eq('project_id', projectId)
      .or(
        e164
          ? `subcontractor_phone.eq.${e164},assigned_to.eq.${company}`
          : `assigned_to.eq.${company}`
      )

    if (existingTasks && existingTasks.length > 0) {
      // Task already exists — return it without creating a duplicate
      return NextResponse.json({ ok: true, alreadyExisted: true, task: existingTasks[0] })
    }

    // 3. Get project dates
    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('name, start_date, estimated_end_date')
      .eq('id', projectId)
      .maybeSingle()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const startDate  = project.start_date         ?? new Date().toISOString().split('T')[0]
    const endDate    = project.estimated_end_date  ?? startDate
    const durationMs = new Date(endDate).getTime() - new Date(startDate).getTime()
    const durDays    = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))

    // 4. Get current task count for task_order
    const { count: taskCount } = await supabaseAdmin
      .from('bf_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)

    const taskLabel = trade.charAt(0).toUpperCase() + trade.slice(1)
    const newTaskId = uuidv4()

    const { error: taskErr } = await supabaseAdmin.from('bf_tasks').insert({
      id:                newTaskId,
      project_id:        projectId,
      name:              `${taskLabel} Work`,
      status:            'pending',
      start_date:        startDate,
      end_date:          endDate,
      original_end_date: endDate,
      duration_days:     durDays,
      delay_days:        0,
      assigned_to:       company,
      subcontractor_phone: e164 || null,
      task_order:        (taskCount ?? 0) + 1,
      notes:             '',
      portal_token:      uuidv4(),
      inspection_required: false,
    })

    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 })
    }

    // 5. Notification (fire-and-forget — ignore errors)
    try {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId,
        task_id:    newTaskId,
        type:       'subcontractor',
        title:      `🔄 Task restored for ${company}`,
        body:       `Builder manually restored the "${taskLabel} Work" task for ${company}. Sub can now re-submit their estimate from their portal.`,
        is_read:    false,
      })
    } catch {}

    return NextResponse.json({
      ok: true,
      alreadyExisted: false,
      task: { id: newTaskId, name: `${taskLabel} Work`, status: 'pending' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
