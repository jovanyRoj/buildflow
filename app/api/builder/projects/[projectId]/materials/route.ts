import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('bf_materials')
    .select('*')
    .eq('project_id', projectId)
    .order('category')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ materials: data ?? [] })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('bf_materials')
    .insert({ ...body, project_id: projectId })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, material: data })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const body = await req.json()
  const { id, ...updates } = body
  const { data, error } = await supabaseAdmin
    .from('bf_materials')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', projectId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, material: data })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin
    .from('bf_materials')
    .delete()
    .eq('id', id)
    .eq('project_id', projectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
