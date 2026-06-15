import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

// GET /api/join/[projectId] — public: returns project info for the form
export async function GET(_req: NextRequest, { params }: { params: { projectId: string } }) {
  const { data: project } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, address')
    .eq('id', params.projectId)
    .single()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project })
}

// POST /api/join/[projectId] — public: register a subcontractor
export async function POST(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { company, contactName, phone, email, trade } = await req.json()
    if (!company || !contactName || !phone || !trade) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify project exists
    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, user_id')
      .eq('id', params.projectId)
      .single()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Normalize phone to E.164
    const digits = phone.replace(/\D/g, '')
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`

    // Save subcontractor to Supabase
    const subId = uuidv4()
    const { error: subError } = await supabaseAdmin
      .from('bf_subcontractors')
      .upsert({
        id: subId,
        project_id: params.projectId,
        name: contactName,
        company,
        phone: e164,
        trade,
        email: email ?? '',
        notes: '',
      }, { onConflict: 'phone,project_id' })

    if (subError) {
      console.error('upsert subcontractor:', subError)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Auto-assign matching tasks based on trade
    const tradeTaskMap: Record<string, string[]> = {
      electrical: ['Electrical Rough-In', 'Electrical Trim'],
      plumbing:   ['Plumbing Rough-In', 'Plumbing Trim'],
      hvac:       ['HVAC Rough-In', 'HVAC Trim'],
      framing:    ['Framing', 'Roof Framing'],
      concrete:   ['Foundation', 'Flatwork / Concrete'],
      roofing:    ['Roofing'],
      drywall:    ['Drywall', 'Drywall Finish'],
      paint:      ['Interior Paint', 'Exterior Paint'],
      flooring:   ['Flooring'],
      general:    [],
    }

    const taskNames = tradeTaskMap[trade] ?? []
    if (taskNames.length > 0) {
      const { data: tasks } = await supabaseAdmin
        .from('bf_tasks')
        .select('id, name')
        .eq('project_id', params.projectId)
        .in('name', taskNames)

      if (tasks && tasks.length > 0) {
        await supabaseAdmin
          .from('bf_tasks')
          .upsert(
            tasks.map(t => ({ id: t.id, assigned_to: company, subcontractor_phone: e164 })),
            { onConflict: 'id' }
          )
      }
    }

    // Welcome SMS via Twilio
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app'
    const welcomeMsg =
      `Hi ${contactName}! Welcome to ${project.name} 🏗️\n` +
      `You've been registered as the ${trade} contractor.\n` +
      `Address: ${project.address}\n\n` +
      `Sofia will text you when your work phase begins. Reply anytime to update your status.\n` +
      `– BuildFlow`

    await fetch(`${appUrl}/api/contractors/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: e164, company, contactName, trade,
        projectName: project.name, projectAddress: project.address,
        assignedCount: taskNames.length,
      }),
    }).catch(() => {})

    return NextResponse.json({ ok: true, subId })
  } catch (e: any) {
    console.error('[join/register]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/join/[projectId] — builder edits a subcontractor
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { id, company, name, phone, email, trade, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const digits = phone?.replace(/\D/g, '') ?? ''
    const e164 = digits.length === 10 ? `+1${digits}` : digits ? `+${digits}` : phone

    const { error } = await supabaseAdmin
      .from('bf_subcontractors')
      .update({ company, name, phone: e164, email, trade, notes })
      .eq('id', id)
      .eq('project_id', params.projectId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/join/[projectId]?subId=xxx — builder removes a subcontractor
export async function DELETE(req: NextRequest, { params }: { params: { projectId: string } }) {
  const subId = new URL(req.url).searchParams.get('subId')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  await supabaseAdmin.from('bf_subcontractors').delete()
    .eq('id', subId).eq('project_id', params.projectId)
  return NextResponse.json({ ok: true })
}
