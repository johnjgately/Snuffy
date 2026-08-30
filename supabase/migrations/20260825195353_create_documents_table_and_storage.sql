/*
# Create documents table and storage bucket

1. New Tables
- `documents`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid() — owner of the document)
  - `name` (text, not null) — original file name
  - `file_type` (text, not null) — detected type: PDF, Word, Excel, CSV, Image, Email, Text
  - `file_size` (bigint, not null) — size in bytes
  - `storage_path` (text, not null) — path in the storage bucket
  - `folder_id` (uuid, nullable) — optional reference to document_folders
  - `folder_name` (text, nullable) — denormalized folder name for quick filtering
  - `status` (text, not null, default 'processed') — one of: processed, processing, queued, flagged
  - `tags` (text array, default empty) — user-defined tags
  - `summary` (text, nullable) — AI-generated summary (placeholder for now)
  - `mime_type` (text, not null) — the file's MIME type
  - `created_at` (timestamptz, defaults to now)

2. Modified Tables
- `document_folders` — add `user_id` column (nullable, defaults to auth.uid()) so folders are owner-scoped.
  Existing rows get NULL user_id and remain accessible to all authenticated users via a fallback policy.

3. Storage
- Create a public storage bucket `documents` for file uploads.
- Storage policies: authenticated users can upload, read, and delete their own files (path starts with their user ID).

4. Security
- Enable RLS on `documents`.
- Owner-scoped CRUD: each authenticated user can only access their own document rows.
- `document_folders` policies updated to be owner-scoped (with fallback for legacy rows with NULL user_id).
*/

-- Add user_id to document_folders (nullable for backward compat)
ALTER TABLE document_folders ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

-- Update existing folder policies to be owner-scoped
DROP POLICY IF EXISTS "anon_select_folders" ON document_folders;
DROP POLICY IF EXISTS "anon_insert_folders" ON document_folders;
DROP POLICY IF EXISTS "anon_update_folders" ON document_folders;
DROP POLICY IF EXISTS "anon_delete_folders" ON document_folders;

CREATE POLICY "select_own_folders" ON document_folders FOR SELECT
  TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "insert_own_folders" ON document_folders FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_folders" ON document_folders FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_folders" ON document_folders FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  folder_id uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  folder_name text,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'processing', 'queued', 'flagged')),
  tags text[] NOT NULL DEFAULT '{}',
  summary text,
  mime_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_documents" ON documents;
CREATE POLICY "select_own_documents" ON documents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_documents" ON documents;
CREATE POLICY "insert_own_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_documents" ON documents;
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users manage their own files (path = user_id/filename)
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
CREATE POLICY "Users can upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
CREATE POLICY "Users can read own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);