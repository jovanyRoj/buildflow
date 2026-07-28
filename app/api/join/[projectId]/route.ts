import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { v4 as uuidv4 } from 'uuid'

type Ctx = { params: Promise<{ projectId: string }> }

// GET /api/join/[projectId] — public: returns project info + registered subs for re-entry
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  const { data: project } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, address')
    .eq('id', projectId)
    .single()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Return registered subs for re-entry buttons (no sensitive data)
  const { data: registeredSubs } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id, company, trade, name')
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true })

  return NextResponse.json({ project, registeredSubs: registeredSubs ?? [] })
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
      .select('id, name, address, user_id, start_date, estimated_end_date')
      .eq('id', projectId)
      .single()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const digits = phone.replace(/\D/g, '')
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`

    // Check if subcontractor already registered
    const { data: existing } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id')
      .eq('project_id', projectId)
      .eq('phone', e164)
      .maybeSingle()

    let subId: string
    if (existing) {
      subId = existing.id
      await supabaseAdmin
        .from('bf_subcontractors')
        .update({ name: contactName, company, trade, email: email ?? '' })
        .eq('id', subId)
    } else {
      subId = uuidv4()
      const { error: insertError } = await supabaseAdmin
        .from('bf_subcontractors')
        .insert({
          id: subId, project_id: projectId,
          name: contactName, company, phone: e164,
          trade, email: email ?? '', notes: '',
        })
      if (insertError) {
        console.error('insert subcontractor:', insertError)
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
      }
    }

    // Auto-assign matching tasks using keyword-based fuzzy matching
    const tradeKeywords: Record<string, string[]> = {
      electrical:  ['electric', 'wiring', 'panel', 'outlet', 'circuit', 'lighting'],
      plumbing:    ['plumb', 'pipe', 'water', 'drain', 'sewage', 'toilet'],
      hvac:        ['hvac', 'heat', 'cool', 'air', 'ventilat', 'duct', 'mechanical'],
      framing:     ['fram', 'lumber', 'stud', 'beam', 'sheathing'],
      concrete:    ['concret', 'foundation', 'flatwork', 'slab', 'footing', 'pour'],
      roofing:     ['roof', 'shingle', 'tile', 'gutter', 'fascia'],
      drywall:     ['drywall', 'sheetrock', 'gypsum', 'plaster', 'texture'],
      paint:       ['paint', 'primer', 'stain', 'coat'],
      flooring:    ['floor', 'tile', 'carpet', 'hardwood', 'laminate', 'vinyl'],
      survey:      ['survey', 'land', 'plat', 'boundary', 'stake', 'topograph'],
      surveyor:    ['survey', 'land', 'plat', 'boundary', 'stake', 'topograph'],
      excavation:  ['excavat', 'dig', 'grade', 'earthwork', 'demo', 'demolit', 'clear'],
      landscaping: ['landscap', 'lawn', 'irrigat', 'tree', 'plant', 'sod', 'fence'],
      masonry:     ['mason', 'brick', 'block', 'stone', 'mortar', 'stucco'],
      insulation:  ['insulat', 'foam', 'batts', 'spray'],
      windows:     ['window', 'door', 'glazing'],
      cabinet:     ['cabinet', 'countertop', 'millwork'],
      general:     [],
    }

    // Get keywords for this trade (also try splitting the trade name into parts)
    const tradeLower = trade.toLowerCase().trim()
    const tradeParts = tradeLower.split(/[\s_-]+/)
    const keywords: string[] =
      tradeKeywords[tradeLower] ??
      tradeParts.flatMap((p: string) => tradeKeywords[p] ?? [p])

    // Fetch all project tasks
    const { data: allTasks } = await supabaseAdmin
      .from('bf_tasks').select('id, name, assigned_to, subcontractor_phone')
      .eq('project_id', projectId)

    const companyLower = company.toLowerCase()
    const matchedTasks = (allTasks ?? []).filter((t: any) => {
      const tName     = (t.name ?? '').toLowerCase()
      const tAssigned = (t.assigned_to ?? '').toLowerCase()
      // Skip tasks already claimed by a different sub
      if (t.subcontractor_phone && t.subcontractor_phone !== e164) return false
      // Match if task's assigned_to already contains this company name (or vice versa)
      if (tAssigned && (tAssigned.includes(companyLower) || companyLower.includes(tAssigned))) return true
      // Match by keyword in task name
      return keywords.length > 0 && keywords.some((kw: string) => tName.includes(kw.toLowerCase()))
    })

    let autoAssigned = 0
    if (matchedTasks.length > 0) {
      for (const t of matchedTasks) {
        await supabaseAdmin
          .from('bf_tasks')
          .update({ assigned_to: company, subcontractor_phone: e164 })
          .eq('id', t.id)
        autoAssigned++
      }
      const taskNamesList = matchedTasks.map((t: any) => `"${t.name}"`).join(', ')
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId,
        type: 'subcontractor',
        title: `🤖 KORVIA: ${company} auto-matched to ${autoAssigned} task(s)`,
        body: `${contactName} registered as ${trade} and was auto-assigned to: ${taskNamesList}. Verify assignment is correct.`,
        is_read: false,
      })
    } else {
      // No existing tasks matched — AUTO-CREATE a task for this sub/trade
      const taskLabel  = trade.charAt(0).toUpperCase() + trade.slice(1).toLowerCase()
      const startDate  = (project as any).start_date         ?? new Date().toISOString().split('T')[0]
      const endDate    = (project as any).estimated_end_date ?? startDate
      const durationMs = new Date(endDate).getTime() - new Date(startDate).getTime()
      const durDays    = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)))

      const { count: taskCount } = await supabaseAdmin
        .from('bf_tasks').select('*', { count: 'exact', head: true }).eq('project_id', projectId)

      const newTaskId = uuidv4()
      const { error: taskErr } = await supabaseAdmin.from('bf_tasks').insert({
        id: newTaskId,
        project_id: projectId,
        name: `${taskLabel} Work`,
        status: 'pending',
        start_date: startDate,
        end_date: endDate,
        original_end_date: endDate,
        duration_days: durDays,
        delay_days: 0,
        assigned_to: company,
        subcontractor_phone: e164,
        task_order: (taskCount ?? 0) + 1,
        notes: '',
        portal_token: uuidv4(),
        inspection_required: false,
      })

      if (!taskErr) {
        autoAssigned = 1
        await supabaseAdmin.from('bf_notifications').insert({
          project_id: projectId, type: 'subcontractor',
          title: `🤖 KORVIA: Nueva tarea para ${company}`,
          body: `${contactName} se registró como ${trade}. Tarea "${taskLabel} Work" creada automáticamente.`,
          is_read: false,
        })
      } else {
        console.error('[join/auto-create-task]', taskErr)
      }
    }

    // Welcome SMS
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://buildflow-eight-sigma.vercel.app'
    await fetch(`${appUrl}/api/contractors/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: e164, company, contactName, trade,
        projectName: project.name, projectAddress: project.address,
        assignedCount: autoAssigned,
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
