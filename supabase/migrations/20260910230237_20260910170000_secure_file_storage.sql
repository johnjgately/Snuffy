/*
# Secure file storage hardening

1. Make the `documents` bucket PRIVATE (was public).
2. Make the `knowledge-files` bucket PRIVATE (verify/force).
3. Add storage policies that enforce:
   - Authenticated users can only INSERT/SELECT/DELETE objects in their own user-id prefixed path.
   - No anonymous access at all.
4. Add file_metadata table for tracking:
   - bucket, storage_path, owner_user_id, original_filename, mime_type, file_size,
   - upload_date, retention_days, retention_expires_at, access_count, last_accessed_at.
5. Add file_access_log table for tracking downloads/previews (who/when/what).
6. Add allowed_mime_types and max_file_size_mb to a storage_settings table for server-side validation.
*/

-- 1. Make documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- 2. Make knowledge-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'knowledge-files';

-- 3. Drop any existing storage policies and recreate with strict ownership checks
-- documents bucket
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_documents" ON storage.objects;
DROP POLICY IF EXISTS "anon_write_documents" ON storage.objects;

CREATE POLICY "auth_upload_own_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_read_own_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_delete_own_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- knowledge-files bucket
DROP POLICY IF EXISTS "Users can upload own knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_knowledge" ON storage.objects;
DROP POLICY IF EXISTS "anon_write_knowledge" ON storage.objects;

CREATE POLICY "auth_upload_own_knowledge" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_read_own_knowledge" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_delete_own_knowledge" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. file_metadata table
CREATE TABLE IF NOT EXISTS public.file_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  storage_path text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  upload_date timestamptz NOT NULL DEFAULT now(),
  retention_days integer NOT NULL DEFAULT 90,
  retention_expires_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, storage_path)
);

-- Use a trigger to compute retention_expires_at (avoids immutable expression requirement)
CREATE OR REPLACE FUNCTION public.compute_retention_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.retention_expires_at = NEW.upload_date + (NEW.retention_days || ' days')::interval;
  RETURN NEW;
END;
$$;

CREATE TRIGGER file_metadata_retention_trigger
  BEFORE INSERT OR UPDATE OF upload_date, retention_days ON public.file_metadata
  FOR EACH ROW EXECUTE FUNCTION public.compute_retention_expiry();

ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_file_metadata" ON public.file_metadata FOR SELECT
  TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY "insert_own_file_metadata" ON public.file_metadata FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "update_own_file_metadata" ON public.file_metadata FOR UPDATE
  TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "delete_own_file_metadata" ON public.file_metadata FOR DELETE
  TO authenticated USING (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS file_metadata_owner_idx ON public.file_metadata (owner_user_id);
CREATE INDEX IF NOT EXISTS file_metadata_bucket_idx ON public.file_metadata (bucket_id);
CREATE INDEX IF NOT EXISTS file_metadata_expires_idx ON public.file_metadata (retention_expires_at);

-- 5. file_access_log table
CREATE TABLE IF NOT EXISTS public.file_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_metadata_id uuid REFERENCES public.file_metadata(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('download', 'preview', 'share', 'delete')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.file_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_file_access_log" ON public.file_access_log FOR SELECT
  TO authenticated USING (
    actor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.file_metadata fm WHERE fm.id = file_access_log.file_metadata_id AND fm.owner_user_id = auth.uid()
    )
  );
CREATE POLICY "insert_own_file_access_log" ON public.file_access_log FOR INSERT
  TO authenticated WITH CHECK (actor_user_id = auth.uid());
CREATE POLICY "delete_own_file_access_log" ON public.file_access_log FOR DELETE
  TO authenticated USING (actor_user_id = auth.uid());

-- 6. storage_settings table
CREATE TABLE IF NOT EXISTS public.storage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allowed_mime_types text[] NOT NULL DEFAULT ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'message/rfc822',
    'application/vnd.ms-outlook'
  ],
  max_file_size_mb integer NOT NULL DEFAULT 50,
  default_retention_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_storage_settings" ON public.storage_settings FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "update_storage_settings" ON public.storage_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.app_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'admin')
  );

-- Insert default settings row if none exists
INSERT INTO public.storage_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.storage_settings);

-- 7. Function to record file access (SECURITY DEFINER, callable by authenticated)
CREATE OR REPLACE FUNCTION public.record_file_access(
  p_file_metadata_id uuid,
  p_action text,
  p_source_ip text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.file_access_log (file_metadata_id, actor_user_id, action, source_ip, metadata)
  VALUES (p_file_metadata_id, auth.uid(), p_action, p_source_ip, p_metadata);

  UPDATE public.file_metadata
  SET access_count = access_count + 1,
      last_accessed_at = now()
  WHERE id = p_file_metadata_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_file_access(uuid, text, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_file_access(uuid, text, text, jsonb) TO authenticated;
