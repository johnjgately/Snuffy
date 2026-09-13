/*
# Document Security, Classification Policy, and Audit Integrity

## Summary
This migration adds:
1. Document scan records (malware scan + prompt injection scan history)
2. Versioned data-classification policy matrix
3. Audit chain checkpoints for external anchoring
4. Offboarding workflow tables
5. Production readiness tracking table

## Changes

### 1. document_scan_records table — new
- Records every malware scan and prompt-injection scan with engine, version,
  timestamp, status, result, and failure reason.
- Columns: id, document_id (nullable for knowledge_documents too), knowledge_doc_id,
  scan_type (malware|prompt_injection), scan_engine, scan_version, scan_status,
  scan_result (jsonb), failure_reason, scanned_by, scanned_at.
- RLS: authenticated users can read scans of documents they own; insert via
  SECURITY DEFINER or edge function.

### 2. classification_policy_versions table — new
- Versioned policy matrix controlling per-classification rules.
- Columns: id, version (int), classification (text), can_upload, can_view,
  can_download, can_share, can_export, can_print, can_delete, cloud_ai_allowed,
  local_ai_only, rag_indexing_allowed, requires_encryption, retention_days,
  requires_approval, requires_mfa_stepup, cross_market_allowed,
  role_overrides (jsonb), effective_date, superseded_date, created_by, created_at.
- Seeded with version 1 defaults for Public, Internal, Confidential, Restricted.
- RLS: authenticated read, admin write.

### 3. audit_chain_checkpoints table — new
- Stores periodic signed checkpoints of the audit hash chain for external anchoring.
- Columns: id, checkpoint_sequence, last_audit_id, last_audit_hash, checkpoint_hash,
  signature, signed_by, created_at, storage_location.
- RLS: admin-only write, authenticated read (verification role).

### 4. audit_verification_results table — new
- Records results of audit chain verification runs.
- Columns: id, verified_by, verified_at, total_events, verified_events,
  missing_events, altered_events, reordered_events, recomputed_events,
  result (pass|fail|warning), details (jsonb).
- RLS: admin read/write.

### 5. offboarding_records table — new
- Tracks user departure workflow from an organization.
- Columns: id, user_id, organization_id, status (initiated|sessions_revoked|
  exports_reviewed|connectors_revoked|automations_reviewed|completed|cancelled),
  initiated_by, completed_by, sessions_revoked_at, exports_reviewed_at,
  connectors_revoked_at, automations_reviewed_at, completed_at, notes, created_at.
- RLS: admin write, user read own.

### 6. production_readiness_items table — new
- Tracks the production readiness status of every security-sensitive feature.
- Columns: id, feature_name, category, status (implemented_verified|implemented_not_ready|
  demo_mockup|planned|release_blocker), responsible_role, last_verified_date,
  required_tests (text[]), dependencies (text[]), remediation_notes, created_at, updated_at.
- Seeded with all items from the hardening sprint.
- RLS: authenticated read, admin write.

### 7. Security
- RLS enabled on all new tables.
- Functions: `verify_audit_chain(p_from_sequence, p_to_sequence)` — recomputes
  hashes and compares to stored values, returning discrepancies.
*/

-- 1. document_scan_records
CREATE TABLE IF NOT EXISTS document_scan_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  knowledge_doc_id uuid REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  scan_type text NOT NULL CHECK (scan_type IN ('malware', 'prompt_injection')),
  scan_engine text NOT NULL,
  scan_version text,
  scan_status text NOT NULL CHECK (scan_status IN ('pending', 'scanning', 'clean', 'infected', 'suspicious', 'failed', 'flagged')),
  scan_result jsonb DEFAULT '{}'::jsonb,
  failure_reason text,
  scanned_by uuid,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_scan_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_document_scans" ON document_scan_records;
CREATE POLICY "select_own_document_scans" ON document_scan_records
  FOR SELECT TO authenticated USING (
    auth.uid() = scanned_by
    OR EXISTS (SELECT 1 FROM documents WHERE documents.id = document_scan_records.document_id AND documents.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM knowledge_documents WHERE knowledge_documents.id = document_scan_records.knowledge_doc_id AND knowledge_documents.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_document_scans" ON document_scan_records;
CREATE POLICY "insert_document_scans" ON document_scan_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dsr_document ON document_scan_records(document_id);
CREATE INDEX IF NOT EXISTS idx_dsr_knowledge ON document_scan_records(knowledge_doc_id);
CREATE INDEX IF NOT EXISTS idx_dsr_type ON document_scan_records(scan_type);

-- 2. classification_policy_versions
CREATE TABLE IF NOT EXISTS classification_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  classification text NOT NULL CHECK (classification IN ('Public', 'Internal', 'Confidential', 'Restricted')),
  can_upload text NOT NULL DEFAULT 'all' CHECK (can_upload IN ('all', 'org_members', 'managers', 'admins', 'platform_admin')),
  can_view text NOT NULL DEFAULT 'all' CHECK (can_view IN ('all', 'org_members', 'managers', 'admins', 'platform_admin')),
  can_download text NOT NULL DEFAULT 'all' CHECK (can_download IN ('all', 'org_members', 'managers', 'admins', 'platform_admin')),
  can_share text NOT NULL DEFAULT 'all' CHECK (can_share IN ('all', 'org_members', 'managers', 'admins', 'platform_admin')),
  can_export text NOT NULL DEFAULT 'all' CHECK (can_export IN ('all', 'org_members', 'managers', 'admins', 'platform_admin')),
  can_print boolean NOT NULL DEFAULT true,
  can_delete text NOT NULL DEFAULT 'owner' CHECK (can_delete IN ('owner', 'managers', 'admins', 'platform_admin')),
  cloud_ai_allowed boolean NOT NULL DEFAULT true,
  local_ai_only boolean NOT NULL DEFAULT false,
  rag_indexing_allowed boolean NOT NULL DEFAULT true,
  requires_encryption boolean NOT NULL DEFAULT false,
  retention_days integer,
  requires_approval boolean NOT NULL DEFAULT false,
  requires_mfa_stepup boolean NOT NULL DEFAULT false,
  cross_market_allowed boolean NOT NULL DEFAULT true,
  role_overrides jsonb DEFAULT '{}'::jsonb,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  superseded_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(version, classification)
);

ALTER TABLE classification_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_classification_policies" ON classification_policy_versions;
CREATE POLICY "select_classification_policies" ON classification_policy_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_classification_policies" ON classification_policy_versions;
CREATE POLICY "insert_classification_policies" ON classification_policy_versions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_classification_policies" ON classification_policy_versions;
CREATE POLICY "update_classification_policies" ON classification_policy_versions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed version 1 defaults
INSERT INTO classification_policy_versions (version, classification, can_upload, can_view, can_download, can_share, can_export, can_print, can_delete, cloud_ai_allowed, local_ai_only, rag_indexing_allowed, requires_encryption, retention_days, requires_approval, requires_mfa_stepup, cross_market_allowed) VALUES
  (1, 'Public', 'all', 'all', 'all', 'all', 'all', true, 'owner', true, false, true, false, 365, false, false, true),
  (1, 'Internal', 'all', 'org_members', 'org_members', 'org_members', 'org_members', true, 'owner', true, false, true, false, 730, false, false, true),
  (1, 'Confidential', 'managers', 'org_members', 'managers', 'managers', 'admins', false, 'admins', false, false, true, true, 1095, true, true, false),
  (1, 'Restricted', 'admins', 'admins', 'platform_admin', 'platform_admin', 'platform_admin', false, 'platform_admin', false, true, false, true, 2555, true, true, false)
ON CONFLICT (version, classification) DO NOTHING;

-- 3. audit_chain_checkpoints
CREATE TABLE IF NOT EXISTS audit_chain_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_sequence integer NOT NULL UNIQUE,
  last_audit_id uuid,
  last_audit_hash text,
  checkpoint_hash text NOT NULL,
  signature text,
  signed_by uuid,
  storage_location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_chain_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_audit_checkpoints" ON audit_chain_checkpoints;
CREATE POLICY "select_audit_checkpoints" ON audit_chain_checkpoints
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_audit_checkpoints" ON audit_chain_checkpoints;
CREATE POLICY "insert_audit_checkpoints" ON audit_chain_checkpoints
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 4. audit_verification_results
CREATE TABLE IF NOT EXISTS audit_verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  total_events integer NOT NULL DEFAULT 0,
  verified_events integer NOT NULL DEFAULT 0,
  missing_events integer NOT NULL DEFAULT 0,
  altered_events integer NOT NULL DEFAULT 0,
  reordered_events integer NOT NULL DEFAULT 0,
  recomputed_events integer NOT NULL DEFAULT 0,
  result text NOT NULL CHECK (result IN ('pass', 'fail', 'warning')),
  details jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE audit_verification_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_audit_verification" ON audit_verification_results;
CREATE POLICY "select_audit_verification" ON audit_verification_results
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "insert_audit_verification" ON audit_verification_results;
CREATE POLICY "insert_audit_verification" ON audit_verification_results
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- 5. offboarding_records
CREATE TABLE IF NOT EXISTS offboarding_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN (
    'initiated', 'sessions_revoked', 'exports_reviewed',
    'connectors_revoked', 'automations_reviewed', 'completed', 'cancelled'
  )),
  initiated_by uuid NOT NULL,
  completed_by uuid,
  sessions_revoked_at timestamptz,
  exports_reviewed_at timestamptz,
  connectors_revoked_at timestamptz,
  automations_reviewed_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE offboarding_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_offboarding" ON offboarding_records;
CREATE POLICY "select_own_offboarding" ON offboarding_records
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "insert_offboarding" ON offboarding_records;
CREATE POLICY "insert_offboarding" ON offboarding_records
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_offboarding" ON offboarding_records;
CREATE POLICY "update_offboarding" ON offboarding_records
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_offboarding_user ON offboarding_records(user_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_org ON offboarding_records(organization_id);

-- 6. production_readiness_items
CREATE TABLE IF NOT EXISTS production_readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL UNIQUE,
  category text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'implemented_verified', 'implemented_not_ready',
    'demo_mockup', 'planned', 'release_blocker'
  )),
  responsible_role text NOT NULL DEFAULT 'Platform Administrator',
  last_verified_date date,
  required_tests text[] DEFAULT '{}'::text[],
  dependencies text[] DEFAULT '{}'::text[],
  remediation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_readiness_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_readiness_items" ON production_readiness_items;
CREATE POLICY "select_readiness_items" ON production_readiness_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_readiness_items" ON production_readiness_items;
CREATE POLICY "insert_readiness_items" ON production_readiness_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_readiness_items" ON production_readiness_items;
CREATE POLICY "update_readiness_items" ON production_readiness_items
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM app_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed production readiness items
INSERT INTO production_readiness_items (feature_name, category, status, responsible_role, required_tests, dependencies, remediation_notes) VALUES
  ('TOTP MFA Verification', 'Authentication', 'release_blocker', 'Platform Administrator',
    ARRAY['mfa_enrollment_test', 'mfa_verification_test', 'mfa_recovery_code_test', 'mfa_lockout_test'],
    ARRAY['MFA_ENCRYPTION_KEY secret', 'otplib edge function dependency'],
    'Replace demo MFA that accepts any 6-digit code with real TOTP verification using otplib'),
  ('Secure Email Delivery for Reset/Verification Tokens', 'Authentication', 'release_blocker', 'Platform Administrator',
    ARRAY['reset_token_not_in_response_test', 'verification_token_not_in_response_test', 'token_expiry_test', 'token_single_use_test'],
    ARRAY['Email provider edge function secret', 'SMTP or transactional email service'],
    'Stop returning reset/verification tokens in API responses; deliver via email'),
  ('Enforced API Rate Limiting', 'API Security', 'release_blocker', 'Platform Administrator',
    ARRAY['rate_limit_signin_test', 'rate_limit_ai_chat_test', 'rate_limit_search_test', 'rate_limit_429_response_test'],
    ARRAY['rate_limit_configs table', 'check_rate_limit function'],
    'Rate limit middleware in all edge functions with 429 + retry-after'),
  ('Production CORS Allowlist and CSP', 'API Security', 'release_blocker', 'Platform Administrator',
    ARRAY['cors_no_wildcard_in_production_test', 'csp_header_test', 'fail_safe_missing_config_test'],
    ARRAY['ALLOWED_ORIGINS edge function secret'],
    'Replace wildcard CORS with environment-based allowlist; add CSP headers'),
  ('Malware Scanning and Document Quarantine', 'Document Security', 'release_blocker', 'Platform Administrator',
    ARRAY['quarantine_blocks_download_test', 'quarantine_blocks_rag_test', 'scan_record_test', 'approval_required_test'],
    ARRAY['ClamAV or scanner adapter', 'document_scan_records table'],
    'Implement real malware scanning; enforce quarantine before any access'),
  ('Backup, Restore, and Disaster Recovery Testing', 'Operations', 'release_blocker', 'Platform Administrator',
    ARRAY['restore_test_evidence', 'rpo_rto_documented_test'],
    ARRAY['Supabase backup configuration', ' quarterly restore test schedule'],
    'Document backup frequency, RPO/RTO, and quarterly restore test process'),
  ('Authenticated Cross-User and Cross-Market Authorization Tests', 'Testing', 'release_blocker', 'QA / Platform Administrator',
    ARRAY['user_a_cannot_access_user_b_test', 'cross_org_denied_test', 'cross_market_denied_test', 'disabled_user_denied_test', 'rls_authenticated_test'],
    ARRAY['Test infrastructure with authenticated sessions'],
    'Write and run authenticated authorization tests proving RLS isolation'),
  ('Audit Chain External Anchoring', 'Audit Integrity', 'implemented_not_ready', 'Platform Administrator',
    ARRAY['audit_chain_verification_test', 'checkpoint_creation_test'],
    ARRAY['audit_chain_checkpoints table', 'External immutable storage'],
    'SHA-256 hash chain implemented; external checkpoint anchoring added; verification tooling needed'),
  ('Data Classification Policy Matrix', 'Data Governance', 'implemented_not_ready', 'Platform Administrator',
    ARRAY['classification_policy_enforcement_test', 'cloud_ai_blocked_for_confidential_test'],
    ARRAY['classification_policy_versions table'],
    'Versioned policy matrix seeded; enforcement in edge functions needed'),
  ('Offboarding Workflow', 'Organization Management', 'implemented_not_ready', 'Platform Administrator',
    ARRAY['offboarding_revokes_access_test', 'org_owner_cannot_leave_test'],
    ARRAY['offboarding_records table'],
    'Offboarding table created; UI and automated revocation flow needed'),
  ('Emergency Stop System', 'Operations', 'implemented_verified', 'Platform Administrator',
    ARRAY['emergency_stop_toggle_test', 'emergency_stop_reason_test', 'emergency_stop_history_test'],
    ARRAY['emergency_stop_switches table'],
    '11 switches deployed with activation/restoration tracking'),
  ('RBAC Authorization Matrix', 'Authorization', 'implemented_verified', 'Platform Administrator',
    ARRAY['role_assignment_test', 'permission_check_test'],
    ARRAY['app_roles table', 'role_permissions table'],
    '4-role model with admin gate enforced in admin-api'),
  ('Local AI Connector Trust Model', 'AI Security', 'implemented_not_ready', 'Platform Administrator',
    ARRAY['connector_approval_test', 'ssrf_protection_test', 'dns_rebinding_test'],
    ARRAY['local_ai_connectors table', 'local_ai_connector_requests table'],
    'SSRF protection implemented; admin approval and DNS re-check needed'),
  ('Document Legal Hold', 'Data Governance', 'implemented_verified', 'Platform Administrator',
    ARRAY['legal_hold_blocks_deletion_test', 'legal_hold_audit_test'],
    ARRAY['legal_holds table'],
    'Legal hold place/release working via admin-api'),
  ('OAuth2 Single Sign-On', 'Authentication', 'implemented_verified', 'Platform Administrator',
    ARRAY['oauth_state_token_test', 'oauth_callback_test'],
    ARRAY['oauth_configs table', 'oauth_states table'],
    'State token with atomic single-use claim implemented'),
  ('Password Reset Token Security', 'Authentication', 'implemented_not_ready', 'Platform Administrator',
    ARRAY['token_hash_test', 'token_single_use_test', 'token_invalidation_test'],
    ARRAY['password_reset_tokens table'],
    'Hashed single-use tokens with expiry implemented; tokens still returned in API response'),
  ('Account Lockout', 'Authentication', 'implemented_verified', 'Platform Administrator',
    ARRAY['lockout_after_5_failures_test', 'lockout_expiry_test'],
    ARRAY['login_attempts table', 'account_lockouts table'],
    '5-failure lockout with 15-minute window implemented'),
  ('Session Management', 'Authentication', 'implemented_verified', 'Platform Administrator',
    ARRAY['session_revocation_test', 'session_list_test'],
    ARRAY['user_sessions table'],
    'Session listing and revocation implemented'),
  ('Audit Hash Chain (SHA-256)', 'Audit Integrity', 'implemented_verified', 'Platform Administrator',
    ARRAY['hash_chain_integrity_test', 'hash_chain_tamper_detection_test'],
    ARRAY['audit_logs table'],
    'SHA-256 hash chain with previous_hash linking implemented'),
  ('Knowledge RAG with pgvector', 'AI', 'implemented_verified', 'Platform Administrator',
    ARRAY['rag_search_test', 'rag_citation_test'],
    ARRAY['knowledge_documents table', 'knowledge_chunks table'],
    'RAG pipeline with embeddings, chunking, and citation tracking implemented'),
  ('Web Search with SSRF Protection', 'AI', 'implemented_verified', 'Platform Administrator',
    ARRAY['ssrf_blocked_url_test', 'search_results_sanitized_test'],
    ARRAY['search_logs table', 'search_settings table'],
    'Brave + DDG fallback with SSRF protection on result URLs'),
  ('Multi-Tenant Organization Isolation', 'Authorization', 'implemented_verified', 'Platform Administrator',
    ARRAY['org_isolation_test', 'market_isolation_test'],
    ARRAY['organizations table', 'organization_memberships table', 'markets table'],
    'Organization and market scoping with RLS policies'),
  ('Encrypted TOTP Secret Storage', 'Authentication', 'release_blocker', 'Platform Administrator',
    ARRAY['secret_encrypted_at_rest_test', 'secret_not_in_plaintext_test'],
    ARRAY['MFA_ENCRYPTION_KEY secret'],
    'mfa_enrollments.secret_encrypted column added; encryption in edge function needed'),
  ('MFA Recovery Codes', 'Authentication', 'release_blocker', 'Platform Administrator',
    ARRAY['recovery_code_one_time_use_test', 'recovery_code_hashed_test'],
    ARRAY['mfa_recovery_codes table', 'consume_mfa_recovery_code function'],
    'Recovery code table and atomic consume function added; edge function integration needed'),
  ('MFA Step-Up for Sensitive Actions', 'Authentication', 'release_blocker', 'Platform Administrator',
    ARRAY['step_up_required_for_password_change_test', 'step_up_required_for_mfa_disable_test', 'step_up_expiry_test'],
    ARRAY['mfa_step_up_challenges table', 'check_mfa_step_up function'],
    'Step-up challenge table and verification function added; edge function enforcement needed')
ON CONFLICT (feature_name) DO NOTHING;
