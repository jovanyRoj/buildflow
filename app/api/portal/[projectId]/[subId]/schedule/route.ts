import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── POST — save schedule for a specific task ──────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  const body = await req.json()
  const { task_id, sub_arrival_time, sub_work_days, sub_schedule_notes } = body as {
    task_id: string
    sub_arrival_time?: string   // 'HH:MM' 24h
    sub_work_days?: string      // 'Mon,Tue,Wed,Thu,Fri'
    sub_schedule_notes?: string
  }

  if (!task_id) {
    return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  }

  // Verify task belongs to this project
  const { data: task } = await supabaseAdmin
    .from('bf_tasks')
    .select('id')
    .eq('id', task_id)
    .eq('project_id', projectId)
    .single()

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (sub_arrival_time !== undefined)   update.sub_arrival_time   = sub_arrival_time || null
  if (sub_work_days    !== undefined)   update.sub_work_days      = sub_work_days    || null
  if (sub_schedule_notes !== undefined) update.sub_schedule_notes = sub_schedule_notes || null

  const { data, error } = await supabaseAdmin
    .from('bf_tasks')
    .update(update)
    .eq('id', task_id)
    .select('id, sub_arrival_time, sub_work_days, sub_schedule_notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, task: data })
}
