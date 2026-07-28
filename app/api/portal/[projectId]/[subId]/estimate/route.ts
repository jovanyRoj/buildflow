import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── GET — fetch existing estimates for this sub/project ────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params

  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors').select('phone').eq('id', subId).single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: estimates } = await supabaseAdmin
    .from('bf_portal_estimates')
    .select('*')
    .eq('project_id', projectId)
    .eq('sub_phone', sub.phone)
    .order('created_at', { ascending: false })

  const taskIds = (estimates ?? []).filter((e: any) => e.task_id).map((e: any) => e.task_id)
  const approvedMap: Record<string, number> = {}
  const proposedMap: Record<string, number> = {}
  const proposedAtMap: Record<string, string> = {}

  if (taskIds.length > 0) {
    const { data: budgets } = await supabaseAdmin
      .from('bf_sub_budgets')
      .select('task_id, approved_amount, sub_proposed_amount, sub_proposed_at')
      .eq('sub_id', subId)
      .in('task_id', taskIds)

    for (const b of budgets ?? []) {
      if (!b.task_id) continue
      if (b.approved_amount != null)     approvedMap[b.task_id]   = b.approved_amount
      if (b.sub_proposed_amount != null) proposedMap[b.task_id]   = b.sub_proposed_amount
      if (b.sub_proposed_at)             proposedAtMap[b.task_id] = b.sub_proposed_at
    }
  }

  const enriched = (estimates ?? []).map((e: any) => ({
    ...e,
    approved_amount:     e.task_id ? (approvedMap[e.task_id]   ?? null) : null,
    sub_proposed_amount: e.task_id ? (proposedMap[e.task_id]   ?? null) : null,
    sub_proposed_at:     e.task_id ? (proposedAtMap[e.task_id] ?? null) : null,
  }))

  return NextResponse.json({ estimates: enriched })
}

// ── PATCH — sub submits counter-proposal ──────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  const body = await req.json()
  const { task_id, proposed_amount } = body as {
    task_id: string; proposed_amount: number
  }

  if (!task_id || proposed_amount == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors').select('phone, company, name').eq('id', subId).single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const company = (sub as any).company || (sub as any).name || (sub as any).phone

  // Upsert sub_proposed_amount into bf_sub_budgets
  const now = new Date().toISOString()
  const { data: existing } = await supabaseAdmin
    .from('bf_sub_budgets')
    .select('id')
    .eq('project_id', projectId)
    .eq('task_id', task_id)
    .eq('sub_id', subId)
    .maybeSingle()

  if (existing?.id) {
    await supabaseAdmin.from('bf_sub_budgets')
      .update({ sub_proposed_amount: proposed_amount, sub_proposed_at: now })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('bf_sub_budgets')
      .insert({ project_id: projectId, task_id, sub_id: subId,
        sub_proposed_amount: proposed_amount, sub_proposed_at: now })
  }

  // Notify builder via bf_portal_messages + bf_notifications
  try {
    const msgContent = `💬 ${company} propone $${Math.round(proposed_amount).toLocaleString()} para esta tarea. Por favor revisa y confirma el monto acordado.`

    await supabaseAdmin.from('bf_portal_messages').insert({
      project_id: projectId,
      sub_id: subId,
      sender: 'korvia',
      content: msgContent,
    })

    await supabaseAdmin.from('bf_notifications').insert({
      project_id: projectId,
      task_id,
      type: 'budget_agreed',
      title: `💬 Contra-propuesta de ${company}: $${Math.round(proposed_amount).toLocaleString()}`,
      body: `El sub propone este monto. Revisa en Budget & Costs para confirmar.`,
      is_read: false,
    })
  } catch (_) {
    // Non-critical
  }

  return NextResponse.json({ ok: true })
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

  try {
    const { data: subRecord } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('company, name')
      .eq('id', subId)
      .maybeSingle()
    const company = subRecord?.company || subRecord?.name || sub.phone

    await supabaseAdmin.from('bf_notifications').insert({
      project_id: projectId,
      type: 'subcontractor',
      title: `💰 New estimate from ${company}: $${Math.round(amount).toLocaleString()}`,
      body: notes ? `Notes: ${notes}` : 'Estimate submitted via sub portal',
      task_id: (type === 'task' && task_id) ? task_id : null,
      is_read: false,
    })

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
  } catch (_) { }

  return NextResponse.json({ ok: true, estimate: result })
}
