import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// POST /api/db — server-side writes using admin client (bypasses RLS)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'upsertUser') {
      const { user } = body
      const { error } = await supabaseAdmin
        .from('bf_users')
        .upsert(
          { id: user.id, email: user.email, name: user.name, avatar: user.avatar ?? '' },
          { onConflict: 'id' }
        )
      if (error) console.error('[db/upsertUser]', error)
      return NextResponse.json({ ok: !error })
    }

    if (action === 'saveProject') {
      const { userId, project } = body
      const { error } = await supabaseAdmin.from('bf_projects').upsert({
        id: project.id,
        user_id: userId,
        name: project.name,
        address: project.address,
        project_type: project.projectType,
        start_date: project.startDate,
        estimated_end_date: project.estimatedEndDate,
        status: project.status,
        progress_percentage: project.progressPercentage,
        updated_at: new Date().toISOString(),
      })
      if (error) console.error('[db/saveProject]', error)
      return NextResponse.json({ ok: !error, error: error?.message })
    }

    if (action === 'saveTasks') {
      const { tasks } = body
      if (!tasks?.length) return NextResponse.json({ ok: true })
      const rows = tasks.map((t: any) => ({
        id: t.id, project_id: t.projectId, name: t.name,
        status: t.status, start_date: t.startDate, end_date: t.endDate,
        duration_days: t.durationDays ?? 0,
        assigned_to: t.assignedTo ?? null,
        subcontractor_phone: t.subcontractorPhone ?? null,
        notes: t.notes ?? '',
        task_order: t.order ?? 0,
        phase: t.phase ?? '',
        inspection_status: t.inspectionStatus ?? null,
        inspection_notes: t.inspectionNotes ?? null,
        portal_token: t.portalToken ?? null,
        delay_days: t.delayDays ?? 0,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabaseAdmin.from('bf_tasks').upsert(rows, { onConflict: 'id' })
      if (error) console.error('[db/saveTasks]', error)
      return NextResponse.json({ ok: !error, error: error?.message })
    }

    if (action === 'addHistory') {
      const { entries } = body
      if (!entries?.length) return NextResponse.json({ ok: true })
      const { error } = await supabaseAdmin.from('bf_history').insert(
        entries.map((h: any) => ({
          id: h.id, project_id: h.projectId, task_id: h.taskId ?? null,
          type: h.type, description: h.description,
          previous_value: h.previousValue ?? null, new_value: h.newValue ?? null,
          created_at: h.timestamp,
        }))
      )
      if (error) console.error('[db/addHistory]', error)
      return NextResponse.json({ ok: !error })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('[db/route]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
