import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// GET — load portal data for subcontractor guest view
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade, email')
      .eq('id', subId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, status, start_date, estimated_end_date')
      .eq('id', projectId)
      .maybeSingle()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data: tasks } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, sub_notes, notes, portal_token, delay_days, inspection_required, inspection_status')
      .eq('project_id', projectId)
      .or(`assigned_to.eq.${sub.company},subcontractor_phone.eq.${sub.phone}`)
      .order('task_order', { ascending: true })

    const { data: files } = await supabaseAdmin
      .from('bf_project_files')
      .select('id, name, category, file_url, file_size, file_type, uploaded_at')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    return NextResponse.json({ project, sub, tasks: tasks ?? [], files: files ?? [] })
  } catch (e: any) {
    console.error('[portal/get]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — subcontractor updates their dates/notes on a task
// Sofia checks for schedule conflicts and notifies the builder
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { taskId, sub_start_date, sub_end_date, sub_notes } = await req.json()
    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })

    // Verify sub belongs to project
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, company, trade')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get the task being updated
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, start_date, end_date, sub_start_date, sub_end_date')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Update the task with sub's dates/notes
    const updateData: Record<string, unknown> = {}
    if (sub_start_date !== undefined) updateData.sub_start_date = sub_start_date || null
    if (sub_end_date   !== undefined) updateData.sub_end_date   = sub_end_date   || null
    if (sub_notes      !== undefined) updateData.sub_notes      = sub_notes      || null

    await supabaseAdmin.from('bf_tasks').update(updateData).eq('id', taskId)

    // ── Sofia: conflict detection ─────────────────────────────────────
    const conflicts: string[] = []
    const effectiveEnd = sub_end_date || task.end_date

    if (effectiveEnd) {
      // Builder's planned end date
      if (task.end_date && sub_end_date && sub_end_date > task.end_date) {
        const delayDays = Math.ceil(
          (new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000
        )
        conflicts.push(`⚠️ "${task.name}" scheduled ${delayDays} day(s) past builder's plan (${task.end_date} → ${sub_end_date}).`)
      }

      // Check overlap with other tasks in the project
      const { data: otherTasks } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name, start_date, end_date')
        .eq('project_id', projectId)
        .neq('id', taskId)
        .not('start_date', 'is', null)

      if (otherTasks) {
        for (const other of otherTasks) {
          if (!other.start_date || !other.end_date) continue
          // Overlap: effectiveEnd >= other.start_date AND effectiveStart <= other.end_date
          const effectiveStart = sub_start_date || task.start_date
          const overlap = effectiveEnd >= other.start_date && (effectiveStart ?? '9999') <= other.end_date
          if (overlap) {
            conflicts.push(`🔀 "${task.name}" overlaps with "${other.name}" (${other.start_date}–${other.end_date}).`)
          }
        }
      }
    }

    // Note: if sub_notes provided, always log for Sofia awareness
    if (sub_notes && sub_notes.trim()) {
      conflicts.push(`📝 Sub note on "${task.name}": "${sub_notes.trim()}"`)
    }

    if (conflicts.length > 0) {
      const body = conflicts.join('\n')
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId,
        task_id: taskId,
        type: 'schedule_conflict',
        title: `⚠️ Sofia: Schedule Update — ${sub.company}`,
        body,
        is_read: false,
      })
    }

    return NextResponse.json({ ok: true, conflicts })
  } catch (e: any) {
    console.error('[portal/patch]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
