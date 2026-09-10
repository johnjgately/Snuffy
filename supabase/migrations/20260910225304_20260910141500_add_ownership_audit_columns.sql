/*
# Add ownership and audit columns to all sensitive tables

1. New columns on each sensitive table:
   - owner_user_id uuid (nullable initially, will be set NOT NULL after backfill)
   - created_by_user_id uuid (nullable)
   - updated_by_user_id uuid (nullable)
   - updated_at timestamptz (defaults to now())

2. New document metadata columns on `documents`:
   - uploaded_by_user_id uuid
   - original_filename text
   - classification text (sensitivity level)

3. The existing `user_id` column on each table is preserved. We add `owner_user_id`
   as the canonical ownership column for RBAC. The old `user_id` remains for
   backward compatibility during the transition.

4. All new uuid columns reference auth.users(id) ON DELETE SET NULL.
*/

DO $$
BEGIN
  -- ai_connections
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_connections' AND column_name='owner_user_id') THEN
    ALTER TABLE public.ai_connections ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_connections' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.ai_connections ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_connections' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.ai_connections ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_connections' AND column_name='updated_at') THEN
    ALTER TABLE public.ai_connections ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- automations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automations' AND column_name='owner_user_id') THEN
    ALTER TABLE public.automations ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automations' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.automations ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automations' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.automations ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automations' AND column_name='updated_at') THEN
    ALTER TABLE public.automations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- automation_runs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_runs' AND column_name='owner_user_id') THEN
    ALTER TABLE public.automation_runs ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_runs' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.automation_runs ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='automation_runs' AND column_name='updated_at') THEN
    ALTER TABLE public.automation_runs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- documents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='owner_user_id') THEN
    ALTER TABLE public.documents ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.documents ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.documents ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='updated_at') THEN
    ALTER TABLE public.documents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='uploaded_by_user_id') THEN
    ALTER TABLE public.documents ADD COLUMN uploaded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='original_filename') THEN
    ALTER TABLE public.documents ADD COLUMN original_filename text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='classification') THEN
    ALTER TABLE public.documents ADD COLUMN classification text NOT NULL DEFAULT 'internal'
      CHECK (classification IN ('public', 'internal', 'confidential', 'restricted'));
  END IF;

  -- document_folders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_folders' AND column_name='owner_user_id') THEN
    ALTER TABLE public.document_folders ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_folders' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.document_folders ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_folders' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.document_folders ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_folders' AND column_name='updated_at') THEN
    ALTER TABLE public.document_folders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- knowledge_bases
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_bases' AND column_name='owner_user_id') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_bases' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_bases' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_bases' AND column_name='updated_at') THEN
    ALTER TABLE public.knowledge_bases ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- knowledge_documents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_documents' AND column_name='owner_user_id') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_documents' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_documents' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_documents' AND column_name='updated_at') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- knowledge_chunks
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_chunks' AND column_name='owner_user_id') THEN
    ALTER TABLE public.knowledge_chunks ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_chunks' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.knowledge_chunks ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_chunks' AND column_name='updated_at') THEN
    ALTER TABLE public.knowledge_chunks ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- search_logs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_logs' AND column_name='owner_user_id') THEN
    ALTER TABLE public.search_logs ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_logs' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.search_logs ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_logs' AND column_name='updated_at') THEN
    ALTER TABLE public.search_logs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- oauth_configs (system config table — add ownership for audit)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oauth_configs' AND column_name='owner_user_id') THEN
    ALTER TABLE public.oauth_configs ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oauth_configs' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.oauth_configs ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oauth_configs' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.oauth_configs ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='oauth_configs' AND column_name='updated_at') THEN
    ALTER TABLE public.oauth_configs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- search_settings (system config table — add ownership for audit)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_settings' AND column_name='owner_user_id') THEN
    ALTER TABLE public.search_settings ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_settings' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.search_settings ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_settings' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.search_settings ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_settings' AND column_name='updated_at') THEN
    ALTER TABLE public.search_settings ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- knowledge_settings (system config table — add ownership for audit)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_settings' AND column_name='owner_user_id') THEN
    ALTER TABLE public.knowledge_settings ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_settings' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.knowledge_settings ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_settings' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.knowledge_settings ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_settings' AND column_name='updated_at') THEN
    ALTER TABLE public.knowledge_settings ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- users (custom directory table — add ownership for audit)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='owner_user_id') THEN
    ALTER TABLE public.users ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.users ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.users ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='updated_at') THEN
    ALTER TABLE public.users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- role_permissions (system table — add ownership for audit)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='owner_user_id') THEN
    ALTER TABLE public.role_permissions ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='created_by_user_id') THEN
    ALTER TABLE public.role_permissions ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='updated_by_user_id') THEN
    ALTER TABLE public.role_permissions ADD COLUMN updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='updated_at') THEN
    ALTER TABLE public.role_permissions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Indexes for ownership-scoped queries
CREATE INDEX IF NOT EXISTS ai_connections_owner_idx ON public.ai_connections (owner_user_id);
CREATE INDEX IF NOT EXISTS automations_owner_idx ON public.automations (owner_user_id);
CREATE INDEX IF NOT EXISTS automation_runs_owner_idx ON public.automation_runs (owner_user_id);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON public.documents (owner_user_id);
CREATE INDEX IF NOT EXISTS document_folders_owner_idx ON public.document_folders (owner_user_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_owner_idx ON public.knowledge_bases (owner_user_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_owner_idx ON public.knowledge_documents (owner_user_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_owner_idx ON public.knowledge_chunks (owner_user_id);
CREATE INDEX IF NOT EXISTS search_logs_owner_idx ON public.search_logs (owner_user_id);
CREATE INDEX IF NOT EXISTS oauth_configs_owner_idx ON public.oauth_configs (owner_user_id);
CREATE INDEX IF NOT EXISTS search_settings_owner_idx ON public.search_settings (owner_user_id);
CREATE INDEX IF NOT EXISTS knowledge_settings_owner_idx ON public.knowledge_settings (owner_user_id);
CREATE INDEX IF NOT EXISTS users_owner_idx ON public.users (owner_user_id);
CREATE INDEX IF NOT EXISTS role_permissions_owner_idx ON public.role_permissions (owner_user_id);
