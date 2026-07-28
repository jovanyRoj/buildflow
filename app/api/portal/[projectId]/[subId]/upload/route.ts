import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf',
]
const MAX_SIZE_MB = 50   // checked client-side; signed URL handles the actual upload

// POST /api/portal/[projectId]/[subId]/upload
// Body: JSON { fileId, filename, contentType, size, task_id?, category?, notes? }
// Returns: { signedUrl, token, path, fileId }
// The client uploads directly to Supabase Storage using signedUrl (bypasses Vercel body limit).

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const body         = await req.json()
    const { fileId, filename, contentType, size, task_id, category, notes } = body

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Only photos (JPG, PNG, HEIC, WebP) and PDFs are allowed' }, { status: 400 })
    }
    if (size && size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File exceeds ${MAX_SIZE_MB}MB limit` }, { status: 400 })
    }

    // Verify sub belongs to project
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors').select('id, phone, company').eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const ext      = filename.split('.').pop()?.toLowerCase() ?? 'bin'
    const id       = fileId ?? crypto.randomUUID()
    const folder   = task_id ? `portal/${projectId}/${task_id}` : `portal/${projectId}`
    const filePath = `${folder}/${id}.${ext}`

    // Create signed upload URL (client will PUT directly to Supabase — no Vercel body limit)
    const { data: signData, error: signErr } = await supabaseAdmin.storage
      .from('buildflow-files')
      .createSignedUploadUrl(filePath)

    if (signErr || !signData) {
      return NextResponse.json({ error: signErr?.message ?? 'Could not create signed URL' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      signedUrl: signData.signedUrl,
      token: signData.token,
      path: filePath,
      fileId: id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
