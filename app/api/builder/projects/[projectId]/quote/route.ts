import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  // ── Load house template ───────────────────────────────────────────────────
  if (action === 'load_template') {
    // Get or create quote
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

    // Delete existing phases to avoid duplicates
    await supabaseAdmin.from('bf_quote_phases').delete().eq('quote_id', quote.id)

    // Insert all template phases + items
    for (const phase of HOUSE_TEMPLATE) {
      const { data: phaseRow, error: phaseErr } = await supabaseAdmin
        .from('bf_quote_phases')
        .insert({
          quote_id: quote.id,
          project_id: projectId,
          phase_name: phase.phase_name,
          phase_order: phase.phase_order,
          budget_amount: phase.budget_amount,
          quoted_total: 0,
          approved_total: 0,
          status: 'under_budget',
        })
        .select().single()
      if (phaseErr || !phaseRow) continue

      if (phase.items.length > 0) {
        await supabaseAdmin.from('bf_quote_items').insert(
          phase.items.map(item => ({
            phase_id: phaseRow.id,
            project_id: projectId,
            item_type: item.item_type,
            description: item.description,
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

  // ── Add an item to a phase ────────────────────────────────────────────────
  if (action === 'add_item') {
    const { data, error } = await supabaseAdmin
      .from('bf_quote_items')
      .insert({ ...rest, project_id: projectId })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  // ── Update phase ──────────────────────────────────────────────────────────
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

  // ── Delete phase ──────────────────────────────────────────────────────────
  if (action === 'delete_phase') {
    await supabaseAdmin.from('bf_quote_phases').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // ── Delete item ───────────────────────────────────────────────────────────
  if (action === 'delete_item') {
    await supabaseAdmin.from('bf_quote_items').delete().eq('id', rest.id).eq('project_id', projectId)
    return NextResponse.json({ ok: true })
  }

  // ── Update quote header ───────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('bf_project_quote')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, quote: data })
}
