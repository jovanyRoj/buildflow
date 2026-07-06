-- BuildFlow — Portal sub columns + bf_sub_budgets + bf_portal_messages
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ──────────────────────────────────────────────────────────────
-- 1. Add sub-portal columns to bf_tasks
-- ──────────────────────────────────────────────────────────────
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_start_date     DATE;
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_end_date       DATE;
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_notes          TEXT;
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_crew_size      INTEGER;
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_materials_status TEXT;
ALTER TABLE bf_tasks ADD COLUMN IF NOT EXISTS sub_confirmed      BOOLEAN DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────
-- 2. bf_sub_budgets (quoted cost per task per sub)
--    References bf_subcontractors (not bf_subs)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_sub_budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES bf_tasks(id) ON DELETE CASCADE,
  sub_id         UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  quoted_amount  NUMERIC(10,2),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, sub_id)
);
ALTER TABLE bf_sub_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_sub_budgets" ON bf_sub_budgets
  FOR ALL USING (true);

-- ──────────────────────────────────────────────────────────────
-- 3. bf_portal_messages (sub ↔ Sofia message thread)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_portal_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  sub_id     UUID NOT NULL REFERENCES bf_subcontractors(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('sub','sofia')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bf_portal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all_portal_messages" ON bf_portal_messages
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_portal_messages_sub ON bf_portal_messages(project_id, sub_id);
