import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const entityId   = searchParams.get('entityId')
  const limit      = parseInt(searchParams.get('limit') ?? '50')

  let query = supabaseAdmin
    .from('bf_audit_log')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId)   query = query.eq('entity_id', entityId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}
