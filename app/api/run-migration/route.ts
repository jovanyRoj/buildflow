import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ONE-TIME migration endpoint — delete after use
const MIGRATION_SECRET = 'bflow-migrate-003'

// Each step runs independently so partial success is possible
const STEPS: { label: string; fn: () => Promise<void> }[] = [
  {
    label: 'sub_start_date column',
    fn: async () => {
      // Check if column exists first
      const { data } = await supabaseAdmin
        .from('information_schema.columns' as any)
        .select('column_name')
        .eq('table_name', 'bf_tasks')
        .eq('column_name', 'sub_start_date')
        .maybeSingle()
      if (data) return // already exists
      throw new Error('Column does not exist — need direct SQL access')
    },
  },
]

// Try calling the internal Supabase pg-meta REST API with service key
async function runSQL(query: string): Promise<{ ok: boolean; result?: any; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY!
  const ref = url.replace('https://', '').replace('.supabase.co', '')

  // Try 1: Management API with service key as bearer
  const r1 = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (r1.ok) return { ok: true, result: await r1.json() }
  const e1 = await r1.json()

  // Try 2: pg_meta endpoint on the project itself
  const r2 = await fetch(`${url}/pg_meta/v0/query`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (r2.ok) return { ok: true, result: await r2.json() }
  const e2 = await r2.json()

  // Try 3: using supabase-js with rpc to a built-in that supports SQL
  // Some projects have exec_sql enabled
  const r3 = await supabaseAdmin.rpc('exec_sql' as any, { sql: query })
  if (!r3.error) return { ok: true, result: r3.data }

  return { ok: false, error: `API:${JSON.stringify(e1)} | pgmeta:${JSON.stringify(e2)} | rpc:${r3.error.message}` }
}

const SQL_STEPS = [
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_start_date DATE`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_end_date DATE`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_notes TEXT`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_crew_size INTEGER`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_materials_status TEXT`,
  `ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_confirmed BOOLEAN DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS bf_sub_budgets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), task_id UUID NOT NULL REFERENCES bf_tasks(id) ON DELETE CASCADE, sub_id UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE, project_id UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE, quoted_amount NUMERIC(10,2), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(task_id, sub_id))`,
  `CREATE TABLE IF NOT EXISTS bf_portal_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE, sub_id UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE, sender TEXT NOT NULL CHECK (sender IN ('sub','sofia')), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_portal_messages_sub ON bf_portal_messages(project_id, sub_id)`,
]

// Also try checking column existence via information_schema (works through PostgREST)
async function checkColumns() {
  const cols = ['sub_start_date', 'sub_end_date', 'sub_notes', 'sub_crew_size', 'sub_materials_status', 'sub_confirmed']
  const existing: string[] = []
  for (const col of cols) {
    const { data } = await supabaseAdmin
      .from('bf_tasks')
      .select(col)
      .limit(0)
    // If no error returned when selecting the column, it exists
    existing.push(col) // select doesn't error for missing cols in PostgREST — just returns null
  }

  // Real check: try to select a row and see if the fields come back
  const { data: sample } = await supabaseAdmin.from('bf_tasks').select('id, sub_start_date, sub_end_date, sub_notes, sub_crew_size, sub_materials_status, sub_confirmed').limit(1)
  return { sample, cols }
}

async function checkTables() {
  const { error: e1 } = await supabaseAdmin.from('bf_sub_budgets' as any).select('id').limit(0)
  const { error: e2 } = await supabaseAdmin.from('bf_portal_messages' as any).select('id').limit(0)
  return {
    bf_sub_budgets: !e1,
    bf_portal_messages: !e2,
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== MIGRATION_SECRET) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const cols = await checkColumns()
  const tables = await checkTables()
  return NextResponse.json({ cols, tables })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  if (secret !== MIGRATION_SECRET) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const results = []
  for (const sql of SQL_STEPS) {
    const r = await runSQL(sql)
    results.push({ sql: sql.slice(0, 60), ...r })
  }

  const tables = await checkTables()
  const cols = await checkColumns()

  return NextResponse.json({ results, verification: { tables, cols } })
}
