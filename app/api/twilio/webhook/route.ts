import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { askKorvia, KorviaContext } from '@/lib/korvia'
import { sendSMS } from '@/lib/sms'

// ─── POST /api/twilio/webhook ─────────────────────────────────────────────────
// Twilio calls this when a subcontractor texts the Brivox number.

export async function POST(req: NextRequest) {
  let twimlReply = ''

  try {
    const form = await req.formData()
    const from: string = (form.get('From') as string) ?? ''
    const body: string = (form.get('Body') as string) ?? ''

    console.log(`[KORVIA] SMS from ${from}: "${body}"`)

    // 1. Look up active task for this phone number
    const ctx = await getContextForPhone(from)

    if (!ctx) {
      // Unknown number — KORVIA responds generically
      twimlReply = 'Hi! This is Brivox. We don\'t have an active task for your number. ' +
        'Contact your builder for access.'
    } else {
      // 2. Ask KORVIA (Claude AI)
      const korvia = await askKorvia(body, ctx)
      console.log('[KORVIA] Response:', korvia)

      // 3. Execute action in Supabase
      if (korvia.action === 'update_status' && korvia.newStatus && ctx.taskId) {
        await updateTaskStatus(ctx, korvia.newStatus, korvia.delayDays ?? 0)
      }
      if (korvia.action === 'inspection_update' && korvia.inspectionStatus && ctx.taskId) {
        await updateInspection(ctx, korvia.inspectionStatus)
      }

      // 4. Log notification in app
      await logNotification(ctx, korvia)

      // 5. Alert builder via SMS if high urgency
      if (korvia.urgency === 'high' && korvia.builderAlert) {
        await notifyBuilder(ctx, korvia.builderAlert)
      }

      twimlReply = korvia.reply
    }
  } catch (e: any) {
    console.error('[KORVIA] Webhook error:', e)
    twimlReply = 'Brivox received your message. We\'ll follow up shortly.'
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${escapeXml(twimlReply)}</Message></Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

// ─── Supabase lookups ─────────────────────────────────────────────────────────

async function getContextForPhone(phone: string): Promise<KorviaContext | null> {
  // Normalize phone for comparison
  const normalized = phone.replace(/\D/g, '')

  // Find task assigned to this phone
  const { data: tasks } = await supabaseAdmin
    .from('bf_tasks')
    .select(`
      id, project_id, name, status, start_date, end_date, notes,
      inspection_required, assigned_to, subcontractor_phone,
      sub_start_date, sub_end_date, sub_notes, sub_crew_size,
      sub_materials_status, sub_confirmed,
      bf_projects!inner(id, name, address, user_id)
    `)
    .or(`subcontractor_phone.eq.${phone},subcontractor_phone.eq.+${normalized}`)
    .in('status', ['pending', 'active', 'in_progress', 'delayed'])
    .order('task_order', { ascending: true })
    .limit(1)

  if (!tasks || tasks.length === 0) return null

  const task = tasks[0]
  const project = (task as any).bf_projects

  // Look up sub record (name + id for portal messages)
  const { data: sub } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id, name')
    .or(`phone.eq.${phone},phone.eq.+${normalized}`)
    .eq('project_id', project.id)
    .limit(1)
    .maybeSingle()

  // Fetch sub's quoted cost from bf_sub_budgets
  let subQuotedCost: number | null = null
  if (sub?.id) {
    const { data: budget } = await supabaseAdmin
      .from('bf_sub_budgets')
      .select('quoted_amount')
      .eq('task_id', task.id)
      .eq('sub_id', sub.id)
      .maybeSingle()
    subQuotedCost = budget?.quoted_amount ?? null
  }

  // Fetch recent portal messages for context
  let recentPortalMessages: { sender: string; content: string; created_at: string }[] = []
  if (sub?.id) {
    const { data: msgs } = await supabaseAdmin
      .from('bf_portal_messages')
      .select('sender, content, created_at')
      .eq('project_id', project.id)
      .eq('sub_id', sub.id)
      .order('created_at', { ascending: false })
      .limit(5)
    recentPortalMessages = (msgs ?? []).reverse()
  }

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
    // Portal data
    subCommittedStart:    task.sub_start_date ?? null,
    subCommittedEnd:      task.sub_end_date   ?? null,
    subNotes:             task.sub_notes       ?? null,
    subCrewSize:          task.sub_crew_size   ?? null,
    subMaterialsStatus:   task.sub_materials_status ?? null,
    subConfirmed:         task.sub_confirmed   ?? false,
    subQuotedCost,
    recentPortalMessages,
  }
}

// ─── Task updates ─────────────────────────────────────────────────────────────

async function updateTaskStatus(
  ctx: KorviaContext,
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

async function updateInspection(ctx: KorviaContext, inspectionStatus: string) {
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

async function logNotification(ctx: KorviaContext, korvia: any) {
  const icons: Record<string, string> = {
    update_status: korvia.newStatus === 'completed' ? '✅' : korvia.newStatus === 'delayed' ? '⚠️' : '🔨',
    flag_blocker: '🚨',
    inspection_update: korvia.inspectionStatus === 'passed' ? '✅' : '📋',
    answer_question: '💬',
    no_action: '📩',
  }

  await supabaseAdmin.from('bf_notifications').insert({
    id: crypto.randomUUID(),
    project_id: ctx.projectId,
    task_id: ctx.taskId,
    type: korvia.urgency === 'high' ? 'alert' : 'subcontractor',
    title: `${icons[korvia.action] ?? '📩'} ${ctx.subName || 'Sub'} — ${ctx.taskName}`,
    body: korvia.builderAlert ?? korvia.reply,
    is_read: false,
    created_at: new Date().toISOString(),
  })
}

async function notifyBuilder(ctx: KorviaContext, alertMessage: string) {
  // Get builder's phone from bf_users (if stored)
  const { data: user } = await supabaseAdmin
    .from('bf_users')
    .select('phone')
    .eq('id', ctx.userId)
    .maybeSingle()

  if (user?.phone) {
    await sendSMS(
      user.phone,
      `🚨 Brivox Alert — ${ctx.projectName}\n${alertMessage}\n📋 Task: ${ctx.taskName}`
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
