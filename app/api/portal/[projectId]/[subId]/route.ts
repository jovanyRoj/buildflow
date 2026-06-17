import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// GET — load portal data for subcontractor guest view
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    // Verify subcontractor belongs to this project
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('id, name, company, phone, trade, email')
      .eq('id', subId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get project info
    const { data: project } = await supabaseAdmin
      .from('bf_projects')
      .select('id, name, address, status, start_date, estimated_end_date')
      .eq('id', projectId)
      .maybeSingle()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Get tasks assigned to this subcontractor's company or phone
    const { data: tasks } = await supabaseAdmin
      .from('bf_tasks')
      .select('id, name, status, start_date, end_date, notes, portal_token, delay_days, inspection_required')
      .eq('project_id', projectId)
      .or(`assigned_to.eq.${sub.company},subcontractor_phone.eq.${sub.phone}`)
      .order('task_order', { ascending: true })

    // Get all project files
    const { data: files } = await supabaseAdmin
      .from('bf_project_files')
      .select('id, name, category, file_url, file_size, file_type, uploaded_at')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    return NextResponse.json({
      project,
      sub,
      tasks: tasks ?? [],
      files: files ?? [],
    })
  } catch (e: any) {
    console.error('[portal/get]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
