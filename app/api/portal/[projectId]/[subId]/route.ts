import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade, email')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()

    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, status, start_date, estimated_end_date')
      .eq('id', projectId).maybeSingle()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data: tasks } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, sub_notes, sub_crew_size, sub_materials_status, sub_confirmed, notes, portal_token, delay_days, inspection_required, inspection_status, task_order')
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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const {
      taskId, sub_start_date, sub_end_date, sub_notes,
      sub_crew_size, sub_materials_status, sub_confirmed,
      status, inspection_status,
    } = await req.json()
    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })

    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, company, trade')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, start_date, end_date')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (sub_start_date       !== undefined) updateData.sub_start_date       = sub_start_date || null
    if (sub_end_date         !== undefined) updateData.sub_end_date         = sub_end_date   || null
    if (sub_notes            !== undefined) updateData.sub_notes            = sub_notes      || null
    if (sub_crew_size        !== undefined) updateData.sub_crew_size        = sub_crew_size  || null
    if (sub_materials_status !== undefined) updateData.sub_materials_status = sub_materials_status || null
    if (sub_confirmed        !== undefined) updateData.sub_confirmed        = sub_confirmed
    if (status               !== undefined) updateData.status               = status
    if (inspection_status    !== undefined) updateData.inspection_status    = inspection_status

    await supabaseAdmin.from('bf_tasks').update(updateData).eq('id', taskId)

    // ── Sofia conflict detection & notifications ──
    const conflicts: string[] = []
    const effectiveEnd = sub_end_date || task.end_date

    if (effectiveEnd && task.end_date && sub_end_date && sub_end_date > task.end_date) {
      const delay = Math.ceil((new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000)
      conflicts.push(`⚠️ "${task.name}" is ${delay} day(s) past builder's plan (${task.end_date} → ${sub_end_date}).`)
    }

    if (effectiveEnd) {
      const { data: others } = await supabaseAdmin
        .from('bf_tasks').select('id, name, start_date, end_date')
        .eq('project_id', projectId).neq('id', taskId).not('start_date', 'is', null)

      if (others) {
        const effectiveStart = sub_start_date || task.start_date
        for (const o of others) {
          if (!o.start_date || !o.end_date) continue
          const overlap = effectiveEnd >= o.start_date && (effectiveStart ?? '9999') <= o.end_date
          if (overlap) conflicts.push(`🔀 "${task.name}" overlaps with "${o.name}" (${o.start_date}–${o.end_date}).`)
        }
      }
    }

    // Status change notifications
    if (status) {
      const statusLabel: Record<string, string> = {
        completed: '✅ Completed',
        in_progress: '🟢 On Track',
        pending: '⏳ Pending',
        delayed: '🔴 Delayed',
      }
      conflicts.push(`📊 ${sub.company} marked "${task.name}" as: ${statusLabel[status] ?? status}`)
    }
    if (inspection_status === 'failed') {
      conflicts.push(`❌ Inspection FAILED on "${task.name}" — builder action required.`)
    }
    if (sub_notes?.trim()) conflicts.push(`📝 Sub note on "${task.name}": "${sub_notes.trim()}"`)
    if (sub_crew_size) conflicts.push(`👷 ${sub.company} confirmed ${sub_crew_size} crew members for "${task.name}".`)
    if (sub_materials_status === 'not_ordered') conflicts.push(`📦 Materials for "${task.name}" not yet ordered — may delay start.`)
    if (sub_confirmed) conflicts.push(`✅ ${sub.company} confirmed schedule for "${task.name}".`)

    if (conflicts.length > 0) {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId, task_id: taskId,
        type: 'schedule_conflict',
        title: `🤖 Sofia: Update from ${sub.company}`,
        body: conflicts.join('\n'),
        is_read: false,
      })
    }

    return NextResponse.json({ ok: true, conflicts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
