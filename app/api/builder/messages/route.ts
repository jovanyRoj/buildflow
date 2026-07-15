import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/builder/messages?userId=<uid>
 * Returns all KORVIA/portal messages grouped by project.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  // 1. All projects for this builder
  const { data: projects } = await supabaseAdmin
    .from('bf_projects')
    .select('id, name, bg_color, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (!projects?.length) return NextResponse.json({ projects: [] })

  const projectIds = projects.map(p => p.id)

  // 2. Portal messages (sub ↔ KORVIA chat)
  const { data: messages } = await supabaseAdmin
    .from('bf_portal_messages')
    .select('id, project_id, sub_id, sender, content, created_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: true })

  // 3. Subs to resolve names
  const { data: subs } = await supabaseAdmin
    .from('bf_subcontractors')
    .select('id, name, company, phone, trade, project_id')
    .in('project_id', projectIds)

  const subMap: Record<string, { name: string; company: string }> = {}
  for (const s of subs ?? []) {
    subMap[s.id] = { name: s.name ?? '', company: s.company ?? '' }
  }

  // 4. Reports (emergencies/issues sent by subs)
  const { data: reports } = await supabaseAdmin
    .from('bf_portal_reports')
    .select('id, project_id, type, urgency, description, created_at, sub_id')
    .in('project_id', projectIds)
    .order('created_at', { ascending: true })

  // 5. Group by project
  const grouped = projects.map(p => {
    const projMsgs = (messages ?? [])
      .filter(m => m.project_id === p.id)
      .map(m => ({
        id:         m.id,
        sender:     m.sender as 'sub' | 'korvia',
        senderName: m.sender === 'korvia'
          ? 'KORVIA'
          : (subMap[m.sub_id]?.company || subMap[m.sub_id]?.name || 'Sub'),
        content:    m.content as string,
        createdAt:  m.created_at as string,
        type:       'message' as const,
        urgency:    null as string | null,
      }))

    const projReports = (reports ?? [])
      .filter(r => r.project_id === p.id)
      .map(r => ({
        id:         r.id,
        sender:     'sub' as const,
        senderName: subMap[r.sub_id]?.company || subMap[r.sub_id]?.name || 'Sub',
        content:    `[${(r.type ?? 'REPORT').replace(/_/g, ' ').toUpperCase()}] ${r.description}`,
        createdAt:  r.created_at as string,
        type:       'report' as const,
        urgency:    r.urgency as string | null,
      }))

    const allMessages = [...projMsgs, ...projReports]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    return {
      id:          p.id,
      name:        p.name,
      bgColor:     (p as any).bg_color ?? '#1A2B4A',
      status:      p.status,
      messages:    allMessages,
      subCount:    allMessages.filter(m => m.sender === 'sub').length,
    }
  })

  return NextResponse.json({ projects: grouped })
}
