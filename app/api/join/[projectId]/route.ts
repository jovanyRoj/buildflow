import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { v4 as uuidv4 } from 'uuid'

type Ctx = { params: Promise<{ projectId: string }> }

// GET /api/join/[projectId] — public: returns project info for the form
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  const { data: project } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, address')
    .eq('id', projectId)
    .single()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project })
}

// POST /api/join/[projectId] — public: register a subcontractor
export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  try {
    const { company, contactName, phone, email, trade } = await req.json()
    if (!company || !contactName || !phone || !trade) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, user_id')
      .eq('id', projectId)
      .single()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const digits = phone.replace(/\D/g, '')
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`

    const subId = uuidv4()
    const { error: subError } = await supabaseAdmin
      .from('bf_subcontractors')
      .upsert({
        id: subId, project_id: projectId,
        name: contactName, company, phone: e164,
        trade, email: email ?? '', notes: '',
      }, { onConflict: 'phone,project_id' })

    if (subError) {
      console.error('upsert subcontractor:', subError)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Auto-assign matching tasks
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
        .from('bf_tasks').select('id, name')
        .eq('project_id', projectId).in('name', taskNames)
      if (tasks?.length) {
        await supabaseAdmin.from('bf_tasks').upsert(
          tasks.map(t => ({ id: t.id, assigned_to: company, subcontractor_phone: e164 })),
          { onConflict: 'id' }
        )
      }
    }

    // Welcome SMS
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app'
    await fetch(`${appUrl}/api/contractors/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

// PATCH — builder edits a subcontractor
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  try {
    const { id, company, name, phone, email, trade, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const digits = phone?.replace(/\D/g, '') ?? ''
    const e164 = digits.length === 10 ? `+1${digits}` : digits ? `+${digits}` : phone
    const { error } = await supabaseAdmin
      .from('bf_subcontractors')
      .update({ company, name, phone: e164, email, trade, notes })
      .eq('id', id).eq('project_id', projectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — builder removes a subcontractor
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  const subId = new URL(req.url).searchParams.get('subId')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  await supabaseAdmin.from('bf_subcontractors').delete()
    .eq('id', subId).eq('project_id', projectId)
  return NextResponse.json({ ok: true })
}
