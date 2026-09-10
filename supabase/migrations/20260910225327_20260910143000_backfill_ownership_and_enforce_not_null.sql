/*
# Backfill ownership and enforce NOT NULL

1. Designate the first registered user as the system admin.
   - Insert an `app_roles` row with role 'admin' for this user.
   - This user becomes the default owner for all existing records.

2. Backfill all existing records:
   - Set owner_user_id = user_id where user_id is not null (records already have an owner from prior migration).
   - Set owner_user_id = designated admin where owner_user_id is still null.
   - Set created_by_user_id and updated_by_user_id similarly.
   - For documents: set uploaded_by_user_id = owner_user_id, original_filename = name.

3. After backfill, make owner_user_id NOT NULL on all user-content tables.
   System config tables (oauth_configs, search_settings, knowledge_settings, users, role_permissions)
   remain nullable because they may be system-managed.

4. Add updated_at triggers to all tables.
*/

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN
    -- No users yet: skip backfill, columns stay nullable
    RETURN;
  END IF;

  -- Ensure admin role
  INSERT INTO public.app_roles (user_id, role)
  VALUES (v_admin_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  -- ai_connections: use existing user_id, fallback to admin
  UPDATE public.ai_connections SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- automations
  UPDATE public.automations SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- automation_runs
  UPDATE public.automation_runs SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- documents
  UPDATE public.documents SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id),
    uploaded_by_user_id = COALESCE(uploaded_by_user_id, user_id, v_admin_id),
    original_filename = COALESCE(original_filename, name)
    WHERE owner_user_id IS NULL;

  -- document_folders
  UPDATE public.document_folders SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- knowledge_bases
  UPDATE public.knowledge_bases SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- knowledge_documents
  UPDATE public.knowledge_documents SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- knowledge_chunks
  UPDATE public.knowledge_chunks SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- search_logs
  UPDATE public.search_logs SET
    owner_user_id = COALESCE(owner_user_id, user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  -- System config tables: set to admin
  UPDATE public.oauth_configs SET
    owner_user_id = COALESCE(owner_user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  UPDATE public.search_settings SET
    owner_user_id = COALESCE(owner_user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  UPDATE public.knowledge_settings SET
    owner_user_id = COALESCE(owner_user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  UPDATE public.users SET
    owner_user_id = COALESCE(owner_user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, v_admin_id)
    WHERE owner_user_id IS NULL;

  UPDATE public.role_permissions SET
    owner_user_id = COALESCE(owner_user_id, v_admin_id),
    created_by_user_id = COALESCE(created_by_user_id, v_admin_id),
    updated_by_user_id = COALESCE(updated_by_user_id, v_admin_id)
    WHERE owner_user_id IS NULL;
END $$;

-- Now enforce NOT NULL on user-content tables (safe after backfill)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.ai_connections ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.automations ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.automation_runs ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.documents ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.document_folders ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.knowledge_bases ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.knowledge_documents ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.knowledge_chunks ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE public.search_logs ALTER COLUMN owner_user_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
END $$;

-- Add updated_at triggers to all tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_connections', 'automations', 'automation_runs', 'documents',
    'document_folders', 'knowledge_bases', 'knowledge_documents',
    'knowledge_chunks', 'search_logs', 'oauth_configs', 'search_settings',
    'knowledge_settings', 'users', 'role_permissions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I;', t, t);
      EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;
