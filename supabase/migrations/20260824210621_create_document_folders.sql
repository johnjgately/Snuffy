/*
# Create document_folders table (single-tenant, no auth)

1. New Tables
- `document_folders`
  - `id` (uuid, primary key)
  - `name` (text, not null) — the folder display name
  - `created_at` (timestamp, defaults to now)

2. Security
- Enable RLS on `document_folders`.
- Allow anon + authenticated full CRUD because the app has no sign-in and the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_folders" ON document_folders;
CREATE POLICY "anon_select_folders" ON document_folders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_folders" ON document_folders;
CREATE POLICY "anon_insert_folders" ON document_folders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_folders" ON document_folders;
CREATE POLICY "anon_update_folders" ON document_folders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_folders" ON document_folders;
CREATE POLICY "anon_delete_folders" ON document_folders FOR DELETE
  TO anon, authenticated USING (true);
