-- BuildFlow Database Schema
-- Run this in Supabase SQL Editor

-- USERS (builders)
CREATE TABLE IF NOT EXISTS bf_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  provider TEXT DEFAULT 'email',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS bf_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES bf_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  project_type TEXT DEFAULT 'singleFamily',
  start_date DATE NOT NULL,
  estimated_end_date DATE,
  status TEXT DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TASKS
CREATE TABLE IF NOT EXISTS bf_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES bf_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task_order INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  original_end_date DATE NOT NULL,
  duration_days INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  delay_days INTEGER DEFAULT 0,
  assigned_to TEXT DEFAULT '',
  subcontractor_phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  dependencies TEXT[] DEFAULT '{}',
  inspection_required BOOLEAN DEFAULT FALSE,
  inspection_status TEXT DEFAULT 'not_required',
  inspection_notes TEXT DEFAULT '',
  portal_token TEXT UNIQUE,
  sms_last_sent TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUBCONTRACTORS
CREATE TABLE IF NOT EXISTS bf_subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES bf_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  phone TEXT NOT NULL,
  trade TEXT NOT NULL,
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- HISTORY
CREATE TABLE IF NOT EXISTS bf_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id UUID,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS bf_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES bf_projects(id) ON DELETE CASCADE,
  task_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SOFIA AI CALLS
CREATE TABLE IF NOT EXISTS bf_sofia_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  task_id UUID,
  caller_phone TEXT,
  caller_name TEXT,
  direction TEXT DEFAULT 'inbound',
  transcript TEXT,
  action_taken TEXT,
  status_updated TEXT,
  escalated_to_builder BOOLEAN DEFAULT FALSE,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bf_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bf_sofia_calls ENABLE ROW LEVEL SECURITY;

-- RLS: Allow service role full access (used by server)
CREATE POLICY "service_role_all" ON bf_users FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_projects FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_tasks FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_subcontractors FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_history FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_notifications FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bf_sofia_calls FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_user ON bf_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON bf_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_token ON bf_tasks(portal_token);
CREATE INDEX IF NOT EXISTS idx_subs_project ON bf_subcontractors(project_id);
CREATE INDEX IF NOT EXISTS idx_subs_phone ON bf_subcontractors(phone);
CREATE INDEX IF NOT EXISTS idx_notif_project ON bf_notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_history_project ON bf_history(project_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON bf_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tasks_updated_at
  BEFORE UPDATE ON bf_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

SELECT 'BuildFlow schema created successfully ✓' as status;
