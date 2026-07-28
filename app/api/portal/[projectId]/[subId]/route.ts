import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  sendSMS,
  smsTaskCompleted,
  smsTaskDelayed,
  smsParallelWork,
  smsInspectionFailed,
} from '@/lib/sms'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade, email')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()

    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, status, start_date, estimated_end_date')
      .eq('id', projectId).maybeSingle()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const taskSelect = 'id, name, status, start_date, end_date, sub_start_date, sub_end_date, sub_notes, sub_crew_size, sub_materials_status, sub_confirmed, notes, portal_token, delay_days, inspection_required, inspection_status, task_order, sub_arrival_time, sub_work_days, sub_schedule_notes, assigned_to, subcontractor_phone'

    // Fetch ALL project tasks in one query — filter client-side with fuzzy matching
    // This avoids exact-name-match failures (e.g. "Smith LLC" vs "Smith Construction LLC")
    const { data: allProjectTasks } = await supabaseAdmin
      .from('bf_tasks')
      .select(taskSelect)
      .eq('project_id', projectId)
      .order('task_order', { ascending: true })

    // ── Fuzzy match helper ──────────────────────────────────────────────────
    const STOP = new Set(['llc','inc','co','corp','ltd','the','and','de','el','la',
      'construction','contracting','company','group','services','solutions'])

    function normWords(s: string): string[] {
      return (s ?? '').toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP.has(w))
    }

    function fuzzyCompanyMatch(assignedTo: string, company: string): boolean {
      if (!assignedTo || !company) return false
      const aWords = normWords(assignedTo)
      const cWords = new Set(normWords(company))
      // At least one significant word must be shared
      return aWords.some(w => cWords.has(w))
    }

    const subPhone   = (sub.phone   ?? '').trim()
    const subCompany = (sub.company ?? '').trim()
    const subTrade   = (sub.trade   ?? '').toLowerCase().trim()

    // A task belongs to this sub if:
    // 1. Phone is an exact match (set by KORVIA or builder)
    // 2. assigned_to fuzzy-matches the sub's company name
    // 3. assigned_to contains the sub's trade name (e.g. assigned_to="Surveyor", trade="surveyor")
    function taskBelongsToSub(t: any): boolean {
      if (subPhone && t.subcontractor_phone === subPhone) return true
      if (subCompany && fuzzyCompanyMatch(t.assigned_to, subCompany)) return true
      if (subTrade && t.assigned_to &&
          (t.assigned_to.toLowerCase().includes(subTrade) || subTrade.includes(t.assigned_to.toLowerCase().trim())))
        return true
      return false
    }

    const tasks = (allProjectTasks ?? []).filter(taskBelongsToSub)

    const { data: files } = await supabaseAdmin
      .from('bf_project_files')
      .select('id, name, category, file_url, file_size, file_type, uploaded_at, task_id, uploaded_by_sub, notes')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    // Fetch existing sub budgets (quoted costs) for this sub
    const taskIds = tasks.map((t: any) => t.id)
    let subBudgets: Record<string, number> = {}
    let subApproved: Record<string, number> = {}
    if (taskIds.length > 0) {
      const { data: budgets } = await supabaseAdmin
        .from('bf_sub_budgets')
        .select('task_id, quoted_amount, approved_amount')
        .eq('sub_id', subId)
        .in('task_id', taskIds)
      for (const b of budgets ?? []) {
        if (b.task_id) {
          if (b.quoted_amount != null)  subBudgets[b.task_id]  = b.quoted_amount
          if (b.approved_amount != null) subApproved[b.task_id] = b.approved_amount
        }
      }
    }

    // Merge quoted cost into task objects
    const enrichedTasks = tasks.map((t: any) => ({
      ...t,
      sub_quoted_cost:    subBudgets[t.id]  ?? null,
      sub_approved_amount: subApproved[t.id] ?? null,
    }))

    // Fetch portal messages
    let portalMessages: any[] = []
    try {
      const { data: msgs } = await supabaseAdmin
        .from('bf_portal_messages')
        .select('id, sender, content, created_at')
        .eq('project_id', projectId)
        .eq('sub_id', subId)
        .order('created_at', { ascending: true })
        .limit(100)
      portalMessages = msgs ?? []
    } catch {}

    return NextResponse.json({
      project,
      sub,
      tasks: enrichedTasks,
      allTasks: (allProjectTasks ?? []).map((t: any) => ({ id: t.id, name: t.name, task_order: t.task_order })),
      files: files ?? [],
      messages: portalMessages,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const body = await req.json()
    const {
      action,
      taskId: _taskIdCamel,
      task_id: _taskIdSnake,
      sub_start_date, sub_end_date, sub_notes,
      sub_crew_size, sub_materials_status, sub_confirmed,
      status, inspection_status, sub_quoted_cost,
      // schedule-specific fields
      sub_date_schedule, sub_schedule_notes, sub_work_days, sub_arrival_time,
    } = body
    // Accept both camelCase (taskId) and snake_case (task_id)
    const taskId = _taskIdCamel || _taskIdSnake

    // ── Handle schedule update (no taskId required) ───────────────────────────
    if (action === 'update_schedule') {
      const { data: sub } = await supabaseAdmin
        .from('bf_subcontractors')
        .select('id, company, phone')
        .eq('id', subId).eq('project_id', projectId).maybeSingle()
      if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

      await supabaseAdmin.from('bf_subcontractors').update({
        sub_date_schedule:  sub_date_schedule  ?? null,
        sub_schedule_notes: sub_schedule_notes ?? null,
        sub_work_days:      sub_work_days      ?? null,
        sub_arrival_time:   sub_arrival_time   ?? null,
      }).eq('id', subId)

      // Sync earliest/latest schedule dates onto all tasks for this sub
      if (sub_date_schedule && Object.keys(sub_date_schedule).length > 0) {
        const sorted    = Object.keys(sub_date_schedule).sort()
        const firstDate = sorted[0]
        const lastDate  = sorted[sorted.length - 1]

        // Update sub_start_date / sub_end_date on all assigned tasks
        const orFilter = sub.phone
          ? `subcontractor_phone.eq.${sub.phone},assigned_to.eq.${sub.company}`
          : `assigned_to.eq.${sub.company}`
        await supabaseAdmin.from('bf_tasks')
          .update({ sub_start_date: firstDate, sub_end_date: lastDate })
          .eq('project_id', projectId)
          .or(orFilter)

        await supabaseAdmin.from('bf_notifications').insert({
          project_id: projectId, type: 'schedule_update',
          title: `📅 ${sub.company} updated their schedule`,
          body: `${sorted.length} day(s) planned: ${firstDate} → ${lastDate}. Notes: ${sub_schedule_notes || 'none'}`,
          is_read: false,
        })
      }
      return NextResponse.json({ ok: true })
    }

    // ── Handle date update ────────────────────────────────────────────────────
    if (action === 'update_dates') {
      if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
      const { data: sub } = await supabaseAdmin
        .from('bf_subcontractors')
        .select('id, company, phone')
        .eq('id', subId).eq('project_id', projectId).maybeSingle()
      if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

      const { data: task } = await supabaseAdmin
        .from('bf_tasks').select('id, name')
        .eq('id', taskId).eq('project_id', projectId).maybeSingle()

      await supabaseAdmin.from('bf_tasks')
        .update({ sub_start_date: sub_start_date || null, sub_end_date: sub_end_date || null })
        .eq('id', taskId)

      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId, task_id: taskId, type: 'schedule_update',
        title: `📅 ${sub.company} set dates for "${task?.name ?? taskId}"`,
        body: `${sub_start_date || 'TBD'} → ${sub_end_date || 'TBD'}`,
        is_read: false,
      })
      return NextResponse.json({ ok: true })
    }

    if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })

    // Verify sub
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, company, trade, phone')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get current task
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, start_date, end_date, task_order, status')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Get project name for SMS context
    const { data: project } = await supabaseAdmin
      .from('bf_projects').select('name').eq('id', projectId).maybeSingle()
    const projectName = project?.name ?? 'your project'

    // Build update payload
    const updateData: Record<string, unknown> = {}
    if (sub_start_date       !== undefined) updateData.sub_start_date       = sub_start_date || null
    if (sub_end_date         !== undefined) updateData.sub_end_date         = sub_end_date   || null
    if (sub_notes            !== undefined) updateData.sub_notes            = sub_notes      || null
    if (sub_crew_size        !== undefined) updateData.sub_crew_size        = sub_crew_size  || null
    if (sub_materials_status !== undefined) updateData.sub_materials_status = sub_materials_status || null
    if (sub_confirmed        !== undefined) updateData.sub_confirmed        = sub_confirmed
    if (status               !== undefined) updateData.status               = status
    if (inspection_status    !== undefined) updateData.inspection_status    = inspection_status

    await supabaseAdmin.from('bf_tasks').update(updateData).eq('id', taskId)

    // ── Save sub quoted cost + KORVIA budget comparison ──────────────────────
    let budgetAlerts: string[] = []
    if (sub_quoted_cost !== undefined && sub_quoted_cost !== null && sub_quoted_cost !== '') {
      const amount = parseFloat(String(sub_quoted_cost))
      if (!isNaN(amount) && amount > 0) {
        // Upsert into bf_sub_budgets
        await supabaseAdmin.from('bf_sub_budgets').upsert(
          { task_id: taskId, sub_id: subId, project_id: projectId, quoted_amount: amount },
          { onConflict: 'task_id,sub_id' }
        )

        // Look up estimated amount from quote items for this task
        const { data: quoteItems } = await supabaseAdmin
          .from('bf_quote_items')
          .select('estimated_amount, phase_id')
          .eq('task_id', taskId)
          .eq('project_id', projectId)
          .limit(5)

        if (quoteItems && quoteItems.length > 0) {
          const estimatedTotal = quoteItems.reduce((s, i) => s + (i.estimated_amount ?? 0), 0)
          const variance = amount - estimatedTotal
          const variancePct = estimatedTotal > 0 ? Math.round((variance / estimatedTotal) * 100) : 0
          const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

          if (variance > 0) {
            budgetAlerts.push(
              `💰 KORVIA — Budget Alert: ${sub.company} quoted ${fmt(amount)} for "${task.name}". ` +
              `This is ${fmt(variance)} (+${variancePct}%) OVER the estimate of ${fmt(estimatedTotal)}. Review required.`
            )
          } else if (variance < 0) {
            budgetAlerts.push(
              `✅ KORVIA — Budget: ${sub.company} quoted ${fmt(amount)} for "${task.name}". ` +
              `${fmt(Math.abs(variance))} (${Math.abs(variancePct)}%) UNDER estimate of ${fmt(estimatedTotal)}. Looking good!`
            )
          } else {
            budgetAlerts.push(
              `✅ KORVIA — Budget: ${sub.company} quoted ${fmt(amount)} for "${task.name}", exactly on estimate.`
            )
          }
        } else {
          // No quote items linked — just record the cost with no comparison
          const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
          budgetAlerts.push(
            `💵 ${sub.company} submitted a quote of ${fmt(amount)} for "${task.name}". (No estimate on file for comparison yet.)`
          )
        }

        // Check phase-level budget across all items in the same phase
        if (quoteItems && quoteItems.length > 0) {
          const phaseId = quoteItems[0].phase_id
          if (phaseId) {
            const { data: phase } = await supabaseAdmin
              .from('bf_quote_phases')
              .select('phase_name, budget_amount')
              .eq('id', phaseId)
              .maybeSingle()

            if (phase) {
              // Sum all quote items in this phase to estimate phase total
              const { data: allPhaseItems } = await supabaseAdmin
                .from('bf_quote_items')
                .select('estimated_amount, task_id')
                .eq('phase_id', phaseId)
                .eq('project_id', projectId)

              // Also sum all sub quoted costs for tasks in this phase
              const phaseTaskIds = (allPhaseItems ?? []).map(i => i.task_id).filter(Boolean) as string[]
              let totalSubQuoted = amount // start with what we just received
              if (phaseTaskIds.length > 0) {
                const { data: otherSubBudgets } = await supabaseAdmin
                  .from('bf_sub_budgets')
                  .select('quoted_amount, task_id')
                  .in('task_id', phaseTaskIds)
                  .eq('project_id', projectId)
                for (const b of otherSubBudgets ?? []) {
                  if (b.task_id !== taskId) totalSubQuoted += (b.quoted_amount ?? 0)
                }
              }

              const phaseVariance = totalSubQuoted - phase.budget_amount
              const phasePct = phase.budget_amount > 0 ? Math.round((phaseVariance / phase.budget_amount) * 100) : 0
              const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

              if (Math.abs(phaseVariance) > 500) {
                const direction = phaseVariance > 0 ? 'OVER' : 'under'
                budgetAlerts.push(
                  `🏗️ Phase "${phase.phase_name}": subs quoted ${fmt(totalSubQuoted)} vs ${fmt(phase.budget_amount)} budget — ` +
                  `${fmt(Math.abs(phaseVariance))} (${Math.abs(phasePct)}%) ${direction}.`
                )
              }
            }
          }
        }
      }
    }

    // ── Read recent builder notes for KORVIA context ──
    const { data: recentNotes } = await supabaseAdmin
      .from('bf_notifications')
      .select('title, body, created_at')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(5)

    // ── Downstream task lookup ──
    let downstreamSMSSent = 0
    const newStatus = status ?? task.status

    if (task.task_order !== null) {
      const { data: downstream } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name, start_date, end_date, subcontractor_phone, assigned_to, status')
        .eq('project_id', projectId)
        .gt('task_order', task.task_order)
        .not('start_date', 'is', null)
        .order('task_order', { ascending: true })
        .limit(3)

      if (downstream && downstream.length > 0) {
        const nextTask = downstream[0]
        const nextPhone = nextTask.subcontractor_phone

        if (nextPhone) {
          let smsBody: string | null = null

          if (newStatus === 'completed') {
            smsBody = smsTaskCompleted(task.name, nextTask.name, nextTask.start_date, projectName)
          } else if (newStatus === 'delayed') {
            const delayDays = sub_end_date && task.end_date
              ? Math.max(0, Math.ceil((new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000))
              : 0
            smsBody = smsTaskDelayed(task.name, nextTask.name, delayDays, nextTask.start_date, projectName)
          } else if (inspection_status === 'failed') {
            smsBody = smsInspectionFailed(task.name, projectName)
          } else if (newStatus === 'in_progress' && task.status !== 'in_progress') {
            smsBody = `📋 Brivox — "${task.name}" has started at ${projectName}. Get ready: "${nextTask.name}" follows. Reply HELP to chat with KORVIA.`
          }

          if (smsBody) {
            try { await sendSMS(nextPhone, smsBody) } catch {}
            downstreamSMSSent++
            // Mirror SMS to sub's portal messages
            try {
              const { data: nextSub } = await supabaseAdmin
                .from('bf_subcontractors').select('id')
                .eq('project_id', projectId).eq('phone', nextPhone).maybeSingle()
              if (nextSub) {
                await supabaseAdmin.from('bf_portal_messages').insert({
                  project_id: projectId, sub_id: nextSub.id, sender: 'korvia', content: smsBody,
                })
              }
            } catch {}
          }
        }

        // For remaining downstream tasks after a delay — shift their dates
        if (newStatus === 'delayed' && sub_end_date && task.end_date && sub_end_date > task.end_date) {
          const shiftDays = Math.ceil(
            (new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000
          )
          for (const dt of downstream.slice(1)) {
            if (!dt.start_date) continue
            const newStart = shiftDate(dt.start_date, shiftDays)
            const newEnd   = shiftDate(dt.end_date,   shiftDays)
            await supabaseAdmin.from('bf_tasks').update({ start_date: newStart, end_date: newEnd }).eq('id', dt.id)
            if (dt.subcontractor_phone) {
              const shiftMsg = `📅 Brivox — Schedule update at ${projectName}: "${dt.name}" moved to ${newStart}. Previous task "${task.name}" delayed. Reply HELP for KORVIA.`
              try { await sendSMS(dt.subcontractor_phone, shiftMsg) } catch {}
              downstreamSMSSent++
              // Mirror SMS to sub's portal messages
              try {
                const { data: shiftSub } = await supabaseAdmin
                  .from('bf_subcontractors').select('id')
                  .eq('project_id', projectId).eq('phone', dt.subcontractor_phone).maybeSingle()
                if (shiftSub) {
                  await supabaseAdmin.from('bf_portal_messages').insert({
                    project_id: projectId, sub_id: shiftSub.id, sender: 'korvia', content: shiftMsg,
                  })
                }
              } catch {}
            }
          }
        }
      }
    }

    // ── Builder notification ──
    const conflicts: string[] = [...budgetAlerts]
    const effectiveEnd = sub_end_date || task.end_date

    if (sub_end_date && task.end_date && sub_end_date > task.end_date) {
      const delay = Math.ceil((new Date(sub_end_date).getTime() - new Date(task.end_date).getTime()) / 86400000)
      conflicts.push(`⚠️ "${task.name}" is ${delay} day(s) past builder's plan (${task.end_date} → ${sub_end_date}).`)
    }

    if (effectiveEnd) {
      const { data: others } = await supabaseAdmin
        .from('bf_tasks').select('id, name, start_date, end_date')
        .eq('project_id', projectId).neq('id', taskId).not('start_date', 'is', null)
      if (others) {
        const effectiveStart = sub_start_date || task.start_date
        for (const o of others) {
          if (!o.start_date || !o.end_date) continue
          if (effectiveEnd >= o.start_date && (effectiveStart ?? '9999') <= o.end_date) {
            conflicts.push(`🔀 "${task.name}" overlaps with "${o.name}" (${o.start_date}–${o.end_date}).`)
          }
        }
      }
    }

    const statusLabel: Record<string, string> = {
      completed: '✅ Completed', in_progress: '🟢 On Track',
      pending: '⏳ Pending',    delayed: '🔴 Delayed',
    }
    if (status)                       conflicts.push(`📊 ${sub.company} marked "${task.name}" as: ${statusLabel[status] ?? status}`)
    if (inspection_status === 'failed') conflicts.push(`❌ Inspection FAILED on "${task.name}" — builder action required.`)
    if (sub_notes?.trim())            conflicts.push(`📝 Sub note: "${sub_notes.trim()}"`)
    if (sub_crew_size)                conflicts.push(`👷 ${sub.company} confirmed ${sub_crew_size} crew for "${task.name}".`)
    if (sub_materials_status === 'not_ordered') conflicts.push(`📦 Materials for "${task.name}" not yet ordered.`)
    if (sub_confirmed)                conflicts.push(`✅ ${sub.company} confirmed schedule for "${task.name}".`)
    if (downstreamSMSSent > 0)        conflicts.push(`📱 KORVIA notified ${downstreamSMSSent} downstream sub(s) via SMS.`)

    if (recentNotes && recentNotes.length > 0 && conflicts.length > 0) {
      const latestNote = recentNotes[0]
      conflicts.push(`📋 Latest history: ${latestNote.title} — ${latestNote.body.slice(0, 100)}`)
    }

    if (conflicts.length > 0) {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId, task_id: taskId,
        type: 'schedule_conflict',
        title: `🤖 KORVIA: Update from ${sub.company}`,
        body: conflicts.join('\n'),
        is_read: false,
      })
    }

    // ── SMS builder when sub changes their dates ───────────────────────────
    const datesChanged = (sub_start_date !== undefined || sub_end_date !== undefined)
    if (datesChanged) {
      const { data: builder } = await supabaseAdmin
        .from('bf_users').select('name, phone').eq('id',
          (await supabaseAdmin.from('bf_projects').select('user_id').eq('id', projectId).single()).data?.user_id ?? ''
        ).maybeSingle()

      if (builder?.phone) {
        const fmt = (d: string) => {
          try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return d }
        }
        const newStart = sub_start_date || task.start_date
        const newEnd   = sub_end_date   || task.end_date
        const builderSms = [
          `📅 KORVIA — Schedule Update`,
          `Project: ${projectName}`,
          `Task: "${task.name}"`,
          `Sub: ${sub.company}`,
          `New dates: ${fmt(newStart)} → ${fmt(newEnd)}`,
          sub_notes?.trim() ? `Note: "${sub_notes.trim()}"` : null,
        ].filter(Boolean).join('\n')
        try { await sendSMS(builder.phone, builderSms) } catch {}
      }

      // ── SMS parallel subs (overlapping date window) ──────────────────────
      const effectiveStart = sub_start_date || task.start_date
      const effectiveEnd2  = sub_end_date   || task.end_date
      if (effectiveStart && effectiveEnd2) {
        const { data: parallelTasks } = await supabaseAdmin
          .from('bf_tasks')
          .select('id, name, start_date, end_date, subcontractor_phone, assigned_to')
          .eq('project_id', projectId)
          .neq('id', taskId)
          .not('subcontractor_phone', 'is', null)
          .lte('start_date', effectiveEnd2)
          .gte('end_date', effectiveStart)
          .limit(5)

        for (const pt of parallelTasks ?? []) {
          if (!pt.subcontractor_phone) continue
          const parallelSms = [
            `📅 KORVIA — Heads up from Brivox`,
            `A parallel trade ("${task.name}" — ${sub.company}) at ${projectName} has updated their schedule.`,
            `Their new window: ${effectiveStart} → ${effectiveEnd2}.`,
            `This overlaps with your task: "${pt.name}".`,
            `Coordinate with your builder if needed. Reply HELP to chat with KORVIA.`,
          ].join('\n')
          try { await sendSMS(pt.subcontractor_phone, parallelSms) } catch {}
          downstreamSMSSent++
          // Mirror to portal messages
          try {
            const { data: ptSub } = await supabaseAdmin.from('bf_subcontractors')
              .select('id').eq('project_id', projectId).eq('phone', pt.subcontractor_phone).maybeSingle()
            if (ptSub) {
              await supabaseAdmin.from('bf_portal_messages').insert({
                project_id: projectId, sub_id: ptSub.id, sender: 'korvia', content: parallelSms,
              })
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({ ok: true, conflicts, downstreamSMSSent })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { action, content } = await req.json()

    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, company, name, phone')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    if (action === 'send_message') {
      if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

      const { data: msg } = await supabaseAdmin
        .from('bf_portal_messages')
        .insert({ project_id: projectId, sub_id: subId, sender: 'sub', content: content.trim() })
        .select('id, sender, content, created_at').single()

      const korviaText = `Got it, ${sub.company}! Your message has been forwarded to the builder. If this involves a schedule change or delay, please also update your task status in the Tasks tab. — 🤖 KORVIA`
      const { data: korviaMsg } = await supabaseAdmin
        .from('bf_portal_messages')
        .insert({ project_id: projectId, sub_id: subId, sender: 'korvia', content: korviaText })
        .select('id, sender, content, created_at').single()

      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId,
        type: 'subcontractor',
        title: `💬 ${sub.company} sent a portal message`,
        body: content.trim(),
        is_read: false,
      })

      return NextResponse.json({ ok: true, message: msg, korviaReply: korviaMsg })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function shiftDate(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return null }
}
