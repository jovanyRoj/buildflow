// Server-side Twilio SMS service
import { Task, Project } from './types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow.vercel.app'

export async function sendSMS(to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    console.error('Twilio credentials missing')
    return { ok: false, error: 'Twilio not configured' }
  }

  // Normalize phone number to E.164
  const phone = normalizePhone(to)
  if (!phone) return { ok: false, error: 'Invalid phone number' }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: phone, Body: body }),
      }
    )
    const data = await res.json()
    if (data.sid) return { ok: true, sid: data.sid }
    return { ok: false, error: data.message ?? 'SMS failed' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 10) return `+${digits}`
  return null
}

// Build SMS message to notify subcontractor of their task
export function buildTaskNotificationSMS(task: Task, project: Project, builderName = 'Your builder'): string {
  const portalUrl = `${APP_URL}/sub/${task.portalToken}`
  const startFormatted = formatDate(task.startDate)
  const endFormatted   = formatDate(task.endDate)
  const inspection = task.inspectionRequired ? '\n⚠️ This task requires Oklahoma inspection.' : ''

  return `🏗️ BuildFlow — ${project.name}
Hi${task.assignedTo ? ` ${task.assignedTo}` : ''}! ${builderName} has assigned you:

📋 ${task.name}
📍 ${project.address}
📅 Start: ${startFormatted}
🏁 Due:   ${endFormatted}
${task.notes ? `\n📝 Notes: ${task.notes}` : ''}${inspection}

Update your status here:
${portalUrl}

Reply: START | DONE | DELAY | HELP`
}

// Build SMS for task completion → notify next subcontractor
export function buildCascadeNotificationSMS(nextTask: Task, project: Project, completedTaskName: string): string {
  const portalUrl = `${APP_URL}/sub/${nextTask.portalToken}`
  return `🏗️ BuildFlow — ${project.name}
"${completedTaskName}" is complete!

Your task is next:
📋 ${nextTask.name}
📅 Start: ${formatDate(nextTask.startDate)}
📍 ${project.address}

View details:
${portalUrl}`
}

// Build SMS to notify builder of status update
export function buildBuilderUpdateSMS(task: Task, project: Project, newStatus: string, subName: string): string {
  const statusEmoji: Record<string, string> = {
    in_progress: '🔨', delayed: '⚠️', completed: '✅',
    inspection_passed: '✅', inspection_failed: '❌',
  }
  return `BuildFlow Update — ${project.name}
${statusEmoji[newStatus] ?? '📋'} ${task.name}: ${newStatus.toUpperCase()}
By: ${subName || 'Subcontractor'}
📍 ${project.address}`
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
