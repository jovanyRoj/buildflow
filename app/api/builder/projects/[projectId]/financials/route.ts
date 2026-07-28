import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('bf_project_financials')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Interest accrued
  let interestAccrued = 0
  let dailyInterestCost = 0
  if (data?.loan_amount && data?.loan_interest_rate && data?.loan_start_date) {
    const start = new Date(data.loan_start_date)
    const today = new Date()
    const daysElapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000))
    dailyInterestCost = data.loan_amount * (data.loan_interest_rate / 365)
    interestAccrued = dailyInterestCost * daysElapsed
  }

  // Sub estimates
  const { data: subBudgets } = await supabaseAdmin
    .from('bf_sub_budgets')
    .select('task_id, sub_id, quoted_amount, approved_amount, sub_proposed_amount, final_agreed_amount, payment_status, builder_notes')
    .eq('project_id', projectId)
  const totalSubQuoted   = (subBudgets ?? []).reduce((s, b) => s + (b.quoted_amount  ?? 0), 0)
  const totalSubApproved  = (subBudgets ?? []).reduce((s, b) => s + (b.approved_amount ?? 0), 0)
  const totalSubProposed  = (subBudgets ?? []).reduce((s, b) => s + (b.sub_proposed_amount ?? 0), 0)
  const totalFinalAgreed  = (subBudgets ?? []).reduce((s, b) => s + (b.final_agreed_amount ?? 0), 0)

  // Materials
  const { data: mats } = await supabaseAdmin
    .from('bf_materials').select('quantity, unit_price').eq('project_id', projectId)
  const totalMaterials = (mats ?? []).reduce((s, m) => s + m.quantity * m.unit_price, 0)

  // ── Sqft-based calculations ──────────────────────────────────────
  const sqft = data?.sqft ?? 0
  const sqftConstructionCost =
    sqft > 0 && data?.construction_cost_per_sqft
      ? Math.round(sqft * data.construction_cost_per_sqft * 100) / 100
      : null
  const sqftSalePrice =
    sqft > 0 && data?.sale_price_per_sqft
      ? Math.round(sqft * data.sale_price_per_sqft * 100) / 100
      : null
  const sqftMargin =
    sqftSalePrice !== null && sqftConstructionCost !== null
      ? Math.round((sqftSalePrice - sqftConstructionCost) * 100) / 100
      : null

  // Real margin: use sale_price_projected as income baseline (sqft or manual)
  const incomeRef = sqftSalePrice ?? data?.sale_price_projected ?? 0
  const realMargin =
    incomeRef > 0
      ? Math.round((incomeRef - totalSubQuoted - totalMaterials - interestAccrued) * 100) / 100
      : null
  const realMarginPct =
    incomeRef > 0 && realMargin !== null
      ? Math.round((realMargin / incomeRef) * 10000) / 100
      : null

  return NextResponse.json({
    financials: data,
    computed: {
      interestAccrued:     Math.round(interestAccrued * 100) / 100,
      dailyInterestCost:   Math.round(dailyInterestCost * 100) / 100,
      totalSubQuoted,
      totalSubApproved,
      totalSubProposed,
      totalFinalAgreed,
      totalMaterials:      Math.round(totalMaterials * 100) / 100,
      projectedMargin: data
        ? (data.sale_price_projected ?? 0) - (data.construction_cost_budget ?? 0) - interestAccrued
        : 0,
      sqftConstructionCost,
      sqftSalePrice,
      sqftMargin,
      realMargin,
      realMarginPct,
    },
    subBudgets: subBudgets ?? [],
  })
}

// Strips system fields before writing to DB
function cleanBody(body: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, project_id: _pid, created_at: _ca, updated_at: _ua, ...rest } = body
  return rest
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const clean = cleanBody(body)
  const { data, error } = await supabaseAdmin
    .from('bf_project_financials')
    .upsert(
      { ...clean, project_id: projectId, updated_at: new Date().toISOString() },
      { onConflict: 'project_id' }
    )
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, financials: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const clean = cleanBody(body)
  const { data, error } = await supabaseAdmin
    .from('bf_project_financials')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, financials: data })
}
