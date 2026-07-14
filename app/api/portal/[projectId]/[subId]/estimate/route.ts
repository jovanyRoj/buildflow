import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { projectId: string; subId: string }

// ── GET — fetch existing estimates for this sub/project ────────────────────
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, subId } = params

  // Verify sub belongs to project
  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors').select('phone').eq('id', subId).single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: estimates } = await supabaseAdmin
    .from('bf_portal_estimates')
    .select('*')
    .eq('project_id', projectId)
    .eq('sub_phone', sub.phone)
    .order('created_at', { ascending: false })

  return NextResponse.json({ estimates: estimates ?? [] })
}

// ── POST — submit or update an estimate ───────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, subId } = params
  const body = await req.json()
  const { type, task_id, amount, notes } = body as {
    type: 'project' | 'task'; task_id?: string; amount: number; notes?: string
  }

  if (!type || amount == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors').select('phone').eq('id', subId).single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Upsert: one estimate per (project, sub, type, task_id)
  const matchCols: Record<string, unknown> = {
    project_id: projectId,
    sub_phone: sub.phone,
    type,
  }
  if (type === 'task' && task_id) matchCols.task_id = task_id

  // Check for existing
  let query = supabaseAdmin
    .from('bf_portal_estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('sub_phone', sub.phone)
    .eq('type', type)
  if (type === 'task' && task_id) query = query.eq('task_id', task_id)
  else query = query.is('task_id', null)

  const { data: existing } = await query.maybeSingle()

  let result
  if (existing?.id) {
    const { data } = await supabaseAdmin
      .from('bf_portal_estimates')
      .update({ amount, notes: notes ?? null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select().single()
    result = data
  } else {
    const { data } = await supabaseAdmin
      .from('bf_portal_estimates')
      .insert({
        project_id: projectId,
        sub_phone: sub.phone,
        type,
        task_id: (type === 'task' && task_id) ? task_id : null,
        amount,
        notes: notes ?? null,
      })
      .select().single()
    result = data
  }

  return NextResponse.json({ ok: true, estimate: result })
}
