import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── GET — fetch existing estimates for this sub/project ────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params

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
export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
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
      .update({ amount, notes: notes ?? null })
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

  // ── Side-effects after saving ─────────────────────────────────────────────
  try {
    // 1. Get subcontractor company name for the notification
    const { data: subRecord } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('company, name')
      .eq('id', subId)
      .maybeSingle()
    const company = subRecord?.company || subRecord?.name || sub.phone

    // 2. Insert bf_notifications so Sync Board activity feed sees the new estimate
    await supabaseAdmin.from('bf_notifications').insert({
      project_id: projectId,
      type: 'subcontractor',
      title: `💰 New estimate from ${company}: $${Math.round(amount).toLocaleString()}`,
      body: notes ? `Notes: ${notes}` : 'Estimate submitted via sub portal',
      task_id: (type === 'task' && task_id) ? task_id : null,
      is_read: false,
    })

    // 3. Upsert bf_sub_budgets so project-context + ask-korvia read the latest immediately
    if (type === 'task' && task_id) {
      const { data: sbExisting } = await supabaseAdmin
        .from('bf_sub_budgets')
        .select('id')
        .eq('project_id', projectId)
        .eq('task_id', task_id)
        .eq('sub_id', subId)
        .maybeSingle()

      if (sbExisting?.id) {
        await supabaseAdmin.from('bf_sub_budgets')
          .update({ quoted_amount: amount })
          .eq('id', sbExisting.id)
      } else {
        await supabaseAdmin.from('bf_sub_budgets')
          .insert({ project_id: projectId, task_id, sub_id: subId, quoted_amount: amount })
      }
    }
  } catch (_) {
    // Side-effects are non-critical — don't fail the response if they error
  }

  return NextResponse.json({ ok: true, estimate: result })
}
