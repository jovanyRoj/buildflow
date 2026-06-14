import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { askSofia, SofiaContext } from '@/lib/sofia'
import { sendSMS } from '@/lib/sms'

// ─── POST /api/twilio/webhook ─────────────────────────────────────────────────
// Twilio calls this when a subcontractor texts the BuildFlow number.

export async function POST(req: NextRequest) {
  let twimlReply = ''

  try {
    const form = await req.formData()
    const from: string = (form.get('From') as string) ?? ''
    const body: string = (form.get('Body') as string) ?? ''

    console.log(`[Sofia] SMS from ${from}: "${body}"`)

    // 1. Look up active task for this phone number
    const ctx = await getContextForPhone(from)

    if (!ctx) {
      // Unknown number — Sofia responds generically
      twimlReply = 'Hi! This is BuildFlow. We don\'t have an active task for your number. ' +
        'Contact your builder for access.'
    } else {
      // 2. Ask Sofia (Claude AI)
      const sofia = await askSofia(body, ctx)
      console.log('[Sofia] Response:', sofia)

      // 3. Execute action in Supabase
      if (sofia.action === 'update_status' && sofia.newStatus && ctx.taskId) {
        await updateTaskStatus(ctx, sofia.newStatus, sofia.delayDays ?? 0)
      }
      if (sofia.action === 'inspection_update' && sofia.inspectionStatus && ctx.taskId) {
        await updateInspection(ctx, sofia.inspectionStatus)
      }

      // 4. Log notification in app
      await logNotification(ctx, sofia)

      // 5. Alert builder via SMS if high urgency
      if (sofia.urgency === 'high' && sofia.builderAlert) {
        await notifyBuilder(ctx, sofia.builderAlert)
      }

      twimlReply = sofia.reply
    }
  } catch (e: any) {
    console.error('[Sofia] Webhook error:', e)
    twimlReply = 'BuildFlow received your message. We\'ll follow up shortly.'
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${escapeXml(twimlReply)}</Message></Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ─── Supabase lookups ─────────────────────────────────────────────────────────

async function getContextForPhone(phone: string): Promise<SofiaContext | null> {
  // Normalize phone for comparison
  const normalized = phone.replace(/\D/g, '')

  // Find task assigned to this phone
  const { data: tasks } = await supabaseAdmin
    .from('bf_tasks')
    .select(`
      id, project_id, name, status, start_date, end_date, notes,
      inspection_required, assigned_to, subcontractor_phone,
      bf_projects!inner(id, name, address, user_id)
    `)
    .or(`subcontractor_phone.eq.${phone},subcontractor_phone.eq.+${normalized}`)
    .in('status', ['pending', 'active', 'in_progress', 'delayed'])
    .order('task_order', { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return null

  const task = tasks[0]
  const project = (task as any).bf_projects

  // Look up sub name
  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('name')
    .or(`phone.eq.${phone},phone.eq.+${normalized}`)
    .limit(1)
    .maybeSingle()

  return {
    subName: sub?.name ?? task.assigned_to ?? '',
    subPhone: phone,
    taskId: task.id,
    taskName: task.name,
    taskStatus: task.status,
    taskStartDate: task.start_date,
    taskEndDate: task.end_date,
    taskNotes: task.notes ?? '',
    inspectionRequired: task.inspection_required ?? false,
    projectId: project.id,
    projectName: project.name,
    projectAddress: project.address,
    userId: project.user_id,
  }
}

// ─── Task updates ─────────────────────────────────────────────────────────────

async function updateTaskStatus(
  ctx: SofiaContext,
  newStatus: string,
  delayDays: number
) {
  const updates: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }

  if (newStatus === 'completed') {
    updates.sms_last_sent = new Date().toISOString()
  }

  await supabaseAdmin
    .from('bf_tasks')
    .update(updates)
    .eq('id', ctx.taskId)

  // Log history
  await supabaseAdmin.from('bf_history').insert({
    id: crypto.randomUUID(),
    project_id: ctx.projectId,
    task_id: ctx.taskId,
    type: 'statusChange',
    description: `"${ctx.taskName}" → ${newStatus} (via SMS by ${ctx.subName || 'sub'})`,
    previous_value: ctx.taskStatus,
    new_value: newStatus,
    created_at: new Date().toISOString(),
  })
}

async function updateInspection(ctx: SofiaContext, inspectionStatus: string) {
  await supabaseAdmin
    .from('bf_tasks')
    .update({ inspection_status: inspectionStatus, updated_at: new Date().toISOString() })
    .eq('id', ctx.taskId)

  await supabaseAdmin.from('bf_history').insert({
    id: crypto.randomUUID(),
    project_id: ctx.projectId,
    task_id: ctx.taskId,
    type: 'inspectionUpdate',
    description: `"${ctx.taskName}" inspection: ${inspectionStatus.toUpperCase()} (via SMS)`,
    new_value: inspectionStatus,
    created_at: new Date().toISOString(),
  })
}

async function logNotification(ctx: SofiaContext, sofia: any) {
  const icons: Record<string, string> = {
    update_status: sofia.newStatus === 'completed' ? '✅' : sofia.newStatus === 'delayed' ? '⚠️' : '🔨',
    flag_blocker: '🚨',
    inspection_update: sofia.inspectionStatus === 'passed' ? '✅' : '📋',
    answer_question: '💬',
    no_action: '📩',
  }

  await supabaseAdmin.from('bf_notifications').insert({
    id: crypto.randomUUID(),
    project_id: ctx.projectId,
    task_id: ctx.taskId,
    type: sofia.urgency === 'high' ? 'alert' : 'subcontractor',
    title: `${icons[sofia.action] ?? '📩'} ${ctx.subName || 'Sub'} — ${ctx.taskName}`,
    body: sofia.builderAlert ?? sofia.reply,
    is_read: false,
    created_at: new Date().toISOString(),
  })
}

async function notifyBuilder(ctx: SofiaContext, alertMessage: string) {
  // Get builder's phone from bf_users (if stored)
  const { data: user } = await supabaseAdmin
    .from('bf_users')
    .select('phone')
    .eq('id', ctx.userId)
    .maybeSingle()

  if (user?.phone) {
    await sendSMS(
      user.phone,
      `🚨 BuildFlow Alert — ${ctx.projectName}\n${alertMessage}\n📋 Task: ${ctx.taskName}`
    )
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
