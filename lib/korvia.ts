// ─── KORVIA AI — Construction Coordinator powered by Claude ───────────────────
// KORVIA handles incoming SMS from subcontractors and responds intelligently.

export interface KorviaContext {
  subName: string
  subPhone: string
  taskId: string
  taskName: string
  taskStatus: string
  taskStartDate: string
  taskEndDate: string
  taskNotes: string
  inspectionRequired: boolean
  projectId: string
  projectName: string
  projectAddress: string
  userId: string        // builder's user id
  // Sub portal data (what the sub committed to via their portal)
  subCommittedStart?: string | null
  subCommittedEnd?: string | null
  subNotes?: string | null
  subCrewSize?: number | null
  subMaterialsStatus?: string | null
  subConfirmed?: boolean
  subQuotedCost?: number | null
  recentPortalMessages?: { sender: string; content: string; created_at: string }[]
}

export interface SofiaResponse {
  action: 'update_status' | 'flag_blocker' | 'inspection_update' | 'answer_question' | 'no_action'
  reply: string             // SMS back to subcontractor (≤160 chars)
  newStatus?: 'in_progress' | 'completed' | 'delayed' | null
  delayDays?: number | null
  inspectionStatus?: 'passed' | 'failed' | 'scheduled' | null
  urgency: 'low' | 'high'
  builderAlert?: string | null  // forwarded to builder if urgency=high
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const KORVIA_SYSTEM_PROMPT = `You are KORVIA, an AI construction project coordinator for Brivox.
You communicate with subcontractors via SMS to track residential construction progress.

PERSONALITY:
- Professional but warm and brief (SMS format)
- Bilingual: respond in the SAME language the subcontractor uses (English or Spanish)
- Decisive: make the right call and confirm it clearly
- Proactive: if there's a blocker, flag it to the builder immediately

CAPABILITIES:
- Update task status: in_progress, completed, delayed
- Log inspection results: passed, failed, scheduled
- Flag urgent problems to the builder
- Answer questions about their task schedule

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "action": "update_status" | "flag_blocker" | "inspection_update" | "answer_question" | "no_action",
  "reply": "Your SMS reply to the sub — keep under 160 chars",
  "newStatus": "in_progress" | "completed" | "delayed" | null,
  "delayDays": <number or null>,
  "inspectionStatus": "passed" | "failed" | "scheduled" | null,
  "urgency": "low" | "high",
  "builderAlert": "Brief alert for the builder (urgency=high only), otherwise null"
}

RULES:
- urgency=high when: task is blocked, materials missing, safety issue, inspection failed, delay > 3 days
- Keep reply under 160 characters
- Always confirm what you recorded
- If message is unclear, ask ONE clarifying question`

// ─── Main function: ask KORVIA ─────────────────────────────────────────────────

export async function askKorvia(
  message: string,
  ctx: KorviaContext
): Promise<SofiaResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set — KORVIA is offline')
    return fallbackResponse(message)
  }

  const userPrompt = buildPrompt(message, ctx)

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
        max_tokens: 350,
        system: KORVIA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Claude API error:', errText)
      return fallbackResponse(message)
    }

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''

    // Strip any accidental markdown code fences
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as SofiaResponse
  } catch (e) {
    console.error('Sofia error:', e)
    return fallbackResponse(message)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(message: string, ctx: KorviaContext): string {
  const portalLines: string[] = []
  if (ctx.subCommittedStart || ctx.subCommittedEnd)
    portalLines.push(`Committed: ${ctx.subCommittedStart ?? '—'} → ${ctx.subCommittedEnd ?? '—'}`)
  if (ctx.subCrewSize)        portalLines.push(`Crew: ${ctx.subCrewSize} workers`)
  if (ctx.subMaterialsStatus) portalLines.push(`Materials: ${ctx.subMaterialsStatus}`)
  if (ctx.subConfirmed)       portalLines.push('Commitment: CONFIRMED by sub')
  if (ctx.subQuotedCost)      portalLines.push(`Quoted: $${Number(ctx.subQuotedCost).toLocaleString()}`)
  if (ctx.subNotes)           portalLines.push(`Sub note: "${ctx.subNotes}"`)

  const msgLines: string[] = []
  if (ctx.recentPortalMessages?.length) {
    msgLines.push('Recent portal messages:')
    for (const m of ctx.recentPortalMessages.slice(-5))
      msgLines.push(`  [${m.sender.toUpperCase()}]: ${m.content}`)
  }

  const portalSection = portalLines.length
    ? '\n\nPORTAL COMMITMENTS (entered by sub via portal):\n' + portalLines.join('\n')
    : ''
  const msgSection = msgLines.length ? '\n\n' + msgLines.join('\n') : ''

  return [
    `SUBCONTRACTOR INFO:`,
    `Name: ${ctx.subName || 'Unknown'}`,
    `Phone: ${ctx.subPhone}`,
    '',
    `THEIR CURRENT TASK:`,
    `Task: ${ctx.taskName}`,
    `Status: ${ctx.taskStatus}`,
    `Builder plan: ${ctx.taskStartDate} → ${ctx.taskEndDate}`,
    ctx.taskNotes ? `Builder notes: ${ctx.taskNotes}` : '',
    ctx.inspectionRequired ? 'Requires Oklahoma building inspection.' : '',
    portalSection,
    msgSection,
    '',
    `PROJECT:`,
    `${ctx.projectName}`,
    `${ctx.projectAddress}`,
    '',
    `SUBCONTRACTOR MESSAGE:`,
    `"${message}"`,
    '',
    'Respond as KORVIA.',
  ].join('\n')
}

function fallbackResponse(message: string): SofiaResponse {
  const isSpanish = /[áéíóúüñ¿¡]/i.test(message) ||
    /\b(hola|gracias|listo|trabajo|días|retraso)\b/i.test(message)

  return {
    action: 'no_action',
    reply: isSpanish
      ? 'Recibido! Responde: LISTO | EN PROGRESO | RETRASO # | AYUDA'
      : 'Got it! Reply: DONE | STARTED | DELAY # | HELP',
    urgency: 'low',
    newStatus: null,
    delayDays: null,
    inspectionStatus: null,
    builderAlert: null,
  }
}

// ─── Proactive message builder ────────────────────────────────────────────────
// Used by /api/korvia/notify to send Sofia-crafted messages proactively

export function buildKorviaTaskReminder(ctx: KorviaContext, daysUntilStart: number): string {
  const emoji = daysUntilStart === 0 ? '🔨' : '📅'
  const when = daysUntilStart === 0 ? 'TODAY' : `in ${daysUntilStart} day${daysUntilStart > 1 ? 's' : ''}`
  return `${emoji} Brivox — Hi ${ctx.subName || 'there'}!\n` +
    `Sofia here. Your task "${ctx.taskName}" at ${ctx.projectName} starts ${when}.\n` +
    `📍 ${ctx.projectAddress}\n` +
    `Reply START when you begin or DELAY if needed.`
}

export function buildKorviaInspectionReminder(ctx: KorviaContext): string {
  return `📋 Brivox Reminder — ${ctx.subName || 'Hi'}!\n` +
    `"${ctx.taskName}" requires an Oklahoma inspection before proceeding.\n` +
    `Reply: INSPECTION SCHEDULED | INSPECTION PASSED | INSPECTION FAILED`
}
