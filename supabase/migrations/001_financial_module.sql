-- ============================================================
-- BuildFlow v0.9 — Financial Module + Quote + Documents + Materials
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. bf_project_financials
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_project_financials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  project_type             text NOT NULL DEFAULT 'spec' CHECK (project_type IN ('custom','spec')),
  sold                     boolean NOT NULL DEFAULT false,
  sold_at                  date,
  sale_price_projected     numeric(12,2),
  sale_price_actual        numeric(12,2),
  construction_cost_budget numeric(12,2),
  loan_amount              numeric(12,2),
  loan_interest_rate       numeric(5,4),
  loan_start_date          date,
  loan_end_date            date,
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  UNIQUE(project_id)
);
ALTER TABLE bf_project_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder financials" ON bf_project_financials FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 2. bf_sub_budgets
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_sub_budgets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES bf_tasks(id) ON DELETE CASCADE,
  sub_id           uuid NOT NULL REFERENCES bf_subs(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  quoted_amount    numeric(10,2),
  approved_amount  numeric(10,2),
  final_amount     numeric(10,2),
  payment_status   text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid')),
  payment_date     date,
  builder_notes    text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(task_id, sub_id)
);
ALTER TABLE bf_sub_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder sub budgets" ON bf_sub_budgets FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 3. bf_budget_changes
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_budget_changes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_budget_id        uuid NOT NULL REFERENCES bf_sub_budgets(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  change_type          text NOT NULL CHECK (change_type IN ('increase','decrease','correction')),
  previous_amount      numeric(10,2) NOT NULL,
  new_amount           numeric(10,2) NOT NULL,
  reason               text NOT NULL,
  requested_by         text NOT NULL CHECK (requested_by IN ('builder','sub')),
  approved_by_builder  boolean NOT NULL DEFAULT false,
  created_at           timestamptz DEFAULT now()
);
ALTER TABLE bf_budget_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder budget changes" ON bf_budget_changes FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 4. bf_project_quote
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_project_quote (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  total_budget        numeric(12,2) NOT NULL DEFAULT 0,
  contingency_pct     numeric(4,2) NOT NULL DEFAULT 10,
  notes               text,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','locked')),
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(project_id)
);
ALTER TABLE bf_project_quote ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder quotes" ON bf_project_quote FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 5. bf_quote_phases
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_quote_phases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        uuid NOT NULL REFERENCES bf_project_quote(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  phase_name      text NOT NULL,
  phase_order     integer NOT NULL DEFAULT 1,
  budget_amount   numeric(10,2) NOT NULL DEFAULT 0,
  quoted_total    numeric(10,2) NOT NULL DEFAULT 0,
  approved_total  numeric(10,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'under_budget'
                  CHECK (status IN ('under_budget','at_budget','over_budget')),
  notes           text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE bf_quote_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder quote phases" ON bf_quote_phases FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 6. bf_quote_items
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_quote_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id         uuid NOT NULL REFERENCES bf_quote_phases(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  item_type        text NOT NULL DEFAULT 'labor'
                   CHECK (item_type IN ('labor','material','permit','equipment','other')),
  description      text NOT NULL,
  estimated_amount numeric(10,2) NOT NULL DEFAULT 0,
  actual_amount    numeric(10,2),
  task_id          uuid REFERENCES bf_tasks(id),
  notes            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE bf_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder quote items" ON bf_quote_items FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 7. bf_materials — builder-purchased materials (not sub-provided)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_materials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id         uuid REFERENCES bf_tasks(id),
  category        text NOT NULL DEFAULT 'other'
                  CHECK (category IN (
                    'lumber','appliances','fixtures','windows','doors',
                    'flooring','roofing','electrical','plumbing','hvac',
                    'cabinets','countertops','tile','insulation','concrete',
                    'hardware','paint','landscaping','other'
                  )),
  name            text NOT NULL,
  vendor          text,
  quantity        numeric(10,2) NOT NULL DEFAULT 1,
  unit            text NOT NULL DEFAULT 'each',
  unit_price      numeric(10,2) NOT NULL DEFAULT 0,
  purchase_status text NOT NULL DEFAULT 'pending'
                  CHECK (purchase_status IN ('pending','ordered','delivered','installed')),
  order_date      date,
  delivery_date   date,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE bf_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder materials" ON bf_materials FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 8. bf_project_documents
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_project_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id          uuid REFERENCES bf_tasks(id),
  document_type    text NOT NULL DEFAULT 'blueprint'
                   CHECK (document_type IN ('blueprint','permit','contract','inspection_report','photo','other')),
  title            text NOT NULL,
  file_url         text NOT NULL,
  file_name        text NOT NULL,
  file_size_kb     integer,
  mime_type        text,
  version          integer NOT NULL DEFAULT 1,
  is_current       boolean NOT NULL DEFAULT true,
  uploaded_by      text NOT NULL DEFAULT 'builder',
  visible_to_subs  boolean NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE bf_project_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder documents" ON bf_project_documents FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 9. bf_inspections
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bf_inspections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id              uuid REFERENCES bf_tasks(id),
  inspection_type      text NOT NULL DEFAULT 'other'
                       CHECK (inspection_type IN (
                         'foundation','framing','electrical_rough','plumbing_rough',
                         'mechanical','insulation','drywall','electrical_final',
                         'plumbing_final','mechanical_final','final','other'
                       )),
  inspection_date      date,
  scheduled_date       date,
  inspector_name       text,
  inspector_badge      text,
  result               text NOT NULL DEFAULT 'pending'
                       CHECK (result IN ('passed','failed','pending','scheduled')),
  report_document_id   uuid REFERENCES bf_project_documents(id),
  correction_required  text,
  reinspection_date    date,
  cost                 numeric(8,2),
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
ALTER TABLE bf_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Builder inspections" ON bf_inspections FOR ALL
  USING (project_id IN (SELECT id FROM bf_projects WHERE user_id = auth.uid()));
