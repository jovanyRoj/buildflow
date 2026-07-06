import { NextRequest, NextResponse } from 'next/server'

// ONE-TIME migration endpoint — delete after use
const MIGRATION_SECRET = 'bflow-migrate-003'

const STEPS = [
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_start_date DATE`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_end_date DATE`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_notes TEXT`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_crew_size INTEGER`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_materials_status TEXT`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_confirmed BOOLEAN DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS bf_sub_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES bf_tasks(id) ON DELETE CASCADE,
    sub_id UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
    quoted_amount NUMERIC(10,2),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(task_id, sub_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bf_portal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
    sub_id UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('sub','sofia')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_portal_messages_sub ON bf_portal_messages(project_id, sub_id)`,
]

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY!
  const ref = url.replace('https://', '').replace('.supabase.co', '')

  const results: { sql: string; ok: boolean; error?: string }[] = []

  for (const sql of STEPS) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      })
      const body = await res.json()
      results.push({ sql: sql.slice(0, 60), ok: res.ok, error: res.ok ? undefined : JSON.stringify(body) })
    } catch (e: any) {
      results.push({ sql: sql.slice(0, 60), ok: false, error: e.message })
    }
  }

  return NextResponse.json({ results })
}
