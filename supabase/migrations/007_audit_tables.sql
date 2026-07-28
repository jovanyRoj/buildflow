-- ─────────────────────────────────────────────────────────────────────────────
-- 007_audit_tables.sql
-- Audit log, KORVIA proposals, and soft-delete columns for quote entities
-- ─────────────────────────────────────────────────────────────────────────────

-- Audit log: every manual or AI-proposed change
CREATE TABLE IF NOT EXISTS bf_audit_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        REFERENCES bf_projects(id) ON DELETE CASCADE,
  entity_type       text        NOT NULL,           -- 'phase' | 'item' | 'task' | 'quote'
  entity_id         text        NOT NULL,
  entity_name       text,
  action            text        NOT NULL,           -- 'created' | 'updated' | 'archived' | 'restored' | 'deleted'
  changed_fields    jsonb,                          -- { field: { from, to } }
  previous_value    jsonb,
  new_value         jsonb,
  performed_by_type text        NOT NULL,           -- 'user' | 'korvia' | 'subcontractor'
  performed_by_id   text,
  performed_by_name text,
  reason            text,
  approval_status   text        DEFAULT 'not_required',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bf_audit_log_project_idx    ON bf_audit_log (project_id);
CREATE INDEX IF NOT EXISTS bf_audit_log_entity_idx     ON bf_audit_log (entity_type, entity_id);

-- KORVIA proposals: AI-suggested changes awaiting builder approval
CREATE TABLE IF NOT EXISTS bf_korvia_proposals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        REFERENCES bf_projects(id) ON DELETE CASCADE,
  summary          text        NOT NULL,
  reason           text,
  proposed_changes jsonb       NOT NULL,
  impact           jsonb,
  status           text        DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected' | 'applied'
  approved_by      text,
  approved_at      timestamptz,
  applied_at       timestamptz,
  rejected_reason  text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bf_korvia_proposals_project_idx ON bf_korvia_proposals (project_id);
CREATE INDEX IF NOT EXISTS bf_korvia_proposals_status_idx  ON bf_korvia_proposals (status);

-- Soft-delete columns for quote phases
ALTER TABLE bf_quote_phases
  ADD COLUMN IF NOT EXISTS is_archived  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz;

-- Soft-delete columns for quote items
ALTER TABLE bf_quote_items
  ADD COLUMN IF NOT EXISTS is_archived  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz;

-- Soft-delete columns for tasks
ALTER TABLE bf_tasks
  ADD COLUMN IF NOT EXISTS is_archived  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz;
