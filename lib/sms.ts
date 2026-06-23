// ─── Shared Twilio SMS helper ────────────────────────────────────────────────

export interface SMSResult { ok: boolean; error?: string }

export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    console.warn('Twilio not configured — SMS skipped to', to)
    return { ok: false, error: 'Twilio not configured' }
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
      }
    )
    if (!res.ok) {
      const errText = await res.text()
      console.error('Twilio error:', errText)
      return { ok: false, error: errText }
    }
    return { ok: true }
  } catch (e: any) {
    console.error('SMS send failed:', e)
    return { ok: false, error: e?.message ?? 'Unknown error' }
  }
}

// ─── Status change notification templates ────────────────────────────────────

export function smsTaskCompleted(
  prevTask: string, nextTask: string, nextStart: string | null, projectName: string
): string {
  const dateHint = nextStart ? ` Your start: ${nextStart}.` : ''
  return `✅ BuildFlow — "${prevTask}" is complete at ${projectName}.${dateHint} You're up next for "${nextTask}". Reply START when you begin.`
}

export function smsTaskDelayed(
  prevTask: string, nextTask: string, delayDays: number, newStart: string | null, projectName: string
): string {
  const dHint   = delayDays > 0 ? ` ${delayDays}d` : ''
  const datHint = newStart ? ` Estimated new start for you: ${newStart}.` : ''
  return `⏰ BuildFlow — "${prevTask}" is delayed${dHint} at ${projectName}.${datHint} Your task "${nextTask}" may be affected. Sofia will send an updated schedule.`
}

export function smsParallelWork(prevTask: string, nextTask: string, projectName: string): string {
  return `🔀 BuildFlow — "${prevTask}" is partially complete at ${projectName}. Sofia recommends you begin "${nextTask}" in parallel. Coordinate with the other crew on site.`
}

export function smsInspectionFailed(task: string, projectName: string): string {
  return `❌ BuildFlow — Inspection FAILED on "${task}" at ${projectName}. Contact your builder before proceeding.`
}

export function smsScheduleShifted(task: string, newStart: string, newEnd: string | null, projectName: string): string {
  const endHint = newEnd ? ` → ${newEnd}` : ''
  return `📅 BuildFlow — Schedule update at ${projectName}: "${task}" moved to ${newStart}${endHint}. Reply HELP to chat with Sofia.`
}

// ─── Legacy builder/cascade templates (used by older routes) ─────────────────

export function buildTaskNotificationSMS(
  task: { name: string; start_date?: string | null },
  project: { name: string; address?: string },
  builderName: string
): string {
  const start = task.start_date ? ` Starting: ${task.start_date}.` : ''
  return `🔨 BuildFlow — Hi! ${builderName} has assigned you "${task.name}" at ${project.name}.${start} Reply START when you begin or DELAY if needed.`
}

export function buildCascadeNotificationSMS(
  nextTask: { name: string; start_date?: string | null },
  project: { name: string },
  completedTaskName: string
): string {
  const start = nextTask.start_date ? ` Your scheduled start: ${nextTask.start_date}.` : ''
  return `✅ BuildFlow — "${completedTaskName}" is done at ${project.name}.${start} You're up next for "${nextTask.name}". Reply START when you begin.`
}

export function buildBuilderUpdateSMS(
  task: { name: string },
  project: { name: string; address?: string },
  status: string,
  subName: string
): string {
  const emoji: Record<string, string> = {
    completed: '✅', in_progress: '🔨', delayed: '⏰', pending: '⏳',
  }
  return `${emoji[status] ?? '📋'} BuildFlow — ${subName} updated "${task.name}" at ${project.name}: ${status.replace('_', ' ').toUpperCase()}.`
}
