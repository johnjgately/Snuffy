/*
# Automation reliability: retry, idempotency, concurrency, timeout, notifications

## Purpose
Adds reliability and auditability columns to the automations and automation_runs tables.

## Changes

### 1. Columns added to `automations`
- `time_zone` (text, default 'UTC') — schedule timezone
- `concurrency_policy` (text, default 'allow') — allow | skip | queue
- `max_concurrent_runs` (integer, default 1)
- `max_retry_count` (integer, default 3)
- `retry_backoff_base_seconds` (integer, default 60) — exponential backoff base
- `timeout_seconds` (integer, default 300) — per-run timeout
- `notification_recipients` (jsonb, default '[]') — array of user IDs to notify on failure
- `paused` (boolean, default false) — paused automations don't execute
- `paused_at` (timestamptz, nullable)
- `paused_by` (uuid, nullable)
- `paused_reason` (text, nullable)

### 2. Columns added to `automation_runs`
- `idempotency_key` (text, unique, nullable) — prevents duplicate runs
- `retry_count` (integer, default 0)
- `max_retries` (integer, nullable) — snapshot from automation at run time
- `timeout_at` (timestamptz, nullable) — when the run times out
- `cancelled_at` (timestamptz, nullable)
- `cancelled_by` (uuid, nullable)
- `cancel_reason` (text, nullable)
- `error_message` (text, nullable)
- `market_id` (uuid, nullable) — market scope for the run
- `trigger_type` (text, nullable) — schedule | manual | webhook
- `inputs` (jsonb, nullable) — run inputs (sanitized, no secrets)

### 3. Add CHECK constraint on automation_runs.status
- Allowed: queued, running, succeeded, failed, timed_out, cancelled, skipped, paused, retrying

### 4. Indexes
- Index on automation_runs.idempotency_key for duplicate prevention
- Index on automations.paused for filtering
- Index on automation_runs.status for queue processing

## Security
- No RLS changes needed (existing policies cover new columns)
- Secrets are never stored in inputs or error_message
*/

-- 1. Add columns to automations
ALTER TABLE automations ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'UTC';
ALTER TABLE automations ADD COLUMN IF NOT EXISTS concurrency_policy text NOT NULL DEFAULT 'allow' CHECK (concurrency_policy IN ('allow', 'skip', 'queue'));
ALTER TABLE automations ADD COLUMN IF NOT EXISTS max_concurrent_runs integer NOT NULL DEFAULT 1;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS max_retry_count integer NOT NULL DEFAULT 3;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS retry_backoff_base_seconds integer NOT NULL DEFAULT 60;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS timeout_seconds integer NOT NULL DEFAULT 300;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS notification_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS paused_by uuid;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS paused_reason text;

-- 2. Add columns to automation_runs
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS max_retries integer;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS timeout_at timestamptz;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS cancelled_by uuid;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS market_id uuid;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS trigger_type text;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS inputs jsonb;

-- 3. Update status CHECK constraint
ALTER TABLE automation_runs DROP CONSTRAINT IF EXISTS automation_runs_status_check;
ALTER TABLE automation_runs ADD CONSTRAINT automation_runs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'skipped', 'paused', 'retrying'));

-- 4. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_idempotency ON automation_runs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automations_paused ON automations (paused);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs (status);
CREATE INDEX IF NOT EXISTS idx_automation_runs_market ON automation_runs (market_id);
