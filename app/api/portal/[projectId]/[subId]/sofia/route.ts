import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS, smsTaskDelayed, smsParallelWork, smsScheduleShifted } from '@/lib/sms'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

const SOFIA_SCHEDULE_PROMPT = `You are Sofia, an AI construction project coordinator for Brivox.
A subcontractor has sent you a message about a delay or issue on their task.
You have access to the task schedule and recent builder notifications for context.

Your job:
1. Understand the delay reason (respond in the SAME language as the sub)
2. Extract how many days of delay (if mentioned or inferable)
3. Calculate new dates: original + delay_days
4. Decide if downstream tasks should be postponed or can work in parallel
5. Reply warmly to the sub confirming what you recorded
6. Write a concise builder alert

RESPONSE FORMAT — return ONLY valid JSON, no markdown:
{
  "delay_days": <integer, 0 if no delay>,
  "new_status": "delayed" | "in_progress" | "pending" | "completed" | null,
  "new_sub_start_date": "YYYY-MM-DD" | null,
  "new_sub_end_date": "YYYY-MM-DD" | null,
  "reason_summary": "Brief English reason (under 100 chars)",
  "sub_reply": "Reply to sub — warm, same language, under 200 chars",
  "builder_alert": "Factual builder alert, under 150 chars",
  "downstream_action": "postpone" | "parallel" | "none",
  "downstream_note": "Note for downstream subs (under 120 chars) or null"
}

RULES:
- delay_days > 0: new_sub_end_date = original_end + delay_days; new_sub_start_date = original_start + delay_days
- downstream_action="postpone": next task cannot start until this one finishes
- downstream_action="parallel": tasks CAN overlap (different areas, partial completion possible)
- downstream_action="none": no downstream impact
- If the issue is external (supplier, weather, inspection fail) emphasize urgency in builder_alert`

interface SofiaScheduleResponse {
  delay_days: number
  new_status: string | null
  new_sub_start_date: string | null
  new_sub_end_date: string | null
  reason_summary: string
  sub_reply: string
  builder_alert: string
  downstream_action: 'postpone' | 'parallel' | 'none'
  downstream_note: string | null
}

async function callSofia(
  message: string,
  taskName: string,
  originalStart: string | null,
  originalEnd: string | null,
  subName: string,
  projectName: string,
  builderNotes: string
): Promise<SofiaScheduleResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const userPrompt = `SUBCONTRACTOR: ${subName}
PROJECT: ${projectName}
TASK: ${taskName}
ORIGINAL SCHEDULE: ${originalStart ?? 'TBD'} → ${originalEnd ?? 'TBD'}

RECENT BUILDER NOTES FOR THIS TASK:
${builderNotes || '(none)'}

MESSAGE FROM SUBCONTRACTOR:
"${message}"

Analyze and respond as Sofia.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 450,
        system: SOFIA_SCHEDULE_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as SofiaScheduleResponse
  } catch { return null }
}

function shiftDate(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr || !days) return dateStr ?? null
  try {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return null }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { taskId, message } = await req.json()
    if (!taskId || !message?.trim()) {
      return NextResponse.json({ error: 'Missing taskId or message' }, { status: 400 })
    }

    // Verify sub
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get task
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, task_order')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Get project
    const { data: project } = await supabaseAdmin
      .from('bf_projects').select('id, name').eq('id', projectId).maybeSingle()
    const projectName = project?.name ?? 'the project'

    // ── Fetch recent builder notes for Sofia context ──
    const { data: recentNotifs } = await supabaseAdmin
      .from('bf_notifications')
      .select('title, body, created_at')
      .eq('project_id', projectId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(5)

    const builderNotes = recentNotifs
      ?.map(n => `[${new Date(n.created_at).toLocaleDateString()}] ${n.title}: ${n.body.slice(0, 150)}`)
      .join('\n') ?? ''

    // ── Call Sofia with full context ──
    const sofiaResult = await callSofia(
      message,
      task.name,
      task.sub_start_date || task.start_date,
      task.sub_end_date   || task.end_date,
      sub.name || sub.company,
      projectName,
      builderNotes
    )

    const isSpanish = /[áéíóúüñ¿¡]|\b(hola|gracias|retraso|días|materiales|semana|proveedor|problema)\b/i.test(message)
    const fallbackReply = isSpanish
      ? `Recibido, ${sub.name || sub.company}. Tu mensaje fue registrado y el builder fue notificado.`
      : `Got it, ${sub.name || sub.company}. Your message was recorded and your builder has been notified.`

    const reply = sofiaResult?.sub_reply ?? fallbackReply
    const delayDays = sofiaResult?.delay_days ?? 0

    // ── Update current task ──
    const taskUpdate: Record<string, unknown> = { sub_notes: message }
    if (sofiaResult?.new_status)         taskUpdate.status         = sofiaResult.new_status
    if (sofiaResult?.new_sub_start_date) taskUpdate.sub_start_date = sofiaResult.new_sub_start_date
    if (sofiaResult?.new_sub_end_date)   taskUpdate.sub_end_date   = sofiaResult.new_sub_end_date
    if (delayDays > 0)                   taskUpdate.delay_days     = delayDays

    await supabaseAdmin.from('bf_tasks').update(taskUpdate).eq('id', taskId)

    // ── Get downstream tasks ──
    let downstreamNotified = 0
    const downstreamAction = sofiaResult?.downstream_action ?? 'none'

    if (task.task_order !== null && downstreamAction !== 'none') {
      const { data: downstreamTasks } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name, start_date, end_date, subcontractor_phone, assigned_to')
        .eq('project_id', projectId)
        .gt('task_order', task.task_order)
        .not('start_date', 'is', null)
        .order('task_order', { ascending: true })
        .limit(5)

      if (downstreamTasks) {
        for (let i = 0; i < downstreamTasks.length; i++) {
          const dt = downstreamTasks[i]
          if (!dt.start_date) continue

          if (downstreamAction === 'postpone' && delayDays > 0) {
            // Shift dates forward
            const newStart = shiftDate(dt.start_date, delayDays)
            const newEnd   = shiftDate(dt.end_date,   delayDays)
            await supabaseAdmin.from('bf_tasks').update({
              start_date: newStart,
              end_date: newEnd,
            }).eq('id', dt.id)

            if (dt.subcontractor_phone) {
              const smsBody = i === 0 && sofiaResult?.downstream_note
                ? `📅 Brivox — ${sofiaResult.downstream_note} "${dt.name}" moved to ${newStart} at ${projectName}.`
                : smsTaskDelayed(task.name, dt.name, delayDays, newStart, projectName)
              await sendSMS(dt.subcontractor_phone, smsBody)
              downstreamNotified++
            }
          } else if (downstreamAction === 'parallel') {
            // Don't shift dates — but SMS to coordinate
            if (dt.subcontractor_phone && i === 0) {
              const smsBody = sofiaResult?.downstream_note
                ? `🔀 Brivox — ${sofiaResult.downstream_note} Coordinate with "${task.name}" team at ${projectName}.`
                : smsParallelWork(task.name, dt.name, projectName)
              await sendSMS(dt.subcontractor_phone, smsBody)
              downstreamNotified++
            }
            break // parallel only affects the immediate next task
          }
        }
      }
    }

    // ── Builder notification ──
    const builderAlert = sofiaResult?.builder_alert ?? `${sub.company} reported an issue on "${task.name}".`
    const notifLines = [
      `📨 ${sub.company}: "${message.slice(0, 120)}${message.length > 120 ? '…' : ''}"`,
      sofiaResult?.reason_summary ? `📋 Reason: ${sofiaResult.reason_summary}` : null,
      delayDays > 0 ? `⏰ ${delayDays} day(s) delay on "${task.name}"` : null,
      downstreamNotified > 0 && downstreamAction === 'postpone'
        ? `🔁 Sofia shifted ${downstreamNotified} downstream task(s) +${delayDays}d and sent SMS` : null,
      downstreamNotified > 0 && downstreamAction === 'parallel'
        ? `🔀 Sofia notified next sub to work in parallel` : null,
      builderNotes
        ? `📋 Context: ${builderNotes.split('\n')[0].slice(0, 120)}` : null,
    ].filter(Boolean)

    await supabaseAdmin.from('bf_notifications').insert({
      project_id: projectId, task_id: taskId,
      type: 'schedule_conflict',
      title: `🤖 Sofia: ${builderAlert}`,
      body: notifLines.join('\n'),
      is_read: false,
    })

    return NextResponse.json({
      ok: true,
      sofiaReply: reply,
      delayDays,
      downstreamNotified,
      downstreamAction,
      newDates: {
        sub_start_date: sofiaResult?.new_sub_start_date ?? null,
        sub_end_date:   sofiaResult?.new_sub_end_date   ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
