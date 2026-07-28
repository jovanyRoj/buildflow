import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

const TRADE_KEYWORDS: Record<string, string[]> = {
  electrical:  ['electric', 'wiring', 'panel', 'outlet', 'circuit', 'lighting'],
  plumbing:    ['plumb', 'pipe', 'water', 'drain', 'sewage', 'toilet'],
  hvac:        ['hvac', 'heat', 'cool', 'air', 'ventilat', 'duct', 'mechanical'],
  framing:     ['fram', 'lumber', 'stud', 'beam', 'sheathing'],
  concrete:    ['concret', 'foundation', 'flatwork', 'slab', 'footing', 'pour'],
  roofing:     ['roof', 'shingle', 'tile', 'gutter', 'fascia'],
  drywall:     ['drywall', 'sheetrock', 'gypsum', 'plaster', 'texture'],
  paint:       ['paint', 'primer', 'stain', 'coat'],
  flooring:    ['floor', 'tile', 'carpet', 'hardwood', 'laminate', 'vinyl'],
  survey:      ['survey', 'land', 'plat', 'boundary', 'stake', 'topograph'],
  surveyor:    ['survey', 'land', 'plat', 'boundary', 'stake', 'topograph'],
  excavation:  ['excavat', 'dig', 'grade', 'earthwork', 'demo', 'demolit', 'clear'],
  landscaping: ['landscap', 'lawn', 'irrigat', 'tree', 'plant', 'sod', 'fence'],
  masonry:     ['mason', 'brick', 'block', 'stone', 'mortar', 'stucco'],
  insulation:  ['insulat', 'foam', 'batts', 'spray'],
  windows:     ['window', 'door', 'glazing'],
  cabinet:     ['cabinet', 'countertop', 'millwork'],
  general:     [],
}

function getTradeKeywords(trade: string): string[] {
  const t = (trade ?? '').toLowerCase().trim()
  const parts = t.split(/[\s_-]+/)
  return TRADE_KEYWORDS[t] ?? parts.flatMap(p => TRADE_KEYWORDS[p] ?? [p])
}

/** Trade keywords appear in task name */
function tradeMatchesTask(taskName: string, sub: any): boolean {
  const kws = getTradeKeywords(sub.trade ?? '')
  if (kws.length === 0) return false
  const nl = (taskName ?? '').toLowerCase()
  return kws.some(kw => nl.includes(kw))
}

/**
 * Trade name OR trade keywords appear in assigned_to.
 * Catches: assigned_to="Surveyor" + trade="surveyor"
 * Catches: assigned_to="ABC Electric" + trade="electrical" (keyword "electric")
 */
function tradeMatchesAssignedTo(assignedTo: string, sub: any): boolean {
  const al = (assignedTo ?? '').toLowerCase().trim()
  if (!al) return false
  const tl = (sub.trade ?? '').toLowerCase().trim()
  // Direct trade name match
  if (tl && (al.includes(tl) || tl.includes(al))) return true
  // Keyword match against assigned_to (e.g. "ABC Electric" contains keyword "electric")
  const kws = getTradeKeywords(sub.trade ?? '')
  return kws.some(kw => al.includes(kw))
}

function findSub(task: any, subs: any[], subByPhone: Record<string,any>, subByCompany: Record<string,any>): any {
  // 1. Phone (most reliable)
  if (task.subcontractor_phone && subByPhone[task.subcontractor_phone])
    return subByPhone[task.subcontractor_phone]
  // 2. Exact company name
  if (task.assigned_to && subByCompany[task.assigned_to.toLowerCase().trim()])
    return subByCompany[task.assigned_to.toLowerCase().trim()]
  // 3. Trade name / keywords in assigned_to
  for (const s of subs) {
    if (tradeMatchesAssignedTo(task.assigned_to, s)) return s
  }
  // 4. Trade keywords in task name
  for (const s of subs) {
    if (tradeMatchesTask(task.name, s)) return s
  }
  return null
}

// ── GET — tasks enriched with matched sub + estimates + recent activity ──────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  try {
    const [{ data: tasks }, { data: subs }, { data: activity }] = await Promise.all([
      supabaseAdmin
        .from('bf_tasks')
        .select('id, name, status, task_order, start_date, end_date, assigned_to, subcontractor_phone, sub_start_date, sub_end_date, sub_notes, sub_crew_size, sub_confirmed, sub_materials_status, notes, inspection_required, inspection_status, delay_days')
        .eq('project_id', projectId)
        .order('task_order', { ascending: true }),
      supabaseAdmin
        .from('bf_subcontractors')
        .select('id, name, company, trade, phone, email')
        .eq('project_id', projectId),
      supabaseAdmin
        .from('bf_notifications')
        .select('id, title, body, type, task_id, created_at')
        .eq('project_id', projectId)
        .in('type', ['subcontractor', 'schedule_update', 'schedule_conflict'])
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const taskIds = (tasks ?? []).map((t: any) => t.id)

    // Fetch estimate amounts so Sync Board can display builder vs sub in real-time
    const subBudgetMap: Record<string, number> = {}
    const portalEstMap: Record<string, number> = {}
    const quoteItemMap: Record<string, number> = {}

    if (taskIds.length > 0) {
      const [sbRes, peRes, qiRes] = await Promise.all([
        supabaseAdmin
          .from('bf_sub_budgets')
          .select('task_id, quoted_amount')
          .eq('project_id', projectId)
          .in('task_id', taskIds),
        supabaseAdmin
          .from('bf_portal_estimates')
          .select('task_id, amount')
          .eq('project_id', projectId)
          .eq('type', 'task')
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('bf_quote_items')
          .select('task_id, estimated_amount')
          .eq('project_id', projectId)
          .in('task_id', taskIds),
      ])
      for (const b of sbRes.data ?? []) {
        if (b.task_id && !subBudgetMap[b.task_id]) subBudgetMap[b.task_id] = b.quoted_amount
      }
      for (const e of peRes.data ?? []) {
        if (e.task_id && !portalEstMap[e.task_id]) portalEstMap[e.task_id] = e.amount
      }
      for (const q of qiRes.data ?? []) {
        if (q.task_id) quoteItemMap[q.task_id] = (quoteItemMap[q.task_id] ?? 0) + (q.estimated_amount ?? 0)
      }
    }

    // Fallback: ALL estimates with null task_id (type='project' + orphaned type='task' null task_id)
    const projEstByPhone: Record<string, number> = {}
    const projEstsRes = await supabaseAdmin
      .from('bf_portal_estimates')
      .select('sub_phone, amount')
      .eq('project_id', projectId)
      .is('task_id', null)
      .order('created_at', { ascending: false })
    for (const e of projEstsRes.data ?? []) {
      if (e.sub_phone && projEstByPhone[e.sub_phone] === undefined) {
        projEstByPhone[e.sub_phone] = e.amount
      }
    }

    const subByPhone: Record<string, any> = {}
    const subByCompany: Record<string, any> = {}
    for (const s of subs ?? []) {
      if (s.phone)   subByPhone[s.phone] = s
      if (s.company) subByCompany[s.company.toLowerCase().trim()] = s
    }

    const enriched = (tasks ?? []).map((t: any) => {
      const matchedSub = findSub(t, subs ?? [], subByPhone, subByCompany)
      const subPhone   = t.subcontractor_phone || matchedSub?.phone || null
      const projFallback = subPhone ? (projEstByPhone[subPhone] ?? null) : null
      return {
        ...t,
        sub: matchedSub,
        // Priority: bf_sub_budgets → task-level portal estimate → project-level portal estimate
        sub_estimate_amount:     subBudgetMap[t.id] ?? portalEstMap[t.id] ?? projFallback ?? null,
        builder_estimate_amount: quoteItemMap[t.id] ?? null,
      }
    })

    return NextResponse.json({
      tasks: enriched,
      activity: activity ?? [],
      lastUpdated: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST — KORVIA re-sync: persist best matches to DB ──────────────────────
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  try {
    const [{ data: tasks }, { data: subs }] = await Promise.all([
      supabaseAdmin.from('bf_tasks')
        .select('id, name, assigned_to, subcontractor_phone')
        .eq('project_id', projectId),
      supabaseAdmin.from('bf_subcontractors')
        .select('id, name, company, trade, phone')
        .eq('project_id', projectId),
    ])

    if (!tasks || !subs || subs.length === 0)
      return NextResponse.json({ ok: true, updated: 0, message: 'No subs registered' })

    const subByPhone: Record<string, any> = {}
    const subByCompany: Record<string, any> = {}
    for (const s of subs) {
      if (s.phone)   subByPhone[s.phone] = s
      if (s.company) subByCompany[s.company.toLowerCase().trim()] = s
    }

    let updated = 0
    const assignments: { taskId: string; company: string; phone: string }[] = []

    for (const task of tasks) {
      // If already matched to a valid registered sub, skip
      const alreadyMatched = task.subcontractor_phone && subByPhone[task.subcontractor_phone]
      if (alreadyMatched) continue

      const matched = findSub(task, subs, subByPhone, subByCompany)
      if (matched) {
        assignments.push({ taskId: task.id, company: matched.company, phone: matched.phone })
      }
    }

    for (const a of assignments) {
      await supabaseAdmin.from('bf_tasks')
        .update({ assigned_to: a.company, subcontractor_phone: a.phone })
        .eq('id', a.taskId)
      updated++
    }

    if (updated > 0) {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId, type: 'subcontractor',
        title: `🤖 KORVIA re-sync: ${updated} task(s) linked to registered subs`,
        body: assignments.map(a => `"${a.company}" linked to task`).join('; '),
        is_read: false,
      })
    }

    return NextResponse.json({ ok: true, updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
