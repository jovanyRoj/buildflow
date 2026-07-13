import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('bf_inspections')
    .select('*')
    .eq('project_id', projectId)
    .order('inspection_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspections: data ?? [] })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('bf_inspections')
    .insert({ ...body, project_id: projectId })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If failed inspection, create a notification and notify assigned sub via SMS
  if (body.result === 'failed' && body.task_id) {
    const { data: task } = await supabaseAdmin
      .from('bf_tasks')
      .select('name, sub_phone')
      .eq('id', body.task_id)
      .maybeSingle()

    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle()

    // Create builder notification
    await supabaseAdmin.from('bf_notifications').insert({
      project_id: projectId,
      task_id: body.task_id,
      type: 'inspection',
      title: `❌ Inspection Failed — ${task?.name ?? 'Task'}`,
      body: `Inspection type: ${body.inspection_type}. ${body.correction_required ? `Correction required: ${body.correction_required}` : ''}`,
      is_read: false,
    })

    // SMS to assigned sub if phone available
    if (task?.sub_phone) {
      await sendSMS(
        task.sub_phone,
        `Brivox ❌ INSPECTION FAILED\nProject: ${project?.name ?? projectId}\nTask: ${task.name}\n${body.correction_required ? `Fix required: ${body.correction_required}` : ''}\nReinspection: ${body.reinspection_date ?? 'TBD'}`
      )
    }
  }

  return NextResponse.json({ ok: true, inspection: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { id, ...updates } = body
  const { data, error } = await supabaseAdmin
    .from('bf_inspections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', projectId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inspection: data })
}
