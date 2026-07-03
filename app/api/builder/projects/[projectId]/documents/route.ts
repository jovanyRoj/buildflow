import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('bf_project_documents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const docType = (formData.get('document_type') as string) ?? 'other'
  const title   = (formData.get('title') as string) ?? file?.name ?? 'Document'
  const taskId  = (formData.get('task_id') as string) || undefined
  const visibleToSubs = formData.get('visible_to_subs') !== 'false'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'Max 50 MB' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'bin'
  const storagePath = `${projectId}/${docType}s/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('project-docs')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = supabaseAdmin.storage.from('project-docs').getPublicUrl(storagePath)

  const { data, error } = await supabaseAdmin
    .from('bf_project_documents')
    .insert({
      project_id: projectId,
      task_id: taskId ?? null,
      document_type: docType,
      title,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size_kb: Math.round(file.size / 1024),
      mime_type: file.type,
      visible_to_subs: visibleToSubs,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, document: data })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { projectId } = await ctx.params
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('bf_project_documents').delete().eq('id', id).eq('project_id', projectId)
  return NextResponse.json({ ok: true })
}
