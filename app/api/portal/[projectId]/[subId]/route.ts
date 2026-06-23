import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  sendSMS,
  smsTaskCompleted,
  smsTaskDelayed,
  smsParallelWork,
  smsInspectionFailed,
} from '@/lib/sms'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── GET ─────────────────────────────────────────────────────────────────────
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

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const {
      taskId,
      sub_start_date, sub_end_date, sub_notes,
      sub_crew_size, sub_materials_status, sub_confirmed,
      status, inspection_status,
    } = await req.json()
    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })

    // Verify sub
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, company, trade, phone')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get current task
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, start_date, end_date, task_order, status')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Get project name for SMS context
    const { data: project } = await supabaseAdmin
      .from('bf_projects').select('name').eq('id', projectId).maybeSingle()
    const projectName = project?.name ?? 'your project'

    // Build update payload
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

    // ── Read recent builder notes for Sofia context ──
    const { data: recentNotes } = await supabaseAdmin
      .from('bf_notifications')
      .select('title, body, created_at')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(5)

    // ── Downstream task lookup ──
    let downstreamSMSSent = 0
    const newStatus = status ?? task.status

    if (task.task_order !== null) {
      const { data: downstream } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name, start_date, end_date, subcontractor_phone, assigned_to, status')
        .eq('project_id', projectId)
        .gt('task_order', task.task_order)
        .not('start_date', 'is', null)
        .order('task_order', { ascending: true })
        .limit(3)

      if (downstream && downstream.length > 0) {
        const nextTask = downstream[0]
        const nextPhone = nextTask.subcontractor_phone

        if (nextPhone) {
          let smsBody: string | null = null

          if (newStatus === 'completed') {
            smsBody = smsTaskCompleted(task.name, nextTask.name, nextTask.start_date, projectName)
          } else if (newStatus === 'delayed') {
            const delayDays = sub_end_date && task.end_date
              ? Math.max(0, Math.ceil((new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000))
              : 0
            smsBody = smsTaskDelayed(task.name, nextTask.name, delayDays, nextTask.start_date, projectName)
          } else if (inspection_status === 'failed') {
            smsBody = smsInspectionFailed(task.name, projectName)
          } else if (newStatus === 'in_progress' && task.status !== 'in_progress') {
            // Task started — let downstream know their predecessor just started
            smsBody = `📋 BuildFlow — "${task.name}" has started at ${projectName}. Get ready: "${nextTask.name}" follows. Reply HELP to chat with Sofia.`
          }

          if (smsBody) {
            await sendSMS(nextPhone, smsBody)
            downstreamSMSSent++
          }
        }

        // For remaining downstream tasks after a delay — shift their dates if sub_end_date extends past plan
        if (newStatus === 'delayed' && sub_end_date && task.end_date && sub_end_date > task.end_date) {
          const shiftDays = Math.ceil(
            (new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000
          )
          for (const dt of downstream.slice(1)) {
            if (!dt.start_date) continue
            const newStart = shiftDate(dt.start_date, shiftDays)
            const newEnd   = shiftDate(dt.end_date,   shiftDays)
            await supabaseAdmin.from('bf_tasks').update({ start_date: newStart, end_date: newEnd }).eq('id', dt.id)
            if (dt.subcontractor_phone) {
              await sendSMS(dt.subcontractor_phone,
                `📅 BuildFlow — Schedule update at ${projectName}: "${dt.name}" moved to ${newStart}. Previous task "${task.name}" delayed. Reply HELP for Sofia.`
              )
              downstreamSMSSent++
            }
          }
        }
      }
    }

    // ── Builder notification ──
    const conflicts: string[] = []
    const effectiveEnd = sub_end_date || task.end_date

    if (sub_end_date && task.end_date && sub_end_date > task.end_date) {
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
          if (effectiveEnd >= o.start_date && (effectiveStart ?? '9999') <= o.end_date) {
            conflicts.push(`🔀 "${task.name}" overlaps with "${o.name}" (${o.start_date}–${o.end_date}).`)
          }
        }
      }
    }

    const statusLabel: Record<string, string> = {
      completed: '✅ Completed', in_progress: '🟢 On Track',
      pending: '⏳ Pending',    delayed: '🔴 Delayed',
    }
    if (status)                       conflicts.push(`📊 ${sub.company} marked "${task.name}" as: ${statusLabel[status] ?? status}`)
    if (inspection_status === 'failed') conflicts.push(`❌ Inspection FAILED on "${task.name}" — builder action required.`)
    if (sub_notes?.trim())            conflicts.push(`📝 Sub note: "${sub_notes.trim()}"`)
    if (sub_crew_size)                conflicts.push(`👷 ${sub.company} confirmed ${sub_crew_size} crew for "${task.name}".`)
    if (sub_materials_status === 'not_ordered') conflicts.push(`📦 Materials for "${task.name}" not yet ordered.`)
    if (sub_confirmed)                conflicts.push(`✅ ${sub.company} confirmed schedule for "${task.name}".`)
    if (downstreamSMSSent > 0)        conflicts.push(`📱 Sofia notified ${downstreamSMSSent} downstream sub(s) via SMS.`)

    // Include relevant builder notes in the notification
    if (recentNotes && recentNotes.length > 0 && conflicts.length > 0) {
      const latestNote = recentNotes[0]
      conflicts.push(`📋 Latest history: ${latestNote.title} — ${latestNote.body.slice(0, 100)}`)
    }

    if (conflicts.length > 0) {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId, task_id: taskId,
        type: 'schedule_conflict',
        title: `🤖 Sofia: Update from ${sub.company}`,
        body: conflicts.join('\n'),
        is_read: false,
      })
    }

    return NextResponse.json({ ok: true, conflicts, downstreamSMSSent })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function shiftDate(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return null }
}
