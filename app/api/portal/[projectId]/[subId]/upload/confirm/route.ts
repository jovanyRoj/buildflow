import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; subId: string }> }

// POST /api/portal/[projectId]/[subId]/upload/confirm
// Called after client has PUT the file directly to Supabase Storage.
// Body: { fileId, path, filename, contentType, size, task_id?, category?, notes? }
// Records the file in bf_project_files.

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId, subId } = await params
  try {
    const { fileId, path, filename, contentType, size, task_id, category, notes } =
      await req.json()

    if (!fileId || !path || !filename) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify sub
    const { data: sub } = await supabaseAdmin
      .from('bf_subcontractors').select('id, phone, company').eq('id', subId).eq('project_id', projectId).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('buildflow-files')
      .getPublicUrl(path)

    const cat = category ?? (contentType?.startsWith('image/') ? 'sub_photo' : 'sub_document')

    const { data: record, error: dbErr } = await supabaseAdmin
      .from('bf_project_files')
      .insert({
        id:              fileId,
        project_id:      projectId,
        task_id:         task_id ?? null,
        name:            filename,
        category:        cat,
        file_url:        urlData.publicUrl,
        file_path:       path,
        file_size:       size ?? 0,
        file_type:       contentType,
        uploaded_by_sub: true,
        sub_phone:       sub.phone,
        notes:           notes ?? null,
      })
      .select()
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    // Notification for builder (fire-and-forget)
    try {
      await supabaseAdmin.from('bf_notifications').insert({
        project_id: projectId,
        task_id:    task_id ?? null,
        type:       'subcontractor',
        title:      `📎 ${sub.company} uploaded evidence`,
        body:       `File: ${filename}${notes ? ` — ${notes}` : ''}`,
        is_read:    false,
      })
    } catch {}

    return NextResponse.json({ ok: true, file: record })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
