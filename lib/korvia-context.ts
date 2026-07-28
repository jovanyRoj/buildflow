// ─── KORVIA Shared Project Context Builder ────────────────────────────────────
// Used by: ask-korvia, twilio/webhook, korvia/notify
// Returns a rich plain-text context block KORVIA can use to answer ANY question.

import { supabaseAdmin } from './supabase-admin'

export async function buildKorviaProjectContext(projectId: string): Promise<string> {
  const [projectRes, tasksRes, subsRes, notifRes, finRes, phasesRes] = await Promise.all([
    supabaseAdmin.from('bf_projects')
      .select('id, name, address, status, progress_percentage, start_date, estimated_end_date')
      .eq('id', projectId).single(),
    supabaseAdmin.from('bf_tasks')
      .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, assigned_to, subcontractor_phone, notes, task_order, inspection_required, inspection_status')
      .eq('project_id', projectId).order('task_order', { ascending: true }),
    supabaseAdmin.from('bf_subcontractors')
      .select('id, name, company, phone, trade').eq('project_id', projectId),
    supabaseAdmin.from('bf_notifications')
      .select('type, title, body, created_at').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('bf_project_financials')
      .select('*')
      .eq('project_id', projectId).maybeSingle(),
    supabaseAdmin.from('bf_quote_phases')
      .select('id, phase_name, budget_amount, phase_order, status')
      .eq('project_id', projectId)
      .neq('is_archived', true)
      .order('phase_order', { ascending: true }),
  ])

  const project = projectRes.data
  if (!project) return '[Project not found]'

  const tasks  = tasksRes.data ?? []
  const subs   = subsRes.data ?? []
  const notifs = notifRes.data ?? []
  const fin    = finRes.data
  const phases = phasesRes.data ?? []
  const taskIds  = tasks.map(t => t.id)
  const phaseIds = phases.map(p => p.id)
  const subBudgetMap: Record<string, number> = {}
  let totalSubQuoted = 0

  // ── Parallel: items, sub budgets, portal estimates, materials ──────────────
  const [itemsRes, sbRes, portalEstRes, matsRes] = await Promise.all([
    phaseIds.length > 0
      ? supabaseAdmin.from('bf_quote_items')
          .select('phase_id, description, item_type, estimated_amount')
          .eq('project_id', projectId)
          .in('phase_id', phaseIds)
          .neq('is_archived', true)
      : Promise.resolve({ data: [] }),
    taskIds.length > 0
      ? supabaseAdmin.from('bf_sub_budgets')
          .select('task_id, quoted_amount, approved_amount, payment_status')
          .eq('project_id', projectId)
          .in('task_id', taskIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('bf_portal_estimates')
      .select('task_id, sub_phone, amount')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('bf_materials')
      .select('quantity, unit_price, name')
      .eq('project_id', projectId),
  ])

  const allItems: any[]   = (itemsRes as any).data ?? []
  const subBudgets: any[] = (sbRes as any).data ?? []
  const portalEsts: any[] = (portalEstRes as any).data ?? []
  const materials: any[]  = (matsRes as any).data ?? []

  // Build sub-budget lookup (task_id → quoted_amount)
  for (const b of subBudgets) {
    if (b.task_id && subBudgetMap[b.task_id] === undefined) {
      subBudgetMap[b.task_id] = b.quoted_amount ?? 0
      totalSubQuoted += b.quoted_amount ?? 0
    }
  }
  // Fallback: portal estimates (task-level)
  for (const e of portalEsts) {
    if (e.task_id && subBudgetMap[e.task_id] === undefined) {
      subBudgetMap[e.task_id] = e.amount ?? 0
      totalSubQuoted += e.amount ?? 0
    }
  }

  const totalMaterials = materials.reduce((s: number, m: any) => s + (m.quantity ?? 1) * (m.unit_price ?? 0), 0)

  // Group items by phase
  const itemsByPhase: Record<string, any[]> = {}
  for (const item of allItems) {
    if (!itemsByPhase[item.phase_id]) itemsByPhase[item.phase_id] = []
    itemsByPhase[item.phase_id].push(item)
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  const total      = tasks.length
  const completed  = tasks.filter(t => t.status === 'completed')
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const delayed    = tasks.filter(t => t.status === 'delayed')
  const pending    = tasks.filter(t => ['pending', 'active'].includes(t.status))

  const taskLines = tasks.map(t => {
    const parts: string[] = [`[${t.status.toUpperCase()}] ${t.name}`]
    if (t.assigned_to) parts.push(`sub:${t.assigned_to}`)
    const dates = t.sub_start_date && t.sub_end_date
      ? `${t.sub_start_date}→${t.sub_end_date}(sub)`
      : t.start_date && t.end_date ? `${t.start_date}→${t.end_date}` : ''
    if (dates) parts.push(dates)
    if (subBudgetMap[t.id]) parts.push(`sub-est:${fmt(subBudgetMap[t.id])}`)
    if (t.inspection_required) parts.push(`inspection:${t.inspection_status ?? 'pending'}`)
    if (t.notes) parts.push(`notes:"${t.notes}"`)
    return `  • ${parts.join(' | ')}`
  })

  const subLines = subs.map((s: any) =>
    `  • ${s.company || s.name} — trade:${s.trade ?? '?'} phone:${s.phone ?? 'none'}`
  )

  const recentActivity = notifs.slice(0, 5).map((n: any) =>
    `  [${n.type}] ${n.title}: ${(n.body ?? '').slice(0, 80)}`
  )

  // ── Quote phases section ──────────────────────────────────────────────────
  const totalPhaseBudget  = phases.reduce((s: number, p: any) => s + (p.budget_amount ?? 0), 0)
  const totalKorviaItems  = allItems.reduce((s: number, i: any) => s + (i.estimated_amount ?? 0), 0)

  const phaseLines = phases.map((p: any) => {
    const pItems    = itemsByPhase[p.id] ?? []
    const itemTotal = pItems.reduce((s: number, i: any) => s + (i.estimated_amount ?? 0), 0)
    const itemSummary = pItems.length > 0
      ? pItems.map((i: any) => `${i.description} ${fmt(i.estimated_amount)}`).join(', ')
      : 'sin items'
    return `  • ${p.phase_order}. ${p.phase_name} — budget:${fmt(p.budget_amount)} | KORVIA-est:${fmt(itemTotal)} | items:[${itemSummary}]`
  })

  // ── Finance section (linked with estimates) ──────────────────────────────
  const finLines: string[] = []
  if (fin) {
    const sqft = fin.sqft ?? 0
    const costPerSqft  = fin.construction_cost_per_sqft ?? 0
    const salePerSqft  = fin.sale_price_per_sqft ?? 0
    const sqftBuild    = sqft > 0 && costPerSqft > 0 ? sqft * costPerSqft : null
    const sqftSale     = sqft > 0 && salePerSqft > 0 ? sqft * salePerSqft : null
    const buildBudget  = fin.construction_cost_budget ?? sqftBuild ?? 0
    const salePrj      = fin.sale_price_projected ?? sqftSale ?? 0

    finLines.push(`Project Type: ${fin.project_type ?? 'spec'} | Sold: ${fin.sold ? 'YES' : 'No'}`)
    if (sqft > 0)        finLines.push(`House Size: ${sqft.toLocaleString()} sqft`)
    if (buildBudget > 0) finLines.push(`Construction Budget: ${fmt(buildBudget)}`)
    if (salePrj > 0)     finLines.push(`Projected Sale Price: ${fmt(salePrj)}`)
    if (fin.sale_price_actual) finLines.push(`Actual Sale Price: ${fmt(fin.sale_price_actual)}`)
    if (fin.loan_amount) {
      const rate = fin.loan_interest_rate ? `@ ${(fin.loan_interest_rate * 100).toFixed(2)}%/yr` : ''
      finLines.push(`Construction Loan: ${fmt(fin.loan_amount)} ${rate}`)
      if (fin.loan_start_date) {
        const days = Math.floor((Date.now() - new Date(fin.loan_start_date).getTime()) / 86400000)
        const dailyCost = fin.loan_amount * ((fin.loan_interest_rate ?? 0) / 365)
        finLines.push(`Loan running ${days}d — interest accrued: ${fmt(dailyCost * days)} (${fmt(dailyCost)}/day)`)
      }
    }
    if (costPerSqft > 0) finLines.push(`Build Rate: ${fmt(costPerSqft)}/sqft${sqftBuild ? ` → total build: ${fmt(sqftBuild)}` : ''}`)
    if (salePerSqft > 0) finLines.push(`Sale Rate: ${fmt(salePerSqft)}/sqft${sqftSale ? ` → projected sale: ${fmt(sqftSale)}` : ''}`)

    // Link finance with sub estimates & KORVIA items
    finLines.push('')
    finLines.push('── ESTIMATES vs BUDGET COMPARISON ──')
    if (totalSubQuoted > 0) {
      finLines.push(`Sub-Quoted Total: ${fmt(totalSubQuoted)} / Build Budget: ${fmt(buildBudget)}`)
      if (buildBudget > 0) {
        const diff = buildBudget - totalSubQuoted
        finLines.push(`Budget Surplus/Deficit: ${diff >= 0 ? '+' : ''}${fmt(diff)} (${((totalSubQuoted/buildBudget)*100).toFixed(1)}% used)`)
      }
    }
    if (totalKorviaItems > 0) {
      finLines.push(`KORVIA Item Estimates Total: ${fmt(totalKorviaItems)} (from ${allItems.length} line items)`)
      if (buildBudget > 0) {
        const diff = buildBudget - totalKorviaItems
        finLines.push(`Items vs Budget: ${diff >= 0 ? '+' : ''}${fmt(diff)}`)
      }
    }
    if (totalMaterials > 0) finLines.push(`Materials Logged: ${fmt(totalMaterials)}`)
    if (salePrj > 0 && totalSubQuoted > 0) {
      const margin = salePrj - totalSubQuoted - totalMaterials
      const pct    = ((margin / salePrj) * 100).toFixed(1)
      finLines.push(`Projected Net Margin: ${fmt(margin)} (${pct}% of sale)`)
    }
  }

  return [
    `=== BRIVOX PROJECT KNOWLEDGE BASE ===`,
    `Project: ${project.name}`,
    `Address: ${project.address}`,
    `Status: ${project.status} | Overall Progress: ${project.progress_percentage}%`,
    `Timeline: ${project.start_date ?? '?'} → ${project.estimated_end_date ?? '?'}`,
    ``,
    `TASK SUMMARY: ${completed.length}/${total} done | ${inProgress.length} in-progress | ${delayed.length} delayed | ${pending.length} pending`,
    `Completed: ${completed.map((t: any) => t.name).join(', ') || 'none'}`,
    `In-progress: ${inProgress.map((t: any) => t.name).join(', ') || 'none'}`,
    `Delayed: ${delayed.map((t: any) => t.name).join(', ') || 'none'}`,
    ``,
    `ALL TASKS (${total}):`,
    taskLines.join('\n') || '  (no tasks yet)',
    ``,
    `REGISTERED SUBCONTRACTORS (${subs.length}):`,
    subLines.join('\n') || '  (none)',
    ...(phases.length > 0 ? [
      ``,
      `BUDGET QUOTE (${phases.length} phases | allocated:${fmt(totalPhaseBudget)} | KORVIA-items:${fmt(totalKorviaItems)} | sub-quoted:${fmt(totalSubQuoted)}):`,
      phaseLines.join('\n'),
    ] : []),
    ...(finLines.length ? [
      ``,
      `FINANCES:`,
      finLines.map((l: string) => `  ${l}`).join('\n'),
    ] : []),
    ...(recentActivity.length ? [``, `RECENT ACTIVITY:`, recentActivity.join('\n')] : []),
  ].join('\n')
}
