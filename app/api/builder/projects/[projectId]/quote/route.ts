import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params

  const { data: quote, error } = await supabaseAdmin
    .from('bf_project_quote')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!quote) return NextResponse.json({ quote: null, phases: [] })

  const { data: phases } = await supabaseAdmin
    .from('bf_quote_phases')
    .select('*, bf_quote_items(*)')
    .eq('quote_id', quote.id)
    .order('phase_order')

  return NextResponse.json({ quote, phases: phases ?? [] })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('bf_project_quote')
    .upsert({ ...body, project_id: projectId, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, quote: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { action, ...rest } = body

  // Add a phase
  if (action === 'add_phase') {
    const { data: quote } = await supabaseAdmin
      .from('bf_project_quote')
      .select('id')
      .eq('project_id', projectId)
      .single()
    if (!quote) return NextResponse.json({ error: 'No quote found' }, { status: 404 })
    const { data, error } = await supabaseAdmin
      .from('bf_quote_phases')
      .insert({ ...rest, quote_id: quote.id, project_id: projectId })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, phase: data })
  }

  // Add an item to a phase
  if (action === 'add_item') {
    const { data, error } = await supabaseAdmin
      .from('bf_quote_items')
      .insert({ ...rest, project_id: projectId })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  // Update phase
  if (action === 'update_phase') {
    const { id, ...updates } = rest
    const { data, error } = await supabaseAdmin
      .from('bf_quote_phases')
      .update(updates)
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, phase: data })
  }

  // Delete phase
  if (action === 'delete_phase') {
    await supabaseAdmin.from('bf_quote_phases').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // Delete item
  if (action === 'delete_item') {
    await supabaseAdmin.from('bf_quote_items').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // Update quote header
  const { data, error } = await supabaseAdmin
    .from('bf_project_quote')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, quote: data })
}
