import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/builder/notifications?userId=<uid>
// Returns all notifications from bf_notifications for all projects of a user
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  // 1. Get all projects for this user
  const { data: projects } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name')
    .eq('user_id', userId)

  if (!projects?.length) return NextResponse.json({ notifications: [] })

  const projectIds = projects.map(p => p.id)
  const projectMap: Record<string, string> = {}
  for (const p of projects) projectMap[p.id] = p.name

  // 2. Get notifications from bf_notifications
  const { data: dbNotifs, error } = await supabaseAdmin
    .from('bf_notifications')
    .select('id, project_id, task_id, type, title, body, created_at, is_read')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[notifications GET]', error)
    return NextResponse.json({ notifications: [] })
  }

  const notifications = (dbNotifs ?? []).map(n => ({
    id:          n.id,
    projectId:   n.project_id,
    projectName: projectMap[n.project_id] ?? '',
    type:        n.type ?? 'alert',
    title:       n.title ?? '',
    body:        n.body ?? '',
    isRead:      n.is_read ?? false,
    createdAt:   n.created_at,
    taskId:      n.task_id ?? undefined,
    source:      'db' as const,
  }))

  return NextResponse.json({ notifications })
}

// PATCH /api/builder/notifications — mark as read
export async function PATCH(req: NextRequest) {
  const { id, markAll, projectIds } = await req.json()
  if (markAll && projectIds?.length) {
    await supabaseAdmin.from('bf_notifications')
      .update({ is_read: true })
      .in('project_id', projectIds)
  } else if (id) {
    await supabaseAdmin.from('bf_notifications')
      .update({ is_read: true })
      .eq('id', id)
  }
  return NextResponse.json({ ok: true })
}
