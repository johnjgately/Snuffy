/*
# Create automation_runs table for storing run results/reports

1. New Tables
- `automation_runs`
  - `id` (uuid, primary key)
  - `automation_id` (uuid, foreign key to automations.id ON DELETE CASCADE)
  - `automation_name` (text, not null) — denormalized for display even if automation is deleted
  - `status` (text, not null) — 'success' | 'failed'
  - `output` (text, not null) — the generated report/result content
  - `summary` (text, not null) — short one-line summary
  - `started_at` (timestamptz, defaults to now())
  - `completed_at` (timestamptz, nullable)

2. Security
- Enable RLS on `automation_runs`.
- Authenticated users can CRUD.
*/

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES automations(id) ON DELETE CASCADE,
  automation_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  output text NOT NULL,
  summary text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_automation_runs" ON automation_runs;
CREATE POLICY "select_automation_runs" ON automation_runs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_automation_runs" ON automation_runs;
CREATE POLICY "insert_automation_runs" ON automation_runs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_automation_runs" ON automation_runs;
CREATE POLICY "delete_automation_runs" ON automation_runs FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at DESC);