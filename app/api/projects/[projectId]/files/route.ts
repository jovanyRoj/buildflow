import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string }> }

// GET — list files for a project
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  const { data, error } = await supabaseAdmin
    .from('bf_project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data ?? [] })
}

// POST — upload a file
export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const category = formData.get('category') as string | null

    if (!file || !category) {
      return NextResponse.json({ error: 'Missing file or category' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const fileId = crypto.randomUUID()
    const filePath = `${projectId}/${fileId}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: storageError } = await supabaseAdmin.storage
      .from('buildflow-files')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('buildflow-files')
      .getPublicUrl(filePath)

    const { data: record, error: dbError } = await supabaseAdmin
      .from('bf_project_files')
      .insert({
        id: fileId,
        project_id: projectId,
        name: file.name,
        category,
        file_url: urlData.publicUrl,
        file_path: filePath,
        file_size: file.size,
        file_type: file.type,
      })
      .select()
      .single()

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
    return NextResponse.json({ ok: true, file: record })
  } catch (e: any) {
    console.error('[files/upload]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
