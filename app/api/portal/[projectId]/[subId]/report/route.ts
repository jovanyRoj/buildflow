import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'

type Params = { projectId: string; subId: string }

const REPORT_LABELS: Record<string, string> = {
  material_missing:  '📦 Material Missing',
  safety_concern:    '⚠️ Safety Concern',
  schedule_conflict: '📅 Schedule Conflict',
  damage:            '🔨 Damage Found',
  other:             '📝 General Report',
}

const URGENCY_LABELS: Record<string, string> = {
  normal:    '',
  urgent:    ' 🔴 URGENT',
  emergency: ' 🆘 EMERGENCY',
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, subId } = params
  const body = await req.json()
  const { type, task_id, description, urgency = 'normal' } = body as {
    type: string; task_id?: string; description: string; urgency?: string
  }

  if (!type || !description?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Load sub + project + builder info
  const [{ data: sub }, { data: project }] = await Promise.all([
    supabaseAdmin.from('bf_subcontractors').select('name, company, phone').eq('id', subId).single(),
    supabaseAdmin.from('bf_projects').select('name, user_id').eq('id', projectId).single(),
  ])

  if (!sub || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Save report to DB
  const { data: report, error: insertErr } = await supabaseAdmin
    .from('bf_portal_reports')
    .insert({
      project_id:  projectId,
      task_id:     task_id ?? null,
      sub_phone:   sub.phone,
      type,
      description: description.trim(),
      urgency,
    })
    .select().single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Get builder's phone to notify
  const { data: builder } = await supabaseAdmin
    .from('bf_users').select('name, phone').eq('id', project.user_id).single()

  let smsSent = false
  if (builder?.phone) {
    const label   = REPORT_LABELS[type] ?? '📝 Report'
    const urg     = URGENCY_LABELS[urgency] ?? ''
    const subName = sub.company ?? sub.name ?? 'Your sub'
    const taskInfo = task_id ? await getTaskName(task_id) : null

    const sms = [
      `🤖 KORVIA — ${label}${urg}`,
      `Project: ${project.name}`,
      taskInfo ? `Task: ${taskInfo}` : null,
      `From: ${subName}`,
      ``,
      description.trim(),
      ``,
      urgency === 'emergency'
        ? `⚠️ Immediate action required. Check Brivox now.`
        : `Log into Brivox to review and respond.`,
    ].filter(Boolean).join('\n')

    const result = await sendSMS(builder.phone, sms)
    smsSent = result.ok
  }

  return NextResponse.json({ ok: true, report, smsSent })
}

async function getTaskName(taskId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('bf_tasks').select('name').eq('id', taskId).single()
  return data?.name ?? null
}
