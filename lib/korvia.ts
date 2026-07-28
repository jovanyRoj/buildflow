// ─── KORVIA AI — Construction Coordinator powered by Claude ───────────────────
// Handles incoming SMS from subs + proactive outbound messages.

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
  userId: string
  // Sub portal data
  subCommittedStart?: string | null
  subCommittedEnd?: string | null
  subNotes?: string | null
  subCrewSize?: number | null
  subMaterialsStatus?: string | null
  subConfirmed?: boolean
  subQuotedCost?: number | null
  recentPortalMessages?: { sender: string; content: string; created_at: string }[]
  // Full project context from korvia-context.ts (all tasks, all subs, estimates)
  allProjectContext?: string | null
}

export interface KorviaResponse {
  action: 'update_status' | 'flag_blocker' | 'inspection_update' | 'answer_question' | 'no_action'
  reply: string
  newStatus?: 'in_progress' | 'completed' | 'delayed' | null
  delayDays?: number | null
  inspectionStatus?: 'passed' | 'failed' | 'scheduled' | null
  urgency: 'low' | 'high'
  builderAlert?: string | null
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const KORVIA_SYSTEM_PROMPT = `You are KORVIA, an AI construction project coordinator for Brivox.
You communicate with subcontractors via SMS. You have access to the full project database.

PERSONALITY:
- Professional, warm, and brief (SMS format)
- Bilingual: respond in the SAME language the sub uses (English or Spanish)
- Decisive: make the right call and confirm it clearly
- Proactive: if there's a blocker, flag it to the builder

CAPABILITIES:
- Update task status: in_progress, completed, delayed
- Log inspection results: passed, failed, scheduled
- Flag urgent problems to the builder
- Answer questions about schedule, tasks, other subs' status

RESPONSE FORMAT — return ONLY valid JSON (no markdown, no extra text):
{
  "action": "update_status" | "flag_blocker" | "inspection_update" | "answer_question" | "no_action",
  "reply": "SMS reply to the sub — keep under 160 chars",
  "newStatus": "in_progress" | "completed" | "delayed" | null,
  "delayDays": <number or null>,
  "inspectionStatus": "passed" | "failed" | "scheduled" | null,
  "urgency": "low" | "high",
  "builderAlert": "Brief alert for the builder (only when urgency=high), otherwise null"
}

RULES:
- urgency=high when: task blocked, materials missing, safety issue, inspection failed, delay > 3 days
- Keep reply under 160 characters
- Always confirm what you recorded
- Use real task names and dates from the project data
- If message is unclear, ask ONE clarifying question`

// ─── Main function ────────────────────────────────────────────────────────────

export async function askKorvia(
  message: string,
  ctx: KorviaContext
): Promise<KorviaResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[KORVIA] ANTHROPIC_API_KEY not set')
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
        max_tokens: 400,
        system: KORVIA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      console.error('[KORVIA] API error:', res.status, await res.text())
      return fallbackResponse(message)
    }

    const data  = await res.json()
    const text  = data.content?.[0]?.text ?? ''
    if (!text) {
      console.error('[KORVIA] Empty content:', JSON.stringify(data))
      return fallbackResponse(message)
    }

    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as KorviaResponse
  } catch (e) {
    console.error('[KORVIA] Exception:', e)
    return fallbackResponse(message)
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(message: string, ctx: KorviaContext): string {
  const parts: string[] = []

  // Full project knowledge base (if available)
  if (ctx.allProjectContext) {
    parts.push(ctx.allProjectContext)
    parts.push('')
    parts.push('--- SUB SPECIFIC DATA ---')
  }

  parts.push(`SUBCONTRACTOR: ${ctx.subName || 'Unknown'} (${ctx.subPhone})`)
  parts.push(`THEIR TASK: [${ctx.taskStatus.toUpperCase()}] ${ctx.taskName}`)
  parts.push(`BUILDER PLAN: ${ctx.taskStartDate} → ${ctx.taskEndDate}`)
  if (ctx.taskNotes)          parts.push(`Builder notes: ${ctx.taskNotes}`)
  if (ctx.inspectionRequired) parts.push(`Requires building inspection.`)

  // Portal commitments
  const portal: string[] = []
  if (ctx.subCommittedStart || ctx.subCommittedEnd)
    portal.push(`Committed: ${ctx.subCommittedStart ?? '—'} → ${ctx.subCommittedEnd ?? '—'}`)
  if (ctx.subCrewSize)          portal.push(`Crew: ${ctx.subCrewSize} workers`)
  if (ctx.subMaterialsStatus)   portal.push(`Materials: ${ctx.subMaterialsStatus}`)
  if (ctx.subConfirmed)         portal.push(`Commitment: CONFIRMED`)
  if (ctx.subQuotedCost)        portal.push(`Quoted: $${Number(ctx.subQuotedCost).toLocaleString()}`)
  if (ctx.subNotes)             portal.push(`Sub note: "${ctx.subNotes}"`)
  if (portal.length) {
    parts.push('')
    parts.push('PORTAL COMMITMENTS:')
    parts.push(...portal)
  }

  // Recent messages
  if (ctx.recentPortalMessages?.length) {
    parts.push('')
    parts.push('RECENT PORTAL MESSAGES:')
    for (const m of ctx.recentPortalMessages.slice(-5))
      parts.push(`  [${m.sender.toUpperCase()}]: ${m.content}`)
  }

  if (!ctx.allProjectContext) {
    parts.push('')
    parts.push(`PROJECT: ${ctx.projectName}`)
    parts.push(`ADDRESS: ${ctx.projectAddress}`)
  }

  parts.push('')
  parts.push(`SUB MESSAGE: "${message}"`)
  parts.push('')
  parts.push('Respond as KORVIA. Return JSON only.')

  return parts.join('\n')
}

function fallbackResponse(message: string): KorviaResponse {
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

// ─── Proactive messages ───────────────────────────────────────────────────────

export function buildKorviaTaskReminder(ctx: KorviaContext, daysUntilStart: number): string {
  const emoji = daysUntilStart === 0 ? '🔨' : '📅'
  const when  = daysUntilStart === 0 ? 'TODAY' : `in ${daysUntilStart} day${daysUntilStart > 1 ? 's' : ''}`
  return `${emoji} Brivox — Hi ${ctx.subName || 'there'}!\n` +
    `KORVIA here. Your task "${ctx.taskName}" at ${ctx.projectName} starts ${when}.\n` +
    `📍 ${ctx.projectAddress}\n` +
    `Reply START when you begin or DELAY if needed.`
}

export function buildKorviaInspectionReminder(ctx: KorviaContext): string {
  return `📋 Brivox Reminder — ${ctx.subName || 'Hi'}!\n` +
    `"${ctx.taskName}" requires an Oklahoma inspection before proceeding.\n` +
    `Reply: INSPECTION SCHEDULED | INSPECTION PASSED | INSPECTION FAILED`
}
