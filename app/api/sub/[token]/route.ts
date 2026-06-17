import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS, buildBuilderUpdateSMS } from '@/lib/sms'

// GET — load task + project info by portalToken
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const { data: taskRow, error } = await supabaseAdmin
      .from('bf_tasks')
      .select('*')
      .eq('portal_token', token)
      .maybeSingle()

    if (error || !taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: projectRow } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, user_id')
      .eq('id', taskRow.project_id)
      .maybeSingle()

    if (!projectRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get builder phone (optional — for SMS notifications)
    const { data: userRow } = await supabaseAdmin
      .from('bf_users')
      .select('name')
      .eq('id', projectRow.user_id)
      .maybeSingle()

    return NextResponse.json({
      task: {
        id: taskRow.id,
        name: taskRow.name,
        status: taskRow.status,
        startDate: taskRow.start_date,
        endDate: taskRow.end_date,
        durationDays: taskRow.duration_days,
        assignedTo: taskRow.assigned_to ?? '',
        notes: taskRow.notes ?? '',
        inspectionRequired: taskRow.inspection_required ?? false,
        inspectionStatus: taskRow.inspection_status ?? 'not_required',
        inspectionNotes: taskRow.inspection_notes ?? '',
        delayDays: taskRow.delay_days ?? 0,
        portalToken: token,
      },
      project: {
        id: projectRow.id,
        name: projectRow.name,
        address: projectRow.address,
      },
      builderName: userRow?.name ?? 'Builder',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — subcontractor submits update
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const body = await req.json()
    const { status, inspectionStatus, inspectionNotes, notes, delayDays,
      taskName, projectName, projectAddress, subName, builderPhone } = body

    // Find task by portalToken
    const { data: taskRow } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, project_id, status')
      .eq('portal_token', token)
      .maybeSingle()

    if (!taskRow) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Update task in DB
    await supabaseAdmin.from('bf_tasks').update({
      status,
      inspection_status: inspectionStatus ?? null,
      inspection_notes: inspectionNotes ?? null,
      notes: notes || undefined,
      delay_days: status === 'delayed' ? (delayDays ?? 1) : 0,
      updated_at: new Date().toISOString(),
    }).eq('id', taskRow.id)

    // History entry
    await supabaseAdmin.from('bf_history').insert({
      id: crypto.randomUUID(),
      project_id: taskRow.project_id,
      task_id: taskRow.id,
      type: 'statusChange',
      description: `"${taskName}" updated by subcontractor → ${status}`,
      previous_value: taskRow.status ?? null,
      new_value: status,
      created_at: new Date().toISOString(),
    })

    // Notification for builder
    await supabaseAdmin.from('bf_notifications').insert({
      id: crypto.randomUUID(),
      project_id: taskRow.project_id,
      task_id: taskRow.id,
      type: 'subcontractor',
      title: `${taskName}: ${status}`,
      body: `${subName || 'Subcontractor'} updated status${notes ? ': ' + notes : ''}`,
      is_read: false,
      created_at: new Date().toISOString(),
    })

    // SMS to builder if phone provided
    if (builderPhone) {
      await sendSMS(
        builderPhone,
        buildBuilderUpdateSMS(
          { name: taskName } as any,
          { name: projectName, address: projectAddress } as any,
          status, subName ?? 'Subcontractor'
        )
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[sub/token POST]', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
