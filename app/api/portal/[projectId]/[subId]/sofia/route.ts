import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// ── Sofia schedule-cascade system prompt ─────────────────────────────────────
const SOFIA_SCHEDULE_PROMPT = `You are Sofia, an AI construction project coordinator for BuildFlow.
A subcontractor has sent you a message about a delay or schedule issue on their task.

Your job:
1. Understand the delay reason (in English or Spanish — respond in the SAME language)
2. Extract how many days of delay (if mentioned or inferable)
3. Calculate new suggested start/end dates based on the original dates + delay
4. Decide if downstream tasks need to be postponed or can work in parallel
5. Write a concise, professional response to the subcontractor confirming what you recorded

RESPONSE FORMAT — return ONLY valid JSON, no markdown:
{
  "delay_days": <integer or 0 if not a delay>,
  "new_status": "delayed" | "in_progress" | "pending" | "completed" | null,
  "new_sub_start_date": "YYYY-MM-DD" | null,
  "new_sub_end_date": "YYYY-MM-DD" | null,
  "reason_summary": "Brief reason in English (under 100 chars)",
  "sub_reply": "Your reply to the sub — warm, bilingual, under 200 chars",
  "builder_alert": "Alert for the builder — factual, under 150 chars",
  "downstream_action": "postpone" | "parallel" | "none",
  "downstream_note": "Brief note for downstream subs (under 120 chars) — or null if none"
}

RULES:
- If delay_days > 0, new_sub_end_date = original_end_date + delay_days
- If delay_days > 0, new_sub_start_date = original_start_date + delay_days (if start has not passed)
- downstream_action = "postpone" if the delay prevents next task from starting on schedule
- downstream_action = "parallel" if tasks CAN overlap (e.g. partial completion, different areas)
- downstream_action = "none" if no downstream impact
- Keep sub_reply under 200 characters
- Always confirm what you recorded`

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
  projectName: string
): Promise<SofiaScheduleResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const userPrompt = `SUBCONTRACTOR: ${subName}
PROJECT: ${projectName}
TASK: ${taskName}
ORIGINAL START: ${originalStart ?? 'not set'}
ORIGINAL END: ${originalEnd ?? 'not set'}

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
        max_tokens: 400,
        system: SOFIA_SCHEDULE_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as SofiaScheduleResponse
  } catch {
    return null
  }
}

function addDays(dateStr: string | null, days: number): string | null {
  if (!dateStr || !days) return dateStr
  try {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { taskId, message } = await req.json()
    if (!taskId || !message?.trim()) {
      return NextResponse.json({ error: 'Missing taskId or message' }, { status: 400 })
    }

    // Verify sub access
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade')
      .eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get the task being reported on
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status, start_date, end_date, sub_start_date, sub_end_date, task_order')
      .eq('id', taskId).eq('project_id', projectId).maybeSingle()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Get project name
    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name')
      .eq('id', projectId).maybeSingle()

    // ── Ask Sofia ──
    const sofiaResult = await callSofia(
      message,
      task.name,
      task.sub_start_date || task.start_date,
      task.sub_end_date   || task.end_date,
      sub.name || sub.company,
      project?.name ?? 'the project'
    )

    // ── Fallback if Sofia is offline ──
    const isSpanish = /[áéíóúüñ¿¡]|\b(hola|gracias|retraso|días|materiales|semana)\b/i.test(message)
    const fallbackReply = isSpanish
      ? `Recibido, ${sub.name || sub.company}. Tu mensaje fue registrado y notificaré al builder.`
      : `Got it, ${sub.name || sub.company}. Your message was recorded and I'll notify your builder.`

    const reply = sofiaResult?.sub_reply ?? fallbackReply
    const delayDays = sofiaResult?.delay_days ?? 0

    // ── Update current task ──
    const taskUpdate: Record<string, unknown> = {
      sub_notes: message,
    }
    if (sofiaResult?.new_status)          taskUpdate.status          = sofiaResult.new_status
    if (sofiaResult?.new_sub_start_date)  taskUpdate.sub_start_date  = sofiaResult.new_sub_start_date
    if (sofiaResult?.new_sub_end_date)    taskUpdate.sub_end_date    = sofiaResult.new_sub_end_date
    if (delayDays > 0)                    taskUpdate.delay_days      = delayDays

    await supabaseAdmin.from('bf_tasks').update(taskUpdate).eq('id', taskId)

    // ── Cascade to downstream tasks ──
    let downstreamNotified = 0
    if (delayDays > 0 && task.task_order !== null && sofiaResult?.downstream_action === 'postpone') {
      const { data: downstreamTasks } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name, start_date, end_date, subcontractor_phone, assigned_to, status')
        .eq('project_id', projectId)
        .gt('task_order', task.task_order)
        .not('start_date', 'is', null)
        .order('task_order', { ascending: true })
        .limit(5)

      if (downstreamTasks) {
        for (const dt of downstreamTasks) {
          if (!dt.start_date) continue
          const newStart = addDays(dt.start_date, delayDays)
          const newEnd   = addDays(dt.end_date,   delayDays)

          await supabaseAdmin.from('bf_tasks').update({
            start_date: newStart,
            end_date:   newEnd,
          }).eq('id', dt.id)

          downstreamNotified++

          // SMS to downstream sub if Twilio is configured
          const downPhone = dt.subcontractor_phone
          if (downPhone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
            const smsBody = sofiaResult?.downstream_note
              ? `📅 BuildFlow — ${sofiaResult.downstream_note} Task "${dt.name}" → new start: ${newStart}.`
              : `📅 BuildFlow — Schedule update: "${dt.name}" moved ${delayDays}d. New start: ${newStart}. Prev task "${task.name}" was delayed.`

            try {
              const twilio = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
              await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${twilio}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  From: process.env.TWILIO_PHONE_NUMBER,
                  To: downPhone,
                  Body: smsBody,
                }).toString(),
              })
            } catch { /* SMS failed — non-fatal */ }
          }
        }
      }
    }

    // ── Builder notification ──
    const builderAlert = sofiaResult?.builder_alert ?? `${sub.company} reported an issue on "${task.name}".`
    const notifLines = [
      `📨 Message from ${sub.company}: "${message.slice(0, 120)}${message.length > 120 ? '…' : ''}"`,
      delayDays > 0 ? `⏰ Sofia estimated ${delayDays} day(s) delay on "${task.name}"` : null,
      sofiaResult?.reason_summary ? `📋 Reason: ${sofiaResult.reason_summary}` : null,
      downstreamNotified > 0
        ? `🔁 Sofia shifted ${downstreamNotified} downstream task(s) by ${delayDays} day(s) and notified subs`
        : null,
      sofiaResult?.downstream_action === 'parallel'
        ? `🔀 Sofia suggests parallel work is possible despite delay` : null,
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
      downstreamAction: sofiaResult?.downstream_action ?? 'none',
      newDates: {
        sub_start_date: sofiaResult?.new_sub_start_date ?? null,
        sub_end_date:   sofiaResult?.new_sub_end_date   ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
