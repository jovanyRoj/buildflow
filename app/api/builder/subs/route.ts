import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/builder/subs?userId=<uid>&excludeProjectId=<pid>
 * Returns all subcontractors across all projects owned by the user.
 * Optionally excludes subs already in the given project (by phone match).
 */
export async function GET(req: NextRequest) {
  const userId           = req.nextUrl.searchParams.get('userId')
  const excludeProjectId = req.nextUrl.searchParams.get('excludeProjectId') ?? ''

  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  // All projects for this builder
  const { data: projects } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name')
    .eq('user_id', userId)

  if (!projects?.length) return NextResponse.json({ subs: [] })

  const projectIds = projects.map(p => p.id)
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  // All subs across all projects
  const { data: allSubs } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id, project_id, name, company, phone, trade, email, notes')
    .in('project_id', projectIds)
    .order('company')

  if (!allSubs?.length) return NextResponse.json({ subs: [] })

  // Get phones already in the target project so we can mark them as already imported
  let existingPhones: string[] = []
  if (excludeProjectId) {
    const { data: existingSubs } = await supabaseAdmin
      .from('bf_subcontractors')
      .select('phone')
      .eq('project_id', excludeProjectId)
    existingPhones = (existingSubs ?? []).map(s => s.phone)
  }

  const subs = allSubs
    .filter(s => s.project_id !== excludeProjectId)   // exclude current project's own subs
    .map(s => ({
      id:           s.id,
      projectId:    s.project_id,
      projectName:  projectMap[s.project_id] ?? 'Unknown project',
      name:         s.name,
      company:      s.company ?? '',
      phone:        s.phone,
      trade:        s.trade,
      email:        s.email ?? '',
      notes:        s.notes ?? '',
      alreadyHere:  existingPhones.includes(s.phone),
    }))

  return NextResponse.json({ subs })
}
