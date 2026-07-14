import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf',
]
const MAX_SIZE_MB = 20

// ── POST /api/portal/[projectId]/[subId]/upload ────────────────────────────
// Sub uploads a photo or PDF tied to a task.
// Saved to buildflow-files bucket under portal/{projectId}/{taskId}/
// Recorded in bf_project_files with uploaded_by_sub=true.

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params

  try {
    const formData = await req.formData()
    const file     = formData.get('file')     as File   | null
    const taskId   = formData.get('task_id')  as string | null
    const category = formData.get('category') as string | null
    const notes    = formData.get('notes')    as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Type check
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only photos (JPG, PNG, HEIC) and PDFs are allowed' }, { status: 400 })
    }

    // Size check
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File exceeds ${MAX_SIZE_MB}MB limit` }, { status: 400 })
    }

    // Get sub phone for tagging
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors').select('phone, name, company').eq('id', subId).single()
    if (!sub) return NextResponse.json({ error: 'Sub not found' }, { status: 404 })

    // Build storage path
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const fileId   = crypto.randomUUID()
    const folder   = taskId ? `portal/${projectId}/${taskId}` : `portal/${projectId}`
    const filePath = `${folder}/${fileId}.${ext}`

    const buffer = new Uint8Array(await file.arrayBuffer())

    const { error: storageErr } = await supabaseAdmin.storage
      .from('buildflow-files')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 })

    const { data: urlData } = supabaseAdmin.storage
      .from('buildflow-files')
      .getPublicUrl(filePath)

    // Determine category label
    const cat = category ?? (file.type.startsWith('image/') ? 'sub_photo' : 'sub_document')

    const { data: record, error: dbErr } = await supabaseAdmin
      .from('bf_project_files')
      .insert({
        id:               fileId,
        project_id:       projectId,
        task_id:          taskId ?? null,
        name:             file.name,
        category:         cat,
        file_url:         urlData.publicUrl,
        file_path:        filePath,
        file_size:        file.size,
        file_type:        file.type,
        uploaded_by_sub:  true,
        sub_phone:        sub.phone,
        notes:            notes ?? null,
      })
      .select()
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, file: record })
  } catch (e: any) {
    console.error('[portal/upload]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
