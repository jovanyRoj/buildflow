import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'

// ── POST /api/korvia/assign-sub ────────────────────────────────────────────
// Called when a builder assigns a sub to a task.
// KORVIA sends the sub an SMS with their portal link asking for
// estimate + schedule. If it's a returning sub (existed in another project),
// the message specifically says "new project, send new estimate."

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { taskId, projectId, subPhone, subName, taskName, projectName } = body as {
    taskId: string; projectId: string; subPhone: string
    subName?: string; taskName?: string; projectName?: string
  }

  if (!taskId || !projectId || !subPhone) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Check if this sub has worked in any other project before
  const { data: previousTasks } = await supabaseAdmin
    .from('bf_tasks')
    .select('id')
    .eq('subcontractor_phone', subPhone)
    .neq('project_id', projectId)
    .limit(1)

  const isReturning = (previousTasks?.length ?? 0) > 0

  // Find the sub record ID for this project to build the portal URL
  const { data: subRecord } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id')
    .eq('phone', subPhone)
    .eq('project_id', projectId)
    .maybeSingle()

  if (!subRecord?.id) {
    return NextResponse.json({ ok: false, reason: 'Sub not found for this project yet' })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brivox-jovanyrojs-projects.vercel.app'
  const portalUrl = `${appUrl}/portal/${projectId}/${subRecord.id}`
  const firstName = (subName ?? '').split(' ')[0] || 'there'

  const smsText = isReturning
    ? [
        `👋 Hi ${firstName}! KORVIA here — Brivox.`,
        ``,
        `You've been added to a new project: "${projectName ?? 'New Project'}"`,
        `Task: "${taskName ?? 'Your task'}"`,
        ``,
        `Please submit your NEW estimate and work schedule using your portal:`,
        portalUrl,
      ].join('\n')
    : [
        `👋 Hi ${firstName}! KORVIA here — Brivox Construction.`,
        ``,
        `You've been assigned to "${taskName ?? 'a task'}" on project "${projectName ?? 'your project'}".`,
        ``,
        `Submit your estimate & schedule at:`,
        portalUrl,
      ].join('\n')

  const result = await sendSMS(subPhone, smsText)

  return NextResponse.json({ ok: result.ok, isReturning, portalUrl })
}
