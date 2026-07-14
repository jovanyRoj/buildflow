-- ============================================================
-- Migration 005 — Sub portal: estimates, reports, schedule
-- ============================================================

-- ── 1. Sub estimates (project-level + task-level) ─────────────────────────
CREATE TABLE IF NOT EXISTS bf_portal_estimates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES bf_tasks(id) ON DELETE SET NULL,
  sub_phone   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('project', 'task')),
  amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Sub issue / incident reports ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_portal_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES bf_tasks(id) ON DELETE SET NULL,
  sub_phone   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
                'material_missing',
                'safety_concern',
                'schedule_conflict',
                'damage',
                'other'
              )),
  description TEXT NOT NULL,
  urgency     TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'emergency')),
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Schedule columns on bf_tasks ──────────────────────────────────────
ALTER TABLE bf_tasks
  ADD COLUMN IF NOT EXISTS sub_arrival_time    TIME,
  ADD COLUMN IF NOT EXISTS sub_work_days       TEXT,   -- e.g. 'Mon,Tue,Wed,Thu,Fri'
  ADD COLUMN IF NOT EXISTS sub_schedule_notes  TEXT;

-- ── 4. RLS policies ──────────────────────────────────────────────────────
ALTER TABLE bf_portal_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_portal_reports   ENABLE ROW LEVEL SECURITY;

-- Service role (used by supabaseAdmin) bypasses RLS automatically.
-- Add permissive policy so anon reads are blocked but service role works:
CREATE POLICY "estimates_service_only" ON bf_portal_estimates
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "reports_service_only" ON bf_portal_reports
  FOR ALL USING (auth.role() = 'service_role');
