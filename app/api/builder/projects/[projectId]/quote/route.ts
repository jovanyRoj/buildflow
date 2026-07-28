import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logAudit, diffFields, performedBy } from '@/lib/audit'
import { sendSMS } from '@/lib/sms'

type Ctx = { params: Promise<{ projectId: string }> }

// ── Complete house template phases ──────────────────────────────────────────
const HOUSE_TEMPLATE = [
  {
    phase_name: 'Site Work & Survey', phase_order: 1, budget_amount: 8500,
    items: [
      { item_type: 'labor', description: 'Land survey & staking', estimated_amount: 3500 },
      { item_type: 'labor', description: 'Site clearing & grading', estimated_amount: 5000 },
    ],
  },
  {
    phase_name: 'Foundation', phase_order: 2, budget_amount: 28000,
    items: [
      { item_type: 'labor', description: 'Excavation & footings', estimated_amount: 8000 },
      { item_type: 'material', description: 'Concrete & rebar', estimated_amount: 12000 },
      { item_type: 'labor', description: 'Foundation walls & slab pour', estimated_amount: 8000 },
    ],
  },
  {
    phase_name: 'Framing', phase_order: 3, budget_amount: 52000,
    items: [
      { item_type: 'material', description: 'Lumber package (walls, floor, roof)', estimated_amount: 28000 },
      { item_type: 'labor', description: 'Framing labor', estimated_amount: 18000 },
      { item_type: 'material', description: 'Hardware, connectors & LVL beams', estimated_amount: 6000 },
    ],
  },
  {
    phase_name: 'Roofing', phase_order: 4, budget_amount: 22000,
    items: [
      { item_type: 'material', description: 'Roof decking & shingles (30yr architectural)', estimated_amount: 12000 },
      { item_type: 'labor', description: 'Roofing labor & underlayment', estimated_amount: 8000 },
      { item_type: 'material', description: 'Gutters & downspouts', estimated_amount: 2000 },
    ],
  },
  {
    phase_name: 'Windows & Exterior Doors', phase_order: 5, budget_amount: 24000,
    items: [
      { item_type: 'material', description: 'Windows (double pane, energy star)', estimated_amount: 16000 },
      { item_type: 'material', description: 'Exterior doors (entry, garage, patio)', estimated_amount: 5000 },
      { item_type: 'labor', description: 'Installation labor', estimated_amount: 3000 },
    ],
  },
  {
    phase_name: 'Exterior / Envelope', phase_order: 6, budget_amount: 20000,
    items: [
      { item_type: 'material', description: 'Siding (hardie board or brick veneer)', estimated_amount: 12000 },
      { item_type: 'labor', description: 'Exterior siding labor', estimated_amount: 5000 },
      { item_type: 'material', description: 'Exterior trim, fascia & soffit', estimated_amount: 3000 },
    ],
  },
  {
    phase_name: 'Electrical Rough-In', phase_order: 7, budget_amount: 14000,
    items: [
      { item_type: 'labor', description: 'Electrical rough-in (panel, circuits, boxes)', estimated_amount: 9000 },
      { item_type: 'permit', description: 'Electrical permit & inspection fee', estimated_amount: 800 },
      { item_type: 'material', description: 'Wire, conduit & electrical panel', estimated_amount: 4200 },
    ],
  },
  {
    phase_name: 'Plumbing Rough-In', phase_order: 8, budget_amount: 16000,
    items: [
      { item_type: 'labor', description: 'Plumbing rough-in (supply & drain lines)', estimated_amount: 10000 },
      { item_type: 'material', description: 'PEX, PVC, fittings', estimated_amount: 4500 },
      { item_type: 'permit', description: 'Plumbing permit & inspection fee', estimated_amount: 1500 },
    ],
  },
  {
    phase_name: 'HVAC Rough-In', phase_order: 9, budget_amount: 18000,
    items: [
      { item_type: 'material', description: 'HVAC unit (3-4 ton system)', estimated_amount: 8000 },
      { item_type: 'labor', description: 'Ductwork & rough-in labor', estimated_amount: 7000 },
      { item_type: 'permit', description: 'Mechanical permit & inspection', estimated_amount: 1000 },
      { item_type: 'material', description: 'Duct insulation & registers', estimated_amount: 2000 },
    ],
  },
  {
    phase_name: 'Insulation', phase_order: 10, budget_amount: 9000,
    items: [
      { item_type: 'material', description: 'Batt insulation (walls & attic)', estimated_amount: 4000 },
      { item_type: 'labor', description: 'Insulation installation labor', estimated_amount: 3500 },
      { item_type: 'material', description: 'Spray foam (rim joists, gaps)', estimated_amount: 1500 },
    ],
  },
  {
    phase_name: 'Drywall', phase_order: 11, budget_amount: 20000,
    items: [
      { item_type: 'material', description: 'Drywall sheets & fasteners', estimated_amount: 6000 },
      { item_type: 'labor', description: 'Hang, tape, mud & texture labor', estimated_amount: 14000 },
    ],
  },
  {
    phase_name: 'Interior Paint', phase_order: 12, budget_amount: 12000,
    items: [
      { item_type: 'material', description: 'Paint, primer & supplies', estimated_amount: 3000 },
      { item_type: 'labor', description: 'Interior painting labor (2 coats)', estimated_amount: 9000 },
    ],
  },
  {
    phase_name: 'Flooring', phase_order: 13, budget_amount: 22000,
    items: [
      { item_type: 'material', description: 'LVP flooring (main areas)', estimated_amount: 9000 },
      { item_type: 'material', description: 'Tile (bathrooms & laundry)', estimated_amount: 5000 },
      { item_type: 'material', description: 'Carpet (bedrooms)', estimated_amount: 3500 },
      { item_type: 'labor', description: 'Flooring installation labor', estimated_amount: 4500 },
    ],
  },
  {
    phase_name: 'Cabinets & Countertops', phase_order: 14, budget_amount: 28000,
    items: [
      { item_type: 'material', description: 'Kitchen cabinets', estimated_amount: 12000 },
      { item_type: 'material', description: 'Bathroom vanities', estimated_amount: 4000 },
      { item_type: 'material', description: 'Granite / quartz countertops', estimated_amount: 8000 },
      { item_type: 'labor', description: 'Cabinet & countertop installation', estimated_amount: 4000 },
    ],
  },
  {
    phase_name: 'Fixtures & Appliances', phase_order: 15, budget_amount: 24000,
    items: [
      { item_type: 'material', description: 'Plumbing fixtures (toilets, sinks, faucets)', estimated_amount: 6000 },
      { item_type: 'material', description: 'Kitchen appliances (range, fridge, dishwasher)', estimated_amount: 8000 },
      { item_type: 'material', description: 'Light fixtures & ceiling fans', estimated_amount: 5000 },
      { item_type: 'labor', description: 'Fixture installation labor', estimated_amount: 5000 },
    ],
  },
  {
    phase_name: 'MEP Finals & Trim-Out', phase_order: 16, budget_amount: 14000,
    items: [
      { item_type: 'labor', description: 'Final electrical (outlets, switches, panel trim)', estimated_amount: 5000 },
      { item_type: 'labor', description: 'Final plumbing (connect fixtures, water heater)', estimated_amount: 5000 },
      { item_type: 'labor', description: 'HVAC final & startup', estimated_amount: 2500 },
      { item_type: 'permit', description: 'Final inspections (all trades)', estimated_amount: 1500 },
    ],
  },
  {
    phase_name: 'Landscaping & Exterior Finish', phase_order: 17, budget_amount: 12000,
    items: [
      { item_type: 'material', description: 'Sod & topsoil', estimated_amount: 4000 },
      { item_type: 'labor', description: 'Grading, seeding & landscaping labor', estimated_amount: 4000 },
      { item_type: 'material', description: 'Driveway (concrete or asphalt)', estimated_amount: 4000 },
    ],
  },
  {
    phase_name: 'Permits & Inspections', phase_order: 18, budget_amount: 6000,
    items: [
      { item_type: 'permit', description: 'Building permit (county / city)', estimated_amount: 3500 },
      { item_type: 'permit', description: 'Final certificate of occupancy', estimated_amount: 500 },
      { item_type: 'other', description: 'Third-party inspection fees', estimated_amount: 2000 },
    ],
  },
]

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const includeArchived = searchParams.get('include_archived') === 'true'

  const { data: quote, error } = await supabaseAdmin
    .from('bf_project_quote')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!quote) return NextResponse.json({ quote: null, phases: [] })

  let phasesQuery = supabaseAdmin
    .from('bf_quote_phases')
    .select('*, bf_quote_items(*)')
    .eq('quote_id', quote.id)
    .order('phase_order')

  if (!includeArchived) {
    // Use neq(true) instead of eq(false) so NULL rows (pre-migration) are also included
    phasesQuery = phasesQuery.neq('is_archived', true)
  }

  const { data: phases } = await phasesQuery

  // Split items into active and archived per phase
  const processedPhases = (phases ?? []).map((phase: any) => {
    const allItems = phase.bf_quote_items ?? []
    return {
      ...phase,
      bf_quote_items:  allItems.filter((i: any) => !i.is_archived),
      archived_items:  allItems.filter((i: any) =>  i.is_archived),
    }
  })

  return NextResponse.json({ quote, phases: processedPhases })
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
  const by = performedBy('user', 'builder', 'Builder')

  // ── Load house template ───────────────────────────────────────────────────
  if (action === 'load_template') {
    let quote: any
    const { data: existing } = await supabaseAdmin
      .from('bf_project_quote')
      .select('id, total_budget, contingency_pct')
      .eq('project_id', projectId)
      .maybeSingle()

    if (!existing) {
      const totalBudget = HOUSE_TEMPLATE.reduce((s, p) => s + p.budget_amount, 0)
      const { data: created, error } = await supabaseAdmin
        .from('bf_project_quote')
        .insert({ project_id: projectId, total_budget: totalBudget, contingency_pct: 10, status: 'draft' })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      quote = created
    } else {
      quote = existing
    }

    await supabaseAdmin.from('bf_quote_phases').delete().eq('quote_id', quote.id)

    for (const phase of HOUSE_TEMPLATE) {
      const { data: phaseRow, error: phaseErr } = await supabaseAdmin
        .from('bf_quote_phases')
        .insert({
          quote_id: quote.id, project_id: projectId,
          phase_name: phase.phase_name, phase_order: phase.phase_order,
          budget_amount: phase.budget_amount, quoted_total: 0,
          approved_total: 0, status: 'under_budget',
        })
        .select().single()
      if (phaseErr || !phaseRow) continue
      if (phase.items.length > 0) {
        await supabaseAdmin.from('bf_quote_items').insert(
          phase.items.map(item => ({
            phase_id: phaseRow.id, project_id: projectId,
            item_type: item.item_type, description: item.description,
            estimated_amount: item.estimated_amount,
          }))
        )
      }
    }
    return NextResponse.json({ ok: true, phasesCreated: HOUSE_TEMPLATE.length })
  }

  // ── Add a phase ───────────────────────────────────────────────────────────
  if (action === 'add_phase') {
    const { data: quote } = await supabaseAdmin
      .from('bf_project_quote').select('id').eq('project_id', projectId).single()
    if (!quote) return NextResponse.json({ error: 'No quote found' }, { status: 404 })
    const { data, error } = await supabaseAdmin
      .from('bf_quote_phases')
      .insert({ ...rest, quote_id: quote.id, project_id: projectId })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'phase', entity_id: data.id,
      entity_name: data.phase_name, action: 'created',
      new_value: { phase_name: data.phase_name, budget_amount: data.budget_amount }, ...by,
    })
    return NextResponse.json({ ok: true, phase: data })
  }

  // ── Add an item to a phase ────────────────────────────────────────────────
  if (action === 'add_item') {
    const { data, error } = await supabaseAdmin
      .from('bf_quote_items')
      .insert({ ...rest, project_id: projectId })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'item', entity_id: data.id,
      entity_name: data.description, action: 'created',
      new_value: { description: data.description, estimated_amount: data.estimated_amount, item_type: data.item_type }, ...by,
    })
    return NextResponse.json({ ok: true, item: data })
  }

  // ── Update phase ──────────────────────────────────────────────────────────
  if (action === 'update_phase') {
    const { id, ...updates } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_phases').select('*').eq('id', id).single()
    const { data, error } = await supabaseAdmin
      .from('bf_quote_phases')
      .update(updates)            // no updated_at — column doesn't exist on this table
      .eq('id', id).eq('project_id', projectId)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (prev) {
      const changed = diffFields(prev as Record<string, unknown>, data as Record<string, unknown>)
      if (Object.keys(changed).length > 0) {
        await logAudit({
          project_id: projectId, entity_type: 'phase', entity_id: id,
          entity_name: data.phase_name, action: 'updated',
          changed_fields: changed,
          previous_value: prev as Record<string, unknown>,
          new_value: data as Record<string, unknown>, ...by,
        })
      }
    }
    return NextResponse.json({ ok: true, phase: data })
  }

  // ── Update item ───────────────────────────────────────────────────────────
  if (action === 'update_item') {
    const { id, ...updates } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_items').select('*').eq('id', id).single()
    const { data, error } = await supabaseAdmin
      .from('bf_quote_items')
      .update(updates)            // no updated_at — column doesn't exist on this table
      .eq('id', id).eq('project_id', projectId)
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (prev) {
      const changed = diffFields(prev as Record<string, unknown>, data as Record<string, unknown>)
      if (Object.keys(changed).length > 0) {
        await logAudit({
          project_id: projectId, entity_type: 'item', entity_id: id,
          entity_name: data.description, action: 'updated',
          changed_fields: changed,
          previous_value: prev as Record<string, unknown>,
          new_value: data as Record<string, unknown>, ...by,
        })
      }
    }
    return NextResponse.json({ ok: true, item: data })
  }

  // ── Archive phase (soft delete) ───────────────────────────────────────────
  if (action === 'archive_phase') {
    const { id, reason } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_phases').select('*').eq('id', id).single()
    const { error } = await supabaseAdmin
      .from('bf_quote_phases')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', id).eq('project_id', projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'phase', entity_id: id,
      entity_name: prev?.phase_name, action: 'archived',
      previous_value: prev as Record<string, unknown>, reason, ...by,
    })
    return NextResponse.json({ ok: true })
  }

  // ── Restore phase ─────────────────────────────────────────────────────────
  if (action === 'restore_phase') {
    const { id } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_phases').select('*').eq('id', id).single()
    const { error } = await supabaseAdmin
      .from('bf_quote_phases')
      .update({ is_archived: false, archived_at: null })
      .eq('id', id).eq('project_id', projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'phase', entity_id: id,
      entity_name: prev?.phase_name, action: 'restored', ...by,
    })
    return NextResponse.json({ ok: true })
  }

  // ── Archive item (soft delete) ────────────────────────────────────────────
  if (action === 'archive_item') {
    const { id, reason } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_items').select('*').eq('id', id).single()
    const { error } = await supabaseAdmin
      .from('bf_quote_items')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', id).eq('project_id', projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'item', entity_id: id,
      entity_name: prev?.description, action: 'archived',
      previous_value: prev as Record<string, unknown>, reason, ...by,
    })
    return NextResponse.json({ ok: true })
  }

  // ── Restore item ──────────────────────────────────────────────────────────
  if (action === 'restore_item') {
    const { id } = rest
    const { data: prev } = await supabaseAdmin.from('bf_quote_items').select('*').eq('id', id).single()
    const { error } = await supabaseAdmin
      .from('bf_quote_items')
      .update({ is_archived: false, archived_at: null })
      .eq('id', id).eq('project_id', projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({
      project_id: projectId, entity_type: 'item', entity_id: id,
      entity_name: prev?.description, action: 'restored', ...by,
    })
    return NextResponse.json({ ok: true })
  }

  // ── Builder sets agreed amount → KORVIA notifies sub via SMS ────────────
  if (action === 'notify_sub_agreed') {
    const { task_id, sub_id, sub_phone, sub_company, phase_name, agreed_amount } = rest
    const fmt$ = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

    // Persist approved_amount
    if (task_id && sub_id) {
      await supabaseAdmin.from('bf_sub_budgets').upsert(
        { project_id: projectId, task_id, sub_id, approved_amount: agreed_amount, payment_status: 'pending' },
        { onConflict: 'task_id,sub_id' }
      )
    }

    // Send KORVIA SMS
    if (sub_phone) {
      const { data: proj } = await supabaseAdmin
        .from('bf_projects').select('name').eq('id', projectId).single()
      const projectName = proj?.name ?? 'el proyecto'
      try {
        await sendSMS(
          sub_phone,
          `KORVIA: El constructor revisó tu cotización para "${phase_name}" en ${projectName}. ` +
          `El monto acordado es ${fmt$(agreed_amount)}. Por favor revisa tu portal para confirmar.`
        )
      } catch {}
    }

    await logAudit({
      project_id: projectId, entity_type: 'phase', entity_id: task_id ?? phase_name,
      entity_name: phase_name, action: 'updated',
      new_value: { agreed_amount, sub_company, phase_name }, ...by,
    })
    return NextResponse.json({ ok: true })
  }

  // ── Hard delete phase (legacy) ────────────────────────────────────────────
  if (action === 'delete_phase') {
    await supabaseAdmin.from('bf_quote_phases').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // ── Hard delete item (legacy) ─────────────────────────────────────────────
  if (action === 'delete_item') {
    await supabaseAdmin.from('bf_quote_items').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // ── Update quote header ───────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('bf_project_quote')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, quote: data })
}
