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

  // Compute interest accrued server-side
  let interestAccrued = 0
  let dailyInterestCost = 0
  if (data?.loan_amount && data?.loan_interest_rate && data?.loan_start_date) {
    const start = new Date(data.loan_start_date)
    const today = new Date()
    const daysElapsed = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000))
    dailyInterestCost = data.loan_amount * (data.loan_interest_rate / 365)
    interestAccrued = dailyInterestCost * daysElapsed
  }

  // Total sub quoted
  const { data: subBudgets } = await supabaseAdmin
    .from('bf_sub_budgets')
    .select('quoted_amount, approved_amount, payment_status')
    .eq('project_id', projectId)
  const totalSubQuoted = (subBudgets ?? []).reduce((s, b) => s + (b.quoted_amount ?? 0), 0)
  const totalSubApproved = (subBudgets ?? []).reduce((s, b) => s + (b.approved_amount ?? 0), 0)

  // Total materials
  const { data: mats } = await supabaseAdmin
    .from('bf_materials')
    .select('quantity, unit_price')
    .eq('project_id', projectId)
  const totalMaterials = (mats ?? []).reduce((s, m) => s + m.quantity * m.unit_price, 0)

  return NextResponse.json({
    financials: data,
    computed: {
      interestAccrued: Math.round(interestAccrued * 100) / 100,
      dailyInterestCost: Math.round(dailyInterestCost * 100) / 100,
      totalSubQuoted,
      totalSubApproved,
      totalMaterials: Math.round(totalMaterials * 100) / 100,
      projectedMargin: data
        ? (data.sale_price_projected ?? 0) - (data.construction_cost_budget ?? 0) - interestAccrued
        : 0,
    },
    subBudgets: subBudgets ?? [],
  })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('bf_project_financials')
    .upsert({ ...body, project_id: projectId, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, financials: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('bf_project_financials')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, financials: data })
}
