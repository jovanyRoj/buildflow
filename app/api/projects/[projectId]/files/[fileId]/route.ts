import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Ctx = { params: Promise<{ projectId: string; fileId: string }> }

// DELETE — remove a file from storage + DB
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { projectId, fileId } = await params
  try {
    const { data: record } = await supabaseAdmin
      .from('bf_project_files')
      .select('file_path')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (record?.file_path) {
      await supabaseAdmin.storage
        .from('buildflow-files')
        .remove([record.file_path])
    }

    await supabaseAdmin
      .from('bf_project_files')
      .delete()
      .eq('id', fileId)
      .eq('project_id', projectId)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
