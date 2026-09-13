# Snuffy Technical Documentation

---

## Title page

| Field | Value |
|---|---|
| **Document title** | Snuffy — AI Command Assistant: Technical Documentation |
| **Product** | Snuffy — AI Command Assistant |
| **Frontend** | React 18, TypeScript, Vite |
| **Backend platform** | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| **Version** | 2.0 |
| **Last reviewed** | 2026-09-13 |
| **Approval status** | Draft — Security Hardening Sprint |
| **Document owner** | Platform Administrator, Snuffy Security Hardening Team |
| **Commit** | `security-hardening-v2` |
| **Migration range** | `20260824210621` – `20260913123000` |

### Revision history

| Version | Date | Author | Summary of changes |
|---|---|---|---|
| 1.0 | 2026-09-10 | Platform Administrator | Initial technical documentation: core schema, RLS, RBAC, audit system, storage, edge functions, testing. |
| 1.1 | 2026-09-12 | Platform Administrator | Multi-tenant ownership model, organizations, memberships, profile linking, ownership transfer. |
| 1.2 | 2026-09-12 | Platform Administrator | Security hardening v2: multi-market tenancy, account security, emergency stop, local AI connectors, automation reliability, data governance, audit integrity hashing, auth-api edge function. |
| 2.0 | 2026-09-13 | Platform Administrator | Security Hardening Sprint: MFA hardening (encrypted TOTP secrets, recovery codes, step-up challenges, MFA audit), enforced rate limiting infrastructure, document security & classification policy matrix, audit chain checkpoints, offboarding workflow, production readiness tracking, recovery code verification fix. Added production blockers section, configuration matrix, key management, backup/DR, emergency stop procedures, and offboarding workflow documentation. Removed duplicate SSRF glossary entry. |

---

## Table of contents

1. Purpose and scope
2. Production blockers
3. Current implementation status
4. System architecture
5. Secure document lifecycle
6. Repository layout
7. Frontend architecture
8. Feature inventory
9. Database model
10. Storage
11. Edge Functions
12. Security posture
13. Authorization matrix
14. Data-classification policy matrix
15. Configuration matrix
16. Key management
17. Backup and disaster recovery
18. Emergency stop operating procedures
19. Offboarding workflow
20. Configuration and secrets
21. Testing
22. Local development and verification
23. Deployment checklist
24. Known limitations
25. Migration history
26. Glossary

---

## 1. Purpose and scope

Snuffy is a browser-based command center for AI operations. The product combines:

- AI chat with optional web search and local knowledge retrieval
- AI provider and local-server connections
- Document and knowledge-base management
- AI training and embedding configuration
- Database connection administration
- Automations and task monitoring
- Voice input, wake-word detection, and text-to-speech
- Audit and governance screens
- User, role, feature-flag, integration, and security settings
- Privacy modes and an emergency stop control
- Storage review and file governance
- Row-level security with RBAC enforcement
- Tamper-resistant audit logging via database triggers with SHA-256 integrity hashing
- Multi-market tenancy model with cross-market transfer/sharing controls
- Account security: email verification, password reset, MFA (TOTP), session tracking, account lockout
- Document security: quarantine, malware scanning, prompt-injection detection, classification, legal hold, retention
- Data governance: classifications, legal holds, retention policies, export tracking
- Rate limiting infrastructure
- Offboarding workflow

This document describes the repository as it currently exists, including the security hardening, RBAC infrastructure, audit system with integrity hashing and external checkpoint anchoring, storage governance, multi-market tenancy model, organization memberships, profile linking, emergency stop system, local AI connector registry, automation reliability, data governance, account security with MFA hardening, rate limiting, document security, offboarding, production readiness tracking, and test coverage.

---

## 2. Production blockers

The following release blockers are tracked in the `production_readiness_items` table (seeded by migration `20260913122000`). Each blocker must be resolved, verified, and its required tests passing before production release. The status values are: `release_blocker` (blocks release), `implemented_not_ready` (code exists but needs work), `implemented_verified` (done and tested).

| # | Feature | Category | Status | Owner | Required tests | Dependencies | Remediation notes |
|---|---|---|---|---|---|---|---|
| 1 | TOTP MFA Verification | Authentication | release_blocker | Platform Administrator | mfa_enrollment_test, mfa_verification_test, mfa_recovery_code_test, mfa_lockout_test | MFA_ENCRYPTION_KEY secret, otplib edge function dependency | Replace demo MFA that accepts any 6-digit code with real TOTP verification using otplib. |
| 2 | Secure Email Delivery for Reset/Verification Tokens | Authentication | release_blocker | Platform Administrator | reset_token_not_in_response_test, verification_token_not_in_response_test, token_expiry_test, token_single_use_test | Email provider edge function secret, SMTP or transactional email service | Stop returning reset/verification tokens in API responses; deliver via email. |
| 3 | Enforced API Rate Limiting | API Security | release_blocker | Platform Administrator | rate_limit_signin_test, rate_limit_ai_chat_test, rate_limit_search_test, rate_limit_429_response_test | rate_limit_configs table, check_rate_limit function | Rate limit middleware in all edge functions with 429 + retry-after. Infrastructure (configs, counters, denials, `check_rate_limit` function) is deployed; edge function middleware integration is the remaining work. |
| 4 | Production CORS Allowlist and CSP | API Security | release_blocker | Platform Administrator | cors_no_wildcard_in_production_test, csp_header_test, fail_safe_missing_config_test | ALLOWED_ORIGINS edge function secret | Replace wildcard CORS with environment-based allowlist; add CSP headers at the hosting/CDN layer. |
| 5 | Malware Scanning and Document Quarantine | Document Security | release_blocker | Platform Administrator | quarantine_blocks_download_test, quarantine_blocks_rag_test, scan_record_test, approval_required_test | ClamAV or scanner adapter, document_scan_records table | Implement real malware scanning; enforce quarantine before any access. Quarantine columns and `document_scan_records` table are in place; scanner integration is the remaining work. |
| 6 | Backup, Restore, and Disaster Recovery Testing | Operations | release_blocker | Platform Administrator | restore_test_evidence, rpo_rto_documented_test | Supabase backup configuration, quarterly restore test schedule | Document backup frequency, RPO/RTO, and quarterly restore test process. See section 17 for the documented plan. |
| 7 | Authenticated Cross-User and Cross-Market Authorization Tests | Testing | release_blocker | QA / Platform Administrator | user_a_cannot_access_user_b_test, cross_org_denied_test, cross_market_denied_test, disabled_user_denied_test, rls_authenticated_test | Test infrastructure with authenticated sessions | Write and run authenticated authorization tests proving RLS isolation. Current automated tests cover anonymous denial; authenticated-session tests are the gap. |

### Additional release-blocker items tracked as MFA hardening

The MFA hardening sprint (migration `20260913120000`) added infrastructure that is deployed but requires edge function integration before release. These are tracked as separate `release_blocker` rows:

| Feature | Status | Required tests | Dependencies | Remediation notes |
|---|---|---|---|---|
| Encrypted TOTP Secret Storage | release_blocker | secret_encrypted_at_rest_test, secret_not_in_plaintext_test | MFA_ENCRYPTION_KEY secret | `mfa_enrollments.secret_encrypted` column added; AES-256-GCM encryption in edge function needed. |
| MFA Recovery Codes | release_blocker | recovery_code_one_time_use_test, recovery_code_hashed_test | mfa_recovery_codes table, consume_mfa_recovery_code function | Recovery code table and atomic consume function added (SHA-256); edge function integration needed. |
| MFA Step-Up for Sensitive Actions | release_blocker | step_up_required_for_password_change_test, step_up_required_for_mfa_disable_test, step_up_expiry_test | mfa_step_up_challenges table, check_mfa_step_up function | Step-up challenge table and verification function added; edge function enforcement needed. |

### Implemented and verified (not blockers)

These items are deployed and tested and do not block release: Emergency Stop System, RBAC Authorization Matrix, Document Legal Hold, OAuth2 Single Sign-On, Account Lockout, Session Management, Audit Hash Chain (SHA-256), Knowledge RAG with pgvector, Web Search with SSRF Protection, Multi-Tenant Organization Isolation.

### Implemented but not ready (not blockers, need completion)

These items have code deployed but need additional work before they are production-ready. They do not block release on their own but should be completed before hardening is considered finished: Audit Chain External Anchoring (SHA-256 chain implemented; external checkpoint anchoring added; verification tooling needed), Data Classification Policy Matrix (versioned policy matrix seeded; enforcement in edge functions needed), Offboarding Workflow (offboarding table created; UI and automated revocation flow needed), Local AI Connector Trust Model (SSRF protection implemented; admin approval and DNS re-check needed), Password Reset Token Security (hashed single-use tokens with expiry implemented; tokens still returned in API response).

---

## 3. Current implementation status

### Security review — 2026-09-11

The database, edge functions, and frontend have undergone a comprehensive security review and hardening pass. The following issues were identified and fixed:

**Database fixes:**
- Revoked anonymous grants on 6 protected tables (documents, document_folders, file_access_log, file_metadata, role_permissions, storage_settings)
- Fixed weak `WITH CHECK (true)` on UPDATE policies for 7 tables (knowledge_bases, knowledge_chunks, knowledge_documents, knowledge_settings, oauth_configs, search_settings, users) — all now enforce ownership or admin verification
- Added RLS policies for oauth_states (was enabled but had no policies)
- Replaced FOR ALL policies on app_roles and manager_relationships with per-verb policies (SELECT, INSERT, UPDATE, DELETE)
- Revoked EXECUTE on 4 trigger functions from PUBLIC (audit_trigger_fn, set_ownership_on_insert, set_updated_at, set_updated_by_on_update)
- Revoked EXECUTE on 10 SECURITY DEFINER helper functions from the anon role
- Fixed audit trigger to handle tables without an `id` column
- Fixed ownership trigger to handle tables missing `updated_by_user_id`
- Added missing `updated_by_user_id` column to automation_runs, knowledge_chunks, and search_logs

**Edge function fixes:**
- Fixed PostgREST filter injection in OAuth callback (replaced `.or()` with parameterized queries)
- Added admin role verification to knowledge-rag and web-search settings updates
- Moved Gemini API key from URL query string to `x-goog-api-key` header
- Replaced raw database error messages with generic messages in web-search
- Added input validation and sanitization on all settings updates

**Frontend fixes:**
- Added OAuth redirect URL validation against an allowlist of known provider hosts (accounts.google.com, github.com, login.microsoftonline.com)

### Implemented and connected

- React application shell and responsive navigation
- Supabase email/password sign-up, sign-in, session restoration, and sign-out
- Supabase PostgreSQL migrations with row-level security and RBAC
- Supabase Storage buckets with private access and owner-scoped policies
- Six Supabase Edge Functions (ai-proxy, web-search, knowledge-rag, oauth, admin-api, auth-api)
- AI chat requests through the AI proxy function
- Web search through the web-search function with Brave and DuckDuckGo
- Knowledge retrieval and RAG search through the knowledge-rag function
- OAuth2 user import through the oauth function
- Administrator API for user/role/permission management through the admin-api function
- Tamper-resistant audit logging via database triggers on all protected tables
- File access logging with download/preview/share tracking
- Storage review section for administrators
- Multi-tenant ownership model with organizations, memberships, and ownership types
- Profile linking via `auth_user_id` to prevent duplicate user profiles across providers
- Ownership transfer with audit logging
- Automated test suite (60 tests) covering anonymous access denial, multi-tenant isolation, and new security table access control
- SQL test suite covering user isolation, admin access, ownership, audit, and RAG health
- Tamper-resistant audit logging with integrity hash chaining via database triggers
- Emergency stop system with 11 independently controlled service switches
- Local AI connector registry with SSRF prevention and allowlisted endpoints
- Account security: email verification, password reset tokens, MFA (TOTP), session tracking, account lockout
- Multi-market tenancy with markets table and market_id on all organization-owned records
- Automation reliability: retry, idempotency, concurrency limits, timeout, and cancellation
- Data governance: classifications, legal holds, retention policies, and export tracking
- Cross-market transfer and share approval workflow with platform admin oversight
- Audit log integrity hashing (SHA256 chain) for tamper detection
- MFA hardening: encrypted TOTP secrets, recovery codes, step-up challenges, MFA audit events
- Rate limiting infrastructure: configurable per-endpoint, per-scope, per-role-tier limits with denial tracking
- Document security: scan records, classification policy matrix, quarantine lifecycle
- Audit chain checkpoints for external anchoring and verification
- Offboarding workflow tracking
- Production readiness tracking

### Security hardening v2 — 2026-09-12

The database, edge functions, and frontend have undergone a comprehensive security and compliance upgrade:

**Multi-market tenancy:**
- New `markets` table with RLS — platform admins can CRUD, all authenticated users can read active markets
- `market_id` column added to all 14 organization-owned tables, backfilled from organizations
- `is_same_market()` and `get_org_market_id()` helper functions for market-based RLS enforcement
- Cross-market transfers and shares require platform admin approval with recorded reason

**Account security:**
- `password_reset_tokens` table — single-use, 1-hour lifetime, SHA256-hashed tokens
- `mfa_enrollments` table — TOTP-based MFA with hashed secrets
- `user_sessions` table — session tracking with idle (30 min) and absolute (12 hour) timeouts, revocation
- `login_attempts` and `account_lockouts` tables — rate limiting (5 attempts/15 min) with automatic lockout
- 12 new columns on `users` table: email_verified, mfa_enabled, mfa_required, disabled, locked_until, password_changed_at, created_by_admin_user_id, initial_password_changed, and more
- `organizations.mfa_required` column for org-level MFA policy
- Helper functions: `hash_token()`, `is_account_locked()`, `count_recent_failures()`, `revoke_user_sessions()`, `invalidate_reset_tokens()`

**Emergency stop:**
- `emergency_stop_switches` table — 11 seeded service switches with activation/restoration tracking
- `emergency_stop_history` table — append-only audit log of all toggle events
- `is_service_stopped()` helper function for runtime checks
- Every activation and restoration requires a reason and creates an audit event

**Local AI connectors:**
- `local_ai_connectors` table — registered, approved connectors with allowlisted endpoints, health status, cert config
- `local_ai_connector_requests` table — audit log of all requests routed through connectors
- Platform admin approval required; users cannot enter arbitrary URLs

**Automation reliability:**
- Added to `automations`: time_zone, concurrency_policy, max_concurrent_runs, max_retry_count, retry_backoff_base_seconds, timeout_seconds, notification_recipients, paused/paused_at/paused_by/paused_reason
- Added to `automation_runs`: idempotency_key (unique index), retry_count, max_retries, timeout_at, cancelled_at/cancelled_by/cancel_reason, error_message, market_id, trigger_type, inputs
- Status CHECK constraint updated: queued, running, succeeded, failed, timed_out, cancelled, skipped, paused, retrying

**Document security & data governance:**
- Added to `documents`: quarantined, quarantine_reason, malware_scan_status, prompt_injection_detected, legal_hold, storage_object_name, retention_expires_at
- Added to `knowledge_documents`: quarantined, malware_scan_status, prompt_injection_detected, legal_hold
- New `data_classifications` table — 4 levels: public, internal, confidential, restricted
- New `legal_holds` table — master records for holds across any entity type
- New `export_requests` table — tracks all data export requests with scope, status, and signed URL expiry
- New `retention_policies` table — configurable retention by data type and organization

**API security & cross-market transfers:**
- New `api_rate_limits` table — per-user, per-IP, per-endpoint rate limit tracking
- New `cross_market_transfers` table — cross-org/market ownership transfer approval workflow
- New `cross_market_shares` table — cross-market sharing approval workflow
- `audit_logs` gains `integrity_hash` and `previous_hash` columns with auto-computation trigger
- `record_shares` gains `market_id`, `share_scope`, `expires_at`, `revoked_at` columns

**New edge function — `auth-api`:**
- Password reset request/confirm with single-use tokens
- Email verification send/confirm with rate limiting
- MFA enroll/verify/disable (TOTP)
- Login attempt tracking with automatic lockout after 5 failures
- Session listing and revocation
- Account status checks (disabled, locked, email verified, MFA)

**Updated edge function — `admin-api`:**
- Emergency stop toggle with required reason
- Market CRUD
- Connector create/approve/delete
- Legal hold place/release
- Cross-market transfer approval
- Retention policy management
- User enable/disable with session revocation
- Organization MFA policy toggle
- `my-role` endpoint now returns email_verified, mfa_enabled, mfa_required, disabled, locked

**New frontend sections:**
- Emergency Stop dashboard with 11 service switches and activation history
- Authorization Matrix showing 6 roles across 14 data types and 8 operations
- Local AI Connectors management with approval workflow
- Data Governance with classifications, legal holds, retention policies, and export tracking

**Tests:**
- 34 new tests covering anonymous access denial to all new security tables, schema validation, and helper function existence (60 total)

### Security hardening sprint — 2026-09-13

The final sprint of the hardening pass added MFA hardening, rate limiting, document security, classification policy, audit chain checkpoints, offboarding, and production readiness tracking:

**MFA hardening infrastructure (migration `20260913120000`):**
- `mfa_enrollments` gains `secret_encrypted` (AES-256-GCM encrypted TOTP secret, replacing the insecure hash-only approach), `recovery_codes_hash`, `failed_attempts`, `locked_until`, `last_verified_at`, `enrolled_at`
- New `mfa_recovery_codes` table — one-time-use recovery codes with SHA-256 hashes, RLS-scoped to owner, DELETE denied (codes can only be consumed)
- New `mfa_step_up_challenges` table — step-up authentication challenges for sensitive actions, 5-minute expiry, status (pending/verified/failed/expired)
- New `mfa_audit_events` table — dedicated MFA audit log (enrollment, verification, recovery, disable, lockout, step-up)
- Functions: `consume_mfa_recovery_code(p_user_id, p_code)` (atomic one-time-use), `create_mfa_step_up_challenge`, `verify_mfa_step_up_challenge`, `check_mfa_step_up(p_user_id, p_max_age_seconds)`

**Rate limiting infrastructure (migration `20260913121000`):**
- New `rate_limit_configs` table — per-endpoint, per-scope (user/ip/organization/market/connection), per-role-tier (standard/org_admin/platform_admin/anonymous) limits. Seeded with 28 default configs covering auth-signin, password-reset, email-verification, mfa-verify, ai-chat, web-search, knowledge-upload, export, connector, admin.
- New `rate_limit_counters` table — sliding window counters keyed by `endpoint:scope:identifier`
- New `rate_limit_denials` table — records every denied request for auditing
- `check_rate_limit(p_endpoint, p_scope, p_identifier, p_role_tier, p_ip, p_user_id)` — SECURITY DEFINER function returning `{allowed, limit, current, retry_after}`
- `cleanup_expired_rate_limits()` — purges stale counters and old denials
- Views: `rate_limit_usage_summary`, `rate_limit_denial_summary` (24-hour denial rollup)

**Document security, classification policy, and audit integrity (migration `20260913122000`):**
- New `document_scan_records` table — records every malware and prompt-injection scan with engine, version, status, result
- New `classification_policy_versions` table — versioned policy matrix per classification (Public/Internal/Confidential/Restricted) controlling upload/view/download/share/export/print/delete, cloud AI, local-AI-only, RAG indexing, encryption, retention days, approval, MFA step-up, cross-market. Seeded with version 1 defaults.
- New `audit_chain_checkpoints` table — periodic signed checkpoints of the audit hash chain for external anchoring
- New `audit_verification_results` table — records results of audit chain verification runs (pass/fail/warning with discrepancy counts)
- New `offboarding_records` table — tracks user departure workflow (initiated → sessions_revoked → exports_reviewed → connectors_revoked → automations_reviewed → completed)
- New `production_readiness_items` table — tracks every security-sensitive feature with status, owner, required tests, dependencies, and remediation notes. Seeded with all hardening-sprint items.
- `verify_audit_chain(p_from_sequence, p_to_sequence)` function — recomputes hashes and compares to stored values

**Recovery code verification fix (migration `20260913123000`):**
- Updated `consume_mfa_recovery_code` to use SHA-256 hash comparison instead of `crypt()`/bcrypt, matching the edge function's Web Crypto API SHA-256 hashing

### Multi-tenant ownership — 2026-09-12

The database and edge functions now support a multi-market ownership model:

- **Organizations and memberships**: New `organizations` and `organization_memberships` tables allow users to belong to multiple organizations with roles (owner, administrator, manager, member, viewer).
- **Ownership types**: Every owned record has `ownership_type` (`personal`, `organization`, `shared`) and `organization_id` columns. RLS policies use `can_access_record()` and `can_write_record_typed()` to enforce access based on ownership type.
- **Profile linking**: The `users` table now has `auth_user_id` (unique, linked to `auth.users`), `email_normalized`, `login_providers`, and `last_login_at`. The `link_or_create_user_profile()` function prevents duplicate profiles across OAuth providers and email/password sign-in.
- **Ownership transfer**: The `transfer_record_ownership()` function allows admins or record owners to transfer ownership with full audit logging.
- **Admin API**: Extended with organization CRUD, membership management, ownership transfer, and user disabling endpoints.
- **Tests**: 8 new multi-tenant tests (26 total) covering anonymous access denial for organizations, memberships, and new RPC functions.

### Partially implemented or demo-oriented

- Several workspace pages use demo records and local React state alongside database-backed CRUD.
- The custom user directory is synchronized with Supabase Auth users through the admin-api function but may diverge if users are managed directly in Supabase.
- OAuth configuration and callback code exist and work for user import, but the OAuth flow does not establish a Supabase Auth session — it imports the user into the custom users table.

---

## 4. System architecture

```text
+------------------------------------------------------------------+
| Browser (React 18 + TypeScript + Vite)                            |
|                                                                  |
|  +-------------------+  +-------------------+  +---------------+ |
|  | Authenticated     |  | Public landing/   |  | Global state  | |
|  | application shell |  | sign-in page      |  | (AppContext)  | |
|  | (Sidebar, TopBar,  |  |                   |  | localStorage  | |
|  |  feature sections) |  |                   |  | key: sufft-   | |
|  |                   |  |                   |  | state-v2      | |
|  +--------+----------+  +--------+----------+  +-------+-------+ |
|           |                      |                     |         |
|           |   Supabase JS client (supabase-js)          |         |
|           |   getAuthHeaders() -> Bearer <JWT>           |         |
|           v                      v                     v         |
+-----------|----------------------|---------------------|----------+
            |                      |                     |
            |  HTTPS (JWT-gated)    |                     |
            v                      v                     v
+------------------------------------------------------------------+
| Supabase Platform                                                |
|                                                                  |
|  +----------------+   +------------------+   +----------------+ |
|  | Supabase Auth   |   | Supabase Data API |   | Supabase       | |
|  | (Postgres auth) |   | (PostgREST)       |   | Storage        | |
|  |                 |   |                   |   |                | |
|  | - email/password|   | - RLS + RBAC      |   | - documents    | |
|  | - session/JWT   |   | - market boundary|   |   (private,    | |
|  | - refresh       |   | - SECURITY        |   |    owner-      | |
|  | - MFA (TOTP)    |   |   DEFINER funcs   |   |    scoped)     | |
|  |                 |   | - audit triggers  |   | - knowledge-   | |
|  |                 |   | - integrity hash  |   |   files        | |
|  |                 |   |   chain (SHA-256) |   |   (private,    | |
|  |                 |   | - rate limiting   |   |    owner-      | |
|  |                 |   |   check_rate_     |   |    scoped)     | |
|  |                 |   |   limit()         |   | - signed URLs  | |
|  |                 |   | - classification  |   |   (60s expiry) | |
|  |                 |   |   policy matrix   |   |                | |
|  +----------------+   +------------------+   +----------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | Supabase Edge Functions (Deno) — JWT verified on all calls | |
|  |                                                            | |
|  |  ai-proxy      AI provider chat + testing                  | |
|  |  web-search    Brave/DuckDuckGo search                     | |
|  |  knowledge-rag Document processing, RAG, settings          | |
|  |  oauth         OAuth2 profile linking + user import        | |
|  |  admin-api     User/role/org/market/governance management  | |
|  |  auth-api      Password reset, MFA, lockout, sessions     | |
|  +-----+------------------------------------------------------+ |
|        |                                                          |
|        | Outbound (server-side only, SSRF-validated)              |
|        v                                                          |
+--------|----------------------------------------------------------+
         v
+------------------------------------------------------------------+
| External providers                                               |
|  AI providers (OpenAI, Anthropic, Gemini, Ollama, LM Studio,    |
|    vLLM)  |  Search (Brave, DuckDuckGo)  |  OAuth providers      |
|  Embedding services  |  Local AI connectors (allowlisted)       |
|  Email service (transactional, for token delivery)              |
+------------------------------------------------------------------+
```

There is no separate application server in this repository. Browser code talks directly to Supabase for authentication and table reads (protected by RLS), and calls Edge Functions for operations that require server-side provider keys or service-role access. All edge functions verify the caller's JWT before processing and include CORS headers on every response.

---

## 5. Secure document lifecycle

```text
+----------+      +---------------+      +-----------------+
|  Upload  | ---> | Quarantined   | ---> | Malware scan    |
| (user)   |      | (auto on      |      | (scanner engine |
|          |      |  upload)      |      |  via edge fn)   |
+----------+      +-------+-------+      +--------+--------+
                          |                        |
                          v                        v
                  +---------------+      +-----------------+
                  | Prompt-       |      | document_scan_  |
                  | injection     |      | records         |
                  | scan          |      | (audit row)     |
                  +-------+-------+      +-----------------+
                          |
                          v
                  +---------------+
                  | Classification|  <-- classification_policy_versions
                  | & approval    |      (enforces upload/view/download/
                  | (policy +     |       share/export/print/delete,
                  |  approver)    |       cloud AI, RAG, encryption,
                  +-------+-------+       retention, MFA step-up)
                          |
                          v
                  +---------------+
                  | Available     |  <-- RLS + classification policy
                  | (download,    |      gate access; signed URLs for
                  |  RAG index,   |      download (60s expiry)
                  |  AI use)      |
                  +-------+-------+
                          |
              +-----------+-----------+
              |                       |
              v                       v
      +---------------+       +---------------+
      | Retention /   |       | Legal Hold    |
      | legal hold    |       | (master record|
      |               |       |  in legal_    |
      | retention_    |       |  holds table; |
      | expires_at    |       |  blocks all   |
      | on documents  |       |  deletion)    |
      +-------+-------+       +-------+-------+
              |                       |
              +-----------+-----------+
                          |
                          v
                  +---------------+
                  | Deletion      |  <-- soft delete + audit log
                  | (retention    |      entry; legal hold prevents
                  |  expiry or    |      deletion until released
                  |  admin)       |
                  +---------------+
```

**Lifecycle stages:**

1. **Upload** — Files land in a private storage bucket under the owner's path prefix. The `documents` (or `knowledge_documents`) row is created with `quarantined = true` and `malware_scan_status = 'pending'`.
2. **Quarantine** — While quarantined, downloads and RAG indexing are blocked. The `quarantine_reason` column records why.
3. **Malware scan** — An edge function invokes the configured scanner engine and writes a `document_scan_records` row (`scan_type = 'malware'`). Clean files move to the next stage; infected/suspicious files stay quarantined.
4. **Prompt-injection scan** — The edge function scans document text for prompt-injection patterns and writes a `document_scan_records` row (`scan_type = 'prompt_injection'`). Flagged files set `prompt_injection_detected = true`.
5. **Classification and approval** — The document is assigned a classification (Public/Internal/Confidential/Restricted). The `classification_policy_versions` matrix determines whether upload/view/download/share/export/print/delete are allowed, whether cloud AI or local-AI-only is permitted, whether RAG indexing is allowed, whether encryption is required, the retention period, whether approval is required, and whether MFA step-up is required for sensitive actions.
6. **Available** — Once cleared and classified, the document is available for download (signed URL, 60s expiry), RAG indexing (if `rag_indexing_allowed`), and AI use (cloud or local per `cloud_ai_allowed` / `local_ai_only`). RLS and the classification policy gate every access.
7. **Retention / legal hold** — `retention_expires_at` on `documents` and `retention_policies` / `retention_days` in the classification matrix control the retention period. A `legal_holds` master record blocks deletion until released by an admin.
8. **Deletion** — When retention expires (or an admin deletes), the document is soft-deleted with an audit log entry. A legal hold prevents deletion until it is released.

---

## 6. Repository layout

```text
src/
  main.tsx                 Application entry point
  App.tsx                  Authentication gate and authenticated shell
  index.css                Global styles and Tailwind-related styles
  nav.ts                   Navigation groups and section identifiers
  types.ts                 Shared TypeScript domain types

  components/              Shared shell, modal, status, and UI primitives
  data/demo.ts             Demo records and default settings
  hooks/useWakeWord.ts     Wake-word and speech recognition behavior
  lib/supabase.ts          Supabase client and auth-header helper
  lib/utils.ts             Shared browser/UI utilities
  sections/                Feature screens
  state/AppContext.tsx     Global application state and auth state

supabase/
  config.toml              Edge Function JWT verification settings
  migrations/              Database, RLS, storage, index, and function SQL
  functions/               Supabase Edge Function source code

tests/
  helpers.ts               Test client setup and constants
  rls.test.ts              Automated anonymous access denial tests (18 tests)
  multi-tenant.test.ts     Multi-tenant anonymous access tests (8 tests)
  security.test.ts         New security table access control tests (34 tests)
  sql-tests.sql            SQL test suite for authenticated-user scenarios

vitest.config.ts           Vitest configuration
```

---

## 7. Frontend architecture

### Entry and rendering

`src/main.tsx` renders the application inside React Strict Mode and loads global styles. `src/App.tsx` wraps the product in `AppProvider` and chooses one of three views:

1. A loading screen while the initial Supabase session is checked.
2. The public landing/sign-in page when no session exists.
3. The authenticated application shell when a session exists.

### Authenticated shell

The authenticated shell contains:

- `Sidebar` for navigation
- `TopBar` for account and global controls
- One active feature section at a time
- Privacy mode modal
- Emergency stop overlay
- Shared footer

The active section is selected by a typed `SectionId` value. Navigation definitions and labels are centralized in `src/nav.ts`.

### Global state

`AppContext` supplies:

- Supabase session and authentication operations
- Privacy mode: local, connected, or custom
- Custom feature toggles
- Voice preferences
- Emergency stop state
- Branding text
- Internet search preferences
- Demo mode
- A local audit counter

Selected settings are serialized to browser `localStorage` under the key `sufft-state-v2`. This is browser-local persistence, not shared database persistence.

### Authentication lifecycle

On provider startup:

1. The app requests the current Supabase session.
2. The loading state ends after the initial session request.
3. A Supabase auth-state listener updates the session when sign-in, sign-out, refresh, or other auth events occur.
4. The listener is removed when the provider unmounts.

Available operations:

- `signIn(email, password)` uses Supabase email/password authentication.
- `signUp(email, password)` creates a Supabase Auth account.
- `signOut()` ends the current Supabase session.

### Supabase client configuration

The browser client reads these public build-time variable names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only the public anonymous key belongs in browser code. Service-role keys and provider API keys must remain in Edge Function secrets or another server-only environment.

`getAuthHeaders()` obtains the current access token and returns an Authorization header for Edge Function requests. If no session exists, it falls back to the anonymous key; protected functions reject unauthenticated requests via JWT verification.

### Security features in the frontend

- OAuth redirect URLs are validated against an allowlist of known provider hosts before navigation.
- API keys are never stored in or read from frontend code — all AI provider calls go through the ai-proxy edge function.
- File downloads use signed URLs with 60-second expiration, not raw storage paths.
- The landing page documents the security posture for users.

---

## 8. Feature inventory

### Overview

- Dashboard

### Workspace

- AI Chat
- Documents & Knowledge
- Database Connections
- AI & Local Servers
- Voice & Keyboard
- Automations & Tasks
- Internet Search

### AI Training

- AI Training Dashboard
- Knowledge Bases
- Knowledge Documents
- Training Settings

### Governance

- Activity & Audit
- Users & Roles
- Storage Review (admin only)
- Feature Flags
- Integrations
- Security & Settings
- Emergency Stop (admin only)
- Authorization Matrix
- Local AI Connectors (admin only)
- Data Governance (admin only)
- Production Readiness (admin only)
- Rate Limiting Dashboard (admin only)
- MFA Audit Events (admin only)
- Offboarding Records (admin only)
- Audit Chain Verification (admin only)
- Document Scan Records (admin only)
- Classification Policy Versions (admin only)

### Support

- Help & Guide
- About

### AI Chat flow

The chat screen:

1. Loads configured AI connections and supplements them with demo connections.
2. Applies local privacy mode by restricting available connections to local providers.
3. Detects phrases that suggest current or live information is needed.
4. Optionally calls `knowledge-rag` for local knowledge context.
5. Optionally calls `web-search` for current Internet results.
6. Sends the combined prompt to `ai-proxy`.
7. Displays the response and source labels.
8. Optionally reads the response aloud using browser speech synthesis.

Search results and retrieved knowledge are treated as reference context. The prompt instructs the AI not to follow instructions embedded in search results and not to invent source URLs.

### Voice behavior

The voice experience uses browser speech APIs when the browser supports them:

- Speech recognition for dictation and commands
- Optional wake-word listening
- Push-to-talk behavior
- Text-to-speech responses
- Configurable transcript and keyboard-history retention preferences

Browser support and microphone permission are required.

---

## 9. Database model

All tables use Row Level Security. Policies enforce ownership (`owner_user_id = auth.uid()`), organization membership, admin access (`is_admin()`), or manager relationships. Anonymous access is denied on all protected tables.

### RBAC infrastructure

The database implements role-based access control through the following objects:

- `app_roles` — Maps user IDs to roles (`admin`, `standard_user`). Per-verb policies: users can read their own role, admin can do everything.
- `manager_relationships` — Maps managers to managed users. Admin-only writes; users can see their own manager/subordinate relationships.
- `role_permissions` — Capability and role access levels for the permission matrix.
- `is_admin()` — SECURITY DEFINER function that checks if `auth.uid()` has the `admin` role.
- `is_manager_of(uuid)` — SECURITY DEFINER function that checks if the caller manages the given user.
- `app_role(uuid)` — SECURITY DEFINER function that returns the role for a given user.
- `can_read_record(text, uuid)` — Checks if the caller can read a record in a given table with a given owner. Returns true for owners, admins, and managers of the owner.
- `can_write_record(text, uuid)` — Same as `can_read_record` but for write operations.
- `current_user_id()` — Returns `auth.uid()`.

### Multi-tenant ownership

The system supports three ownership types for multi-market use:

- **Personal** (`ownership_type = 'personal'`): Records owned by an individual user. Only the owner can access them.
- **Organization** (`ownership_type = 'organization'`): Records owned by an organization. Active org members can read; org admins can write.
- **Shared** (`ownership_type = 'shared'`): Records with both a personal owner and an organization. Owner and org members can read; owner and org admins can write.

Access control functions for multi-tenant:

- `can_access_record(text, uuid, uuid, text)` — Checks SELECT access based on ownership type, owner, org, and membership.
- `can_write_record_typed(text, uuid, uuid, text)` — Checks UPDATE/DELETE access based on ownership type.
- `is_org_member(uuid)` — Checks if the current user is an active member of the given organization.
- `is_org_admin(uuid)` — Checks if the current user is an org owner or administrator.
- `transfer_record_ownership(text, uuid, uuid, text, uuid)` — Transfers record ownership with authorization checks and audit logging.
- `link_or_create_user_profile(uuid, text, text, text, text, boolean)` — Links or creates a user profile on sign-in, preventing duplicates.

### Ownership columns

Every protected table has these columns (where applicable):

- `owner_user_id` — The user who owns the record. Set automatically by the `set_ownership_on_insert` trigger if not provided.
- `created_by_user_id` — The user who created the record. Set automatically.
- `updated_by_user_id` — The user who last updated the record. Set automatically on insert and update.
- `updated_at` — Timestamp of the last update. Set automatically.
- `ownership_type` — `personal`, `organization`, or `shared`. Defaults to `personal`.
- `organization_id` — The organization that owns the record (for organization/shared types). NULL for personal records.

### Audit system

The audit system uses database triggers to automatically log changes:

- `audit_logs` — Stores audit events with action, entity type, entity ID, outcome, actor, record owner, IP, metadata, `integrity_hash`, and `previous_hash`. The integrity hash is a SHA-256 hash chained to the previous entry's hash for tamper detection.
- `file_access_log` — Stores file access events (download, preview, share) with actor, timestamp, and metadata.
- `file_metadata` — Stores file governance data: bucket, path, owner, MIME type, size, upload date, retention, access count, last accessed.
- `audit_trigger_fn()` — SECURITY DEFINER trigger function that fires on INSERT, UPDATE, DELETE for all protected tables. Uses `to_jsonb(NEW/OLD)` to dynamically extract `id` and `owner_user_id` without requiring those columns to exist.
- `record_file_access(uuid, text, text, jsonb)` — SECURITY DEFINER function that creates a file_access_log entry and increments the access_count on file_metadata.

### Audit integrity and verification

- `audit_chain_checkpoints` — Periodic signed checkpoints of the audit hash chain for external anchoring. Columns: checkpoint_sequence, last_audit_id, last_audit_hash, checkpoint_hash, signature, signed_by, storage_location.
- `audit_verification_results` — Records results of audit chain verification runs with discrepancy counts (missing, altered, reordered, recomputed events) and a pass/fail/warning result.
- `verify_audit_chain(p_from_sequence, p_to_sequence)` — Recomputes hashes and compares to stored values, returning discrepancies.

### Core tables

#### `document_folders`

Stores document folders with ownership. Scoped to `owner_user_id = auth.uid()`.

#### `documents`

Stores owner-scoped document metadata: name, type, MIME type, size, storage path, folder, processing status, tags, summary, classification, and ownership columns. Security columns: `quarantined`, `quarantine_reason`, `malware_scan_status`, `prompt_injection_detected`, `legal_hold`, `storage_object_name`, `retention_expires_at`. Policies use `can_read_record` and `can_write_record`.

#### `ai_connections`

Stores AI and local provider connections: name, provider, endpoint, models, enabled/health status, usage tokens, cost, masked key, and encrypted API key. The raw API key column is not selectable by the browser client. Policies use `can_read_record` and `can_write_record`.

#### `automations`

Stores automation definitions: trigger, action, schedule, enabled status, last-run info, run count, and ownership columns. Reliability columns: time_zone, concurrency_policy, max_concurrent_runs, max_retry_count, retry_backoff_base_seconds, timeout_seconds, notification_recipients, paused/paused_at/paused_by/paused_reason.

#### `automation_runs`

Stores automation execution history, status, output, summary, timestamps, and ownership columns. Reliability columns: idempotency_key (unique index), retry_count, max_retries, timeout_at, cancelled_at/cancelled_by/cancel_reason, error_message, market_id, trigger_type, inputs. Status CHECK constraint: queued, running, succeeded, failed, timed_out, cancelled, skipped, paused, retrying.

#### `users`

Custom application directory: names, emails, roles, statuses, MFA flags, permissions, avatar data, activity metadata, and OAuth identifiers. Extended with `auth_user_id` (unique link to `auth.users`), `email_normalized` (lowercase trimmed email for matching), `login_providers` (array of provider names), and `last_login_at`. Account security columns: email_verified, mfa_enabled, mfa_required, disabled, locked_until, password_changed_at, created_by_admin_user_id, initial_password_changed. The `link_or_create_user_profile()` function handles profile creation and linking on sign-in. This table is separate from Supabase's `auth.users`. Policies use `can_read_record` and `can_write_record`.

#### `organizations`

Stores organizations: name, slug (unique), description, `market_type` (configurable market/category), status, `mfa_required`, and ownership columns. Members can see their orgs; org admins/owners can manage them.

#### `organization_memberships`

Maps users to organizations with roles (`owner`, `administrator`, `manager`, `member`, `viewer`) and status. Unique constraint on (organization_id, user_id). Members can see their own memberships; org admins can manage memberships.

#### `markets`

Top-level tenant table. Platform admins can CRUD; all authenticated users can read active markets. Each organization belongs to exactly one market. `is_same_market()` and `get_org_market_id()` helper functions enforce market boundaries in RLS.

#### `role_permissions`

Stores capability and role access levels for the permission matrix.

#### `search_settings`

Stores Internet search provider preferences, fallback behavior, result limits, safe-search mode, timeout, and enabled state. Admin-only updates.

#### `search_logs`

Stores search query metadata, provider usage, fallback info, result URLs, timing, AI metadata, success state, timestamps, and ownership columns.

### Knowledge and RAG tables

#### `knowledge_bases`

Stores knowledge library names, descriptions, classification, and ownership columns. Policies use `can_read_record` and `can_write_record`.

#### `knowledge_documents`

Stores document processing records: knowledge-base association, file metadata, storage path, SHA-256 hash, version, classification, processing/OCR/embedding status, chunk/page counts, approval fields, and ownership columns. Security columns: `quarantined`, `malware_scan_status`, `prompt_injection_detected`, `legal_hold`. Policies use `can_read_record` and `can_write_record`.

#### `knowledge_chunks`

Stores extracted text chunks and metadata: page, slide, sheet, section, cell-range references. Embeddings use `vector(1024)` with an IVFFlat cosine-similarity index. Includes `updated_by_user_id` column. Policies use `can_read_record` and `can_write_record`.

#### `knowledge_settings`

Stores embedding provider, model, endpoint, vector provider, dimension, chunk size, and overlap. Admin-only updates.

### Storage governance tables

#### `file_metadata`

Stores file governance data for every uploaded file: bucket ID, storage path, owner, original filename, MIME type, file size, upload date, retention policy, access count, last accessed timestamp. Policies scope to `owner_user_id = auth.uid()`.

#### `file_access_log`

Stores file access events: file metadata ID, action (download, preview, share), actor, timestamp, and metadata. Policies scope to `owner_user_id = auth.uid()`.

#### `storage_settings`

Stores allowed MIME types, maximum file size, and default retention policy. Select for all authenticated; update for admin only.

### OAuth tables

#### `oauth_configs`

Stores OAuth provider configurations: provider, client ID, client secret, auth URL, token URL, userinfo URL, scopes, and enabled flag. Admin-only access.

#### `oauth_states`

Stores OAuth state values for CSRF protection: state, provider, user ID, expires_at, used_at. Policies scope to `user_id = auth.uid()`.

### Account security tables

#### `password_reset_tokens`

Single-use, 1-hour lifetime, SHA256-hashed tokens. `invalidate_reset_tokens()` revokes all tokens for a user.

#### `mfa_enrollments`

TOTP-based MFA. Columns: `secret_encrypted` (AES-256-GCM encrypted TOTP secret), `recovery_codes_hash`, `failed_attempts`, `locked_until`, `last_verified_at`, `enrolled_at`. The encryption key comes from the `MFA_ENCRYPTION_KEY` edge function secret.

#### `mfa_recovery_codes`

One-time-use recovery codes with SHA-256 hashes. RLS-scoped to owner; DELETE denied (codes can only be consumed via `consume_mfa_recovery_code()`).

#### `mfa_step_up_challenges`

Step-up authentication challenges for sensitive actions. 5-minute expiry. Status: pending, verified, failed, expired. Functions: `create_mfa_step_up_challenge`, `verify_mfa_step_up_challenge`, `check_mfa_step_up(p_user_id, p_max_age_seconds)`.

#### `mfa_audit_events`

Dedicated MFA audit log: enrollment, verification success/failure, recovery code use, disable, admin override, lockout, step-up requested/verified/failed/expired. Users read their own; admins read all.

#### `user_sessions`

Session tracking with idle (30 min) and absolute (12 hour) timeouts, revocation. `revoke_user_sessions()` revokes all sessions for a user.

#### `login_attempts` and `account_lockouts`

Rate limiting (5 attempts/15 min) with automatic lockout. `is_account_locked()` and `count_recent_failures()` helper functions.

### Emergency stop tables

#### `emergency_stop_switches`

11 seeded service switches with activation/restoration tracking. `is_service_stopped()` helper function for runtime checks.

#### `emergency_stop_history`

Append-only audit log of all toggle events. Every activation and restoration requires a reason and creates an audit event.

### Local AI connector tables

#### `local_ai_connectors`

Registered, approved connectors with allowlisted endpoints, health status, cert config. Platform admin approval required; users cannot enter arbitrary URLs.

#### `local_ai_connector_requests`

Audit log of all requests routed through connectors.

### Data governance tables

#### `data_classifications`

4 levels: public, internal, confidential, restricted.

#### `classification_policy_versions`

Versioned policy matrix per classification controlling upload/view/download/share/export/print/delete, cloud AI, local-AI-only, RAG indexing, encryption, retention days, approval, MFA step-up, cross-market. Seeded with version 1 defaults. Authenticated read, admin write.

#### `legal_holds`

Master records for holds across any entity type. Place/release via admin-api.

#### `export_requests`

Tracks all data export requests with scope, status, and signed URL expiry.

#### `retention_policies`

Configurable retention by data type and organization.

#### `document_scan_records`

Records every malware and prompt-injection scan with engine, version, status, result, failure reason. RLS-scoped to document/knowledge-document owner.

### Cross-market tables

#### `cross_market_transfers`

Cross-org/market ownership transfer approval workflow. Requires platform admin approval with recorded reason.

#### `cross_market_shares`

Cross-market sharing approval workflow.

#### `record_shares`

Gains `market_id`, `share_scope`, `expires_at`, `revoked_at` columns.

### Rate limiting tables

#### `rate_limit_configs`

Per-endpoint, per-scope (user/ip/organization/market/connection), per-role-tier (standard/org_admin/platform_admin/anonymous) limits. Seeded with 28 default configs. Authenticated read, admin write.

#### `rate_limit_counters`

Sliding window counters keyed by `endpoint:scope:identifier`.

#### `rate_limit_denials`

Records every denied request for auditing. RLS-scoped to owner.

#### `rate_limit_usage_summary` (view)

Usage summary parsing endpoint from bucket_key, showing active/expired window status.

#### `rate_limit_denial_summary` (view)

24-hour denial rollup by endpoint, scope, identifier.

### Offboarding table

#### `offboarding_records`

Tracks user departure workflow from an organization. Status flow: initiated → sessions_revoked → exports_reviewed → connectors_revoked → automations_reviewed → completed (or cancelled). Admin write, user read own. See section 19 for the workflow.

### Production readiness table

#### `production_readiness_items`

Tracks every security-sensitive feature with status (`implemented_verified`, `implemented_not_ready`, `demo_mockup`, `planned`, `release_blocker`), responsible role, last verified date, required tests, dependencies, and remediation notes. Seeded with all hardening-sprint items. Authenticated read, admin write. See section 2 for the blocker list.

### Database functions

- `increment_ai_usage(conn_id, token_count)` — SECURITY DEFINER function that updates AI connection usage counters. Execution restricted to authenticated role.
- `rag_search(query_embedding, top_k, p_user_id, p_knowledge_base_ids)` — SECURITY DEFINER function that performs vector similarity search. Scoped to the caller's user ID. Execution restricted to authenticated role.
- `rag_health_check()` — SECURITY DEFINER function that returns vector extension status, total chunk count, and embedded chunk count. Execution restricted to authenticated role.
- `log_audit(...)` — SECURITY DEFINER function for manual audit logging. Execution restricted to authenticated role.
- `record_file_access(p_file_metadata_id, p_action, ...)` — SECURITY DEFINER function that logs file access and increments access count. Execution restricted to authenticated role.
- `check_rate_limit(p_endpoint, p_scope, p_identifier, p_role_tier, p_ip, p_user_id)` — SECURITY DEFINER function returning `{allowed, limit, current, retry_after}`. Execution restricted to authenticated role.
- `cleanup_expired_rate_limits()` — Purges stale counters and old denials. Execution restricted to authenticated role.
- `consume_mfa_recovery_code(p_user_id, p_code)` — Atomic one-time-use recovery code validation (SHA-256). Execution restricted to authenticated role.
- `create_mfa_step_up_challenge(p_user_id, p_reason, p_ip)` — Creates a pending step-up challenge with 5-minute expiry.
- `verify_mfa_step_up_challenge(p_challenge_id, p_user_id)` — Marks a challenge as verified. Returns true if valid and not expired.
- `check_mfa_step_up(p_user_id, p_max_age_seconds)` — Returns true if the user has a verified step-up challenge within the last N seconds.
- `verify_audit_chain(p_from_sequence, p_to_sequence)` — Recomputes hashes and compares to stored values, returning discrepancies.

### Extensions and indexes

The `vector` extension is installed. Indexes cover document ownership, folders, creation time, knowledge relationships, document hashes, processing status, vector similarity (IVFFlat cosine), MFA recovery codes (user), MFA step-up (user, expires), MFA audit events (user, type, created), rate limit denials (created, endpoint, user), document scan records (document, knowledge, type), and offboarding (user, org).

---

## 10. Storage

### `documents` bucket

Private bucket (`public = false`). Storage policies scope to authenticated users only:

- `auth_upload_own_documents` — INSERT: user can upload to their own path prefix.
- `auth_read_own_documents` — SELECT: user can read from their own path prefix.
- `auth_delete_own_documents` — DELETE: user can delete from their own path prefix.

Expected path format: `<authenticated-user-id>/<filename>`

Downloads use 60-second signed URLs. Anonymous access (list, download, upload) is denied.

### `knowledge-files` bucket

Private bucket (`public = false`). Storage policies scope to authenticated users only:

- `auth_upload_own_knowledge` — INSERT: user can upload to their own path prefix.
- `auth_read_own_knowledge` — SELECT: user can read from their own path prefix.
- `auth_delete_own_knowledge` — DELETE: user can delete from their own path prefix.

Expected path format: `<authenticated-user-id>/<filename>`

Anonymous access (list, download, upload) is denied.

---

## 11. Edge Functions

All functions include CORS headers on every response (preflight, success, and error). All functions verify the caller's JWT before processing.

### `ai-proxy`

Purpose:

- Test AI provider connections
- Send chat prompts to supported providers (OpenAI, Anthropic, Gemini, Ollama, LM Studio, vLLM)
- Use server-side provider keys (never exposed to browser)
- Support cloud and local OpenAI-compatible endpoints
- Update health and usage information
- Validate endpoint URLs to prevent SSRF (blocks localhost, 127.0.0.1, 0.0.0.0, ::1, metadata.google.internal)
- Limit prompt size to 20,000 characters

Security:

- JWT verification required.
- API keys stored encrypted in the database, fetched server-side, never returned to the browser.
- Gemini API key sent via `x-goog-api-key` header (not URL query string).
- Endpoint validation prevents SSRF.
- Input validation on connectionId and model parameters.

### `web-search`

Purpose:

- Search through Brave Search with DuckDuckGo fallback
- Apply safe-search and result-limit settings
- Filter and sanitize returned URLs, titles, and snippets
- Record search metadata
- Admin-only settings updates with input validation

Security:

- JWT verification required.
- Brave API key stored as Edge Function secret, never exposed to browser.
- Settings updates require admin role verification.
- All settings inputs are validated and sanitized (provider names, max results, safe search level, timeout).
- Error responses return generic messages, not raw database errors.

### `knowledge-rag`

Purpose:

- Process knowledge documents (parse, chunk, embed, index)
- Generate embeddings through Ollama or OpenAI-compatible endpoints
- Store chunks and embeddings in pgvector
- Retrieve context and citations via server-side `rag_search` RPC
- Report health via `rag_health_check` RPC
- Admin-only settings updates with input validation

Security:

- JWT verification required.
- Document operations scoped to `user_id = user.id`.
- Settings updates require admin role verification.
- Embedding endpoint validated to prevent SSRF.
- All settings inputs are validated and sanitized (provider, model, endpoint, dimension, chunk size, overlap).
- RAG search is user-scoped — users only see their own chunks.

### `oauth`

Purpose:

- Read enabled provider configurations
- Create authorization URLs with CSRF state tokens
- Exchange authorization codes for access tokens
- Fetch provider user profiles
- Link or create application user profiles via `link_or_create_user_profile()` RPC
- Prevents duplicate profiles across providers and email/password sign-in

Security:

- JWT verification required.
- Provider URLs validated to prevent SSRF (blocks localhost, internal IPs, metadata endpoints).
- OAuth state is single-use, bound to the user, and expires after 10 minutes.
- State is atomically claimed (concurrent requests cannot reuse it).
- Profile linking uses the `link_or_create_user_profile` SECURITY DEFINER function — no direct table queries.
- Verified email matching: only links profiles when the email is verified and exactly one active profile matches.
- Unverified emails or multiple matching profiles are flagged for admin review.
- Disabled users cannot regain access through OAuth.
- Client secrets fetched server-side, never exposed to browser.
- Input validation on provider, code, and state parameters (length limits).

### `admin-api`

Purpose:

- User management (list, create, update, delete, disable/suspend)
- Role and permission management (permission matrix, capability CRUD)
- OAuth configuration management
- Organization management (list, create)
- Membership management (add, remove members)
- Ownership transfer (transfer record ownership between users or to organizations)
- Emergency stop toggle with required reason
- Market CRUD
- Connector create/approve/delete
- Legal hold place/release
- Cross-market transfer approval
- Retention policy management
- User enable/disable with session revocation
- Organization MFA policy toggle
- User listing includes `auth_user_id`, `login_providers`, `last_login_at`, and `email_normalized`
- `my-role` endpoint returns email_verified, mfa_enabled, mfa_required, disabled, locked

Security:

- JWT verification required.
- Admin role verification required for all operations.
- Service-role access for database operations.
- Ownership transfers are audited via `transfer_record_ownership()`.

### `auth-api`

Purpose:

- Password reset request/confirm with single-use tokens
- Email verification send/confirm with rate limiting
- MFA enroll/verify/disable (TOTP)
- Login attempt tracking with automatic lockout after 5 failures
- Session listing and revocation
- Account status checks (disabled, locked, email verified, MFA)

Security:

- JWT verification required.
- Password reset tokens are single-use, 1-hour lifetime, SHA256-hashed.
- MFA secrets encrypted at rest (AES-256-GCM) with the `MFA_ENCRYPTION_KEY` secret.
- Recovery codes are SHA-256 hashed and one-time-use via `consume_mfa_recovery_code()`.
- Step-up challenges expire after 5 minutes.
- All MFA events recorded in `mfa_audit_events`.
- Login attempts rate-limited (5 failures / 15 min) with automatic lockout.

---

## 12. Security posture

### Access control model

The system uses a deny-by-default approach:

1. **Anonymous access is denied** on all protected tables, storage buckets, and RPC functions. The anon role has no grants on any protected table.
2. **Row-level security** is enabled on every table. Policies enforce ownership (`owner_user_id = auth.uid()`), organization membership (`is_org_member`/`is_org_admin`), admin access (`is_admin()`), or manager relationships. The `can_access_record` and `can_write_record_typed` functions handle personal, organization, and shared ownership types. Market boundaries are enforced via `is_same_market()` and `get_org_market_id()`.
3. **SECURITY DEFINER functions** are restricted to the authenticated role. Trigger functions are restricted from PUBLIC (only callable by triggers, not via the API).
4. **Storage buckets** are private. Downloads use signed URLs with 60-second expiration.
5. **API keys** are encrypted at rest and fetched server-side. The browser never sees raw API keys.
6. **Settings updates** require admin role verification in the edge function.
7. **Input validation** is performed server-side on all user-supplied parameters.
8. **Rate limiting** infrastructure is deployed with configurable per-endpoint, per-scope, per-role-tier limits and denial tracking. Edge function middleware integration is the remaining work (see production blocker #3).

### Audit logging

Audit events are created automatically by database triggers for:

- File access (download, preview, share)
- Record changes (create, update, delete) on all protected tables
- Role changes (assignment, revocation)
- Denied access (RLS policy violations can be manually logged)
- Profile creation and linking (`auth.profile_created`, `auth.profile_linked`)
- Login and login denial (`auth.login`, `auth.login_denied`)
- Profile conflicts flagged for admin review (`auth.profile_conflict`)
- Ownership transfers (`ownership.transfer`)
- Organization membership changes (`membership.add`, `membership.remove`)
- Organization creation (`org.create`)
- User disabling (`user.disable`)
- MFA events (enrollment, verification, recovery, disable, lockout, step-up) in `mfa_audit_events`

Audit logs are tamper-resistant — regular users cannot delete or modify them. Only admins can read all audit logs; standard users see only their own. The SHA-256 integrity hash chain (`integrity_hash` + `previous_hash`) enables tamper detection. `audit_chain_checkpoints` and `verify_audit_chain()` support external anchoring and verification.

### Remaining hardening items

See section 2 (Production blockers) for the complete list of release blockers and items that are implemented but not yet ready. The remaining hardening items that are not release blockers include: DNS re-resolution protection for outbound endpoint validation, enforce single-row settings with a database constraint, and OAuth PKCE and nonce support.

---

## 13. Authorization matrix

This matrix shows the 9 actor types and their access to each protected data type. Actors: Anonymous, Standard User, Manager, Org Admin, Org Owner, Platform Admin, Disabled User, Locked User, and OAuth-Imported User (no session).

Legend: ✓ = allowed, ✗ = denied, own = own records only, mem = org members, admin = admin gate, N/A = not applicable.

| Protected data type | Anonymous | Standard User | Manager | Org Admin | Org Owner | Platform Admin | Disabled User | Locked User | OAuth-Imported (no session) |
|---|---|---|---|---|---|---|---|---|---|
| Documents (own) | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Documents (others) | ✗ | ✗ | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Knowledge bases | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Knowledge documents | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Knowledge chunks | ✗ | ✓ (own via RAG) | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| AI connections | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Automations | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Automation runs | ✗ | ✓ (own) | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Search logs | ✗ | ✓ (own) | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Users (custom directory) | ✗ | ✓ (own row) | ✓ (subordinates) | ✓ (org members) | ✓ (org members) | ✓ (all) | ✗ | ✗ | ✗ |
| Organizations | ✗ | ✓ (mem) | ✓ (mem) | ✓ (manage) | ✓ (manage) | ✓ (all) | ✗ | ✗ | ✗ |
| Organization memberships | ✗ | ✓ (own) | ✓ (own) | ✓ (manage) | ✓ (manage) | ✓ (all) | ✗ | ✗ | ✗ |
| Markets | ✗ | ✓ (read active) | ✓ (read active) | ✓ (read active) | ✓ (read active) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Audit logs | ✗ | ✓ (own) | ✓ (own + subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| File metadata / access log | ✗ | ✓ (own) | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Storage buckets | ✗ | ✓ (own path) | ✓ (own path) | ✓ (own path) | ✓ (own path) | ✓ (all) | ✗ | ✗ | ✗ |
| Role permissions | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| App roles | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| OAuth configs | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (admin) | ✗ | ✗ | ✗ |
| Emergency stop switches | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (admin) | ✗ | ✗ | ✗ |
| Local AI connectors | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Data classifications | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Classification policy versions | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Legal holds | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (admin) | ✗ | ✗ | ✗ |
| Rate limit configs | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Rate limit denials | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (all) | ✗ | ✗ | ✗ |
| MFA enrollments | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (all) | ✗ | ✗ | ✗ |
| MFA recovery codes | ✗ | ✓ (own, no delete) | ✓ (own, no delete) | ✓ (own, no delete) | ✓ (own, no delete) | ✓ (all) | ✗ | ✗ | ✗ |
| MFA step-up challenges | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (all) | ✗ | ✗ | ✗ |
| MFA audit events | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (all) | ✗ | ✗ | ✗ |
| Password reset tokens | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (admin) | ✗ | ✗ | ✗ |
| User sessions | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (all) | ✗ | ✗ | ✗ |
| Offboarding records | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Production readiness items | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (CRUD) | ✗ | ✗ | ✗ |
| Cross-market transfers/shares | ✗ | ✓ (own) | ✓ (own) | ✓ (initiate) | ✓ (initiate) | ✓ (approve) | ✗ | ✗ | ✗ |
| Document scan records | ✗ | ✓ (own) | ✓ (subordinates) | ✓ (org) | ✓ (org) | ✓ (all) | ✗ | ✗ | ✗ |
| Audit chain checkpoints | ✗ | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (read) | ✓ (write) | ✗ | ✗ | ✗ |
| Audit verification results | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (admin) | ✗ | ✗ | ✗ |

---

## 14. Data-classification policy matrix

The `classification_policy_versions` table (seeded version 1) controls per-classification rules. Each policy dimension is enforced via the classification assigned to a document and the `classification_policy_versions` matrix.

| Policy dimension | Public | Internal | Confidential | Restricted |
|---|---|---|---|---|
| can_upload | all | all | managers | admins |
| can_view | all | org_members | org_members | admins |
| can_download | all | org_members | managers | platform_admin |
| can_share | all | org_members | managers | platform_admin |
| can_export | all | org_members | admins | platform_admin |
| can_print | true | true | false | false |
| can_delete | owner | owner | admins | platform_admin |
| cloud_ai_allowed | true | true | false | false |
| local_ai_only | false | false | false | true |
| rag_indexing_allowed | true | true | true | false |
| requires_encryption | false | false | true | true |
| retention_days | 365 | 730 | 1095 | 2555 |
| requires_approval | false | false | true | true |
| requires_mfa_stepup | false | false | true | true |
| cross_market_allowed | true | true | false | false |

Policy versioning: Each (version, classification) pair is unique. A new version supersedes the previous on its `effective_date` and sets the prior version's `superseded_date`. `role_overrides` (jsonb) allows per-role exceptions. Enforcement in edge functions is the remaining work (see production readiness).

---

## 15. Configuration matrix

Configuration differs by environment. Development uses local defaults; staging mirrors production with relaxed limits; production enforces all hardening.

| Configuration dimension | Development | Staging | Production |
|---|---|---|---|
| CORS origin | `*` (wildcard, Supabase client requirement) | allowlist of staging domain | allowlist via `ALLOWED_ORIGINS` edge function secret (no wildcard) |
| Content Security Policy | not set | set at hosting layer for staging domain | set at hosting/CDN layer for production domain |
| Email service | tokens returned in API response (dev convenience) | transactional email service (test mode) | transactional email service; tokens never in API response |
| MFA encryption key (`MFA_ENCRYPTION_KEY`) | local dev secret | staging secret (rotated) | production secret (rotated, access-controlled) |
| TOTP verification | demo (accepts any 6-digit code) | otplib with encrypted secrets | otplib with encrypted secrets |
| Rate limits (auth-signin, user) | 10/60s | 10/60s | 10/60s |
| Rate limits (auth-signin, ip) | 30/60s | 30/60s | 30/60s |
| Rate limits (ai-chat, user, standard) | 30/60s | 30/60s | 30/60s |
| Rate limits (ai-chat, user, platform_admin) | 120/60s | 120/60s | 120/60s |
| Rate limits (web-search, user, standard) | 20/60s | 20/60s | 20/60s |
| Rate limits (knowledge-upload, user, standard) | 10/60s | 10/60s | 10/60s |
| Rate limits (export, user, standard) | 5/3600s | 5/3600s | 5/3600s |
| Rate limits (password-reset, user) | 3/3600s | 3/3600s | 3/3600s |
| Rate limits (mfa-verify, user) | 5/300s | 5/300s | 5/300s |
| Rate limit enforcement | not enforced (middleware not wired) | enforced in edge functions | enforced in edge functions with 429 + retry-after |
| Malware scanning | not configured (quarantine columns in place) | ClamAV or scanner adapter (test) | ClamAV or scanner adapter (production) |
| Prompt-injection scanning | not configured | pattern-based scanner (test) | pattern-based scanner (production) |
| Storage buckets | private, owner-scoped | private, owner-scoped | private, owner-scoped |
| Signed URL expiry | 60s | 60s | 60s |
| Session idle timeout | 30 min | 30 min | 30 min |
| Session absolute timeout | 12 hours | 12 hours | 12 hours |
| Account lockout threshold | 5 failures / 15 min | 5 failures / 15 min | 5 failures / 15 min |
| Audit chain checkpoints | not configured | weekly | daily + external anchoring |
| Backup frequency | manual | daily automated | daily automated + PITR |
| Restore test schedule | ad hoc | quarterly | quarterly (evidence retained) |
| OAuth redirect allowlist | dev hosts + provider hosts | staging domain + provider hosts | production domain + provider hosts |
| JWT verification on edge functions | enabled | enabled | enabled |
| Supabase service-role key | local dev key | staging key (rotated) | production key (rotated, access-controlled) |
| `VITE_SUPABASE_URL` | local/dev project URL | staging project URL | production project URL |
| `VITE_SUPABASE_ANON_KEY` | local/dev anon key | staging anon key | production anon key |

---

## 16. Key management

### Key inventory

| Key / secret | Storage location | Scope | Rotation policy |
|---|---|---|---|
| Supabase service-role key | Supabase project settings (server-only) | Edge Functions | Rotate per Supabase policy; never in browser code |
| Supabase anon key | `VITE_SUPABASE_ANON_KEY` build env | Browser (public) | Rotate per Supabase policy; safe to expose |
| AI provider API keys | `ai_connections` table (encrypted at rest) | Edge Functions (ai-proxy) | Rotate per provider; re-encrypt on rotation |
| Brave Search API key | Edge Function secret | web-search function | Rotate per Brave policy |
| OAuth client secrets | `oauth_configs` table (server-side fetch) | oauth function | Rotate per provider; update config row |
| `MFA_ENCRYPTION_KEY` | Edge Function secret | auth-api function | Rotate with re-encryption of all `mfa_enrollments.secret_encrypted` rows |
| `ALLOWED_ORIGINS` | Edge Function secret | all functions (CORS) | Update when domains change |
| Email service API key | Edge Function secret | auth-api function | Rotate per email provider |
| Audit chain checkpoint signing key | admin-controlled (external) | admin-api function | Rotate per signing policy; old checkpoints remain verifiable |

### Key handling rules

1. **Never commit secrets** to the repository, place them in client-visible code, or paste them into public issue trackers.
2. **Service-role keys** must never reach browser code. They are used internally by Edge Functions with service-role access for database operations.
3. **API keys** are encrypted at rest in the `ai_connections` table and fetched server-side. The raw API key column is not selectable by the browser client.
4. **MFA encryption key** (`MFA_ENCRYPTION_KEY`) is an Edge Function secret used for AES-256-GCM encryption of TOTP secrets. Rotation requires re-encrypting all `mfa_enrollments.secret_encrypted` rows.
5. **OAuth client secrets** are stored in `oauth_configs` and fetched server-side by the oauth edge function. They are never exposed to the browser.
6. **Audit chain signing keys** are admin-controlled and used to sign `audit_chain_checkpoints`. Old checkpoints remain verifiable with prior keys.

### Secret configuration verification

To verify which secrets are configured in the Supabase project, use the Supabase MCP `list_edge_function_secrets` tool. This returns secret names only, never values.

---

## 17. Backup and disaster recovery

### Backup strategy

| Component | Backup method | Frequency | Retention | RPO | RTO |
|---|---|---|---|---|---|
| PostgreSQL database | Supabase automated daily backup + point-in-time recovery (PITR) | daily + continuous WAL | 14 days (daily) + 7 days (PITR) | 5 minutes (PITR) | 1 hour |
| Storage objects | Supabase Storage replication | continuous | 14 days | 1 hour | 4 hours |
| Edge Functions | Git repository (source of truth) | per commit | indefinite | 0 (git) | 15 minutes (redeploy) |
| Edge Function secrets | Supabase project settings (export on change) | on change | indefinite | 0 (manual) | 15 minutes (reconfigure) |
| Audit chain checkpoints | external immutable storage (signed) | daily (production) | 7 years | 1 day | N/A (verification only) |

### Restore procedures

1. **Database restore**: Use Supabase dashboard or CLI to restore from a daily backup or PITR to a specific timestamp. Verify schema and RLS policies are intact after restore.
2. **Storage restore**: Restore objects from Supabase Storage replication. Verify bucket policies and object paths.
3. **Edge Function redeploy**: Redeploy from the git repository using `mcp__supabase__deploy_edge_functions`. Verify JWT verification and secrets are configured.
4. **Secret reconfiguration**: Re-enter all Edge Function secrets via Supabase project settings. Verify with `list_edge_function_secrets`.

### Disaster recovery testing

- **Quarterly restore test**: Restore the database to a staging project from a production backup and verify schema, RLS policies, and sample data integrity. Retain evidence (screenshots, test output) for audit.
- **Annual DR drill**: Simulate full region failure: restore database, storage, and redeploy edge functions to a new Supabase project. Measure RPO and RTO against targets.
- **Audit chain verification**: Run `verify_audit_chain()` after every restore and after every quarterly checkpoint to confirm integrity.

### RPO/RTO targets

- **RPO (Recovery Point Objective)**: 5 minutes for database (PITR), 1 hour for storage.
- **RTO (Recovery Time Objective)**: 1 hour for database, 4 hours for storage, 15 minutes for edge functions.

---

## 18. Emergency stop operating procedures

The emergency stop system provides 11 independently controlled service switches in the `emergency_stop_switches` table. Each switch can be activated (stopped) or restored (resumed) by a platform admin via the admin-api edge function. Every activation and restoration requires a reason and creates an `emergency_stop_history` audit event.

### Emergency stop switches (seeded)

1. AI Chat
2. Web Search
3. Knowledge RAG
4. AI Training / Embeddings
5. Automations
6. OAuth Sign-In
7. Local AI Connectors
8. Data Export
9. Cross-Market Transfers
10. Document Upload
11. Account Changes (password reset, MFA changes)

### Activation procedure (stop a service)

1. **Identify the incident**: Confirm which service must be stopped and why (e.g., a provider outage, a security incident, a cost spike).
2. **Notify**: Notify the on-call platform admin and stakeholders. Document the incident in the incident log.
3. **Activate the switch**: Call the admin-api emergency stop endpoint with the switch name and a recorded reason. The `is_service_stopped()` function returns true for the stopped service.
4. **Verify**: Confirm the switch is active in the Emergency Stop dashboard and that the `emergency_stop_history` entry was created.
5. **Communicate**: Inform users that the service is temporarily unavailable. Update status page if applicable.

### Restoration procedure (resume a service)

1. **Confirm resolution**: Verify the incident is resolved and the service is safe to resume.
2. **Restore the switch**: Call the admin-api emergency stop restore endpoint with the switch name and a recorded reason.
3. **Verify**: Confirm the switch is inactive in the Emergency Stop dashboard and that the `emergency_stop_history` entry was created.
4. **Monitor**: Watch the service for the first 30 minutes after restoration for recurrence.
5. **Close incident**: Document the resolution in the incident log and notify stakeholders.

### Full emergency stop (all services)

1. Activate all 11 switches in sequence, recording a reason for each.
2. Confirm all switches are active in the Emergency Stop dashboard.
3. This effectively pauses all AI operations, uploads, automations, and account changes while preserving data and audit logs.
4. To resume, restore each switch in the reverse order of activation.

### Runtime checks

Edge functions and RLS policies call `is_service_stopped('switch_name')` to check whether a service is stopped before processing. When a switch is active, the corresponding operation is denied with a clear message.

---

## 19. Offboarding workflow

The `offboarding_records` table tracks the user departure workflow from an organization. The workflow ensures that when a user leaves, all access, sessions, connectors, and automations are reviewed and revoked in a controlled, auditable sequence.

### Offboarding status flow

```text
initiated
    |
    v
sessions_revoked      (revoke_user_sessions() called)
    |
    v
exports_reviewed      (pending export_requests reviewed/cancelled)
    |
    v
connectors_revoked    (local_ai_connectors and ai_connections reviewed/disabled)
    |
    v
automations_reviewed  (automations paused or transferred)
    |
    v
completed             (or cancelled at any step)
```

### Procedure

1. **Initiate**: A platform admin or org admin creates an `offboarding_records` row for the departing user and organization. Status: `initiated`. `initiated_by` is set to the admin.
2. **Revoke sessions**: Call `revoke_user_sessions()` for the user. All active `user_sessions` are marked revoked. Status advances to `sessions_revoked`. Record `sessions_revoked_at`.
3. **Review exports**: Review pending `export_requests` for the user. Cancel any pending exports that should not proceed. Status advances to `exports_reviewed`. Record `exports_reviewed_at`.
4. **Revoke connectors**: Review and disable the user's `local_ai_connectors` and `ai_connections`. Revoke any pending connector approvals. Status advances to `connectors_revoked`. Record `connectors_revoked_at`.
5. **Review automations**: Review the user's `automations`. Pause automations that should not continue, or transfer ownership to another user via `transfer_record_ownership()`. Status advances to `automations_reviewed`. Record `automations_reviewed_at`.
6. **Complete**: Once all steps are done, set status to `completed`. Record `completed_by` and `completed_at`.
7. **Cancel (if needed)**: If the departure is reversed, set status to `cancelled`.

### Access control

- **Admin write**: Only platform admins can create and update `offboarding_records`.
- **User read own**: The departing user can read their own offboarding record (to see status).
- **Org admin**: Org admins can initiate offboarding for members of their organization (via admin-api).

### Edge cases

- **Org owner cannot be offboarded** without first transferring ownership. The workflow should detect and block this case (test: `org_owner_cannot_leave_test`).
- **Disabled users**: A user who is already disabled can still be offboarded to ensure sessions and connectors are cleaned up.
- **Cross-org membership**: If the user belongs to multiple organizations, offboarding is scoped to one organization at a time. The user retains access to other organizations.

---

## 20. Configuration and secrets

The application requires the Supabase URL and anonymous browser key as frontend configuration. Server-only secrets should be configured for Edge Functions, such as:

- AI provider API keys (stored encrypted in `ai_connections` table)
- Brave Search API key (stored as Edge Function secret)
- OAuth client secrets (stored in `oauth_configs` table, fetched server-side)
- Service-role access used internally by Edge Functions
- `MFA_ENCRYPTION_KEY` (Edge Function secret for AES-256-GCM TOTP secret encryption)
- `ALLOWED_ORIGINS` (Edge Function secret for production CORS allowlist)
- Email service API key (Edge Function secret for transactional email)

Secret values are intentionally not documented here. Do not commit secret values to the repository, place them in client-visible code, or paste them into public issue trackers. See section 16 (Key management) for the full key inventory and rotation policy.

---

## 21. Testing

### Automated tests

Run with `npm test`. Uses Vitest.

**`tests/rls.test.ts`** — 18 tests verifying anonymous access denial:
- Anonymous cannot read: documents, file_metadata, audit_logs, file_access_log, knowledge_chunks, knowledge_bases, users, app_roles, storage_settings
- Anonymous cannot insert/delete documents
- Anonymous cannot call: rag_health_check, rag_search, record_file_access
- Anonymous cannot download/upload to: documents bucket, knowledge-files bucket

**`tests/multi-tenant.test.ts`** — 8 tests verifying multi-tenant anonymous access denial:
- Anonymous cannot read/insert organizations
- Anonymous cannot read organization_memberships
- Anonymous cannot call: link_or_create_user_profile, transfer_record_ownership, is_org_member, is_org_admin, can_access_record

**`tests/security.test.ts`** — 34 tests verifying new security table access control and schema:
- Anonymous cannot read: password_reset_tokens, mfa_enrollments, user_sessions, login_attempts, account_lockouts, api_rate_limits
- Anonymous cannot read/update: emergency_stop_switches, emergency_stop_history
- Anonymous cannot read/insert: markets, local_ai_connectors, local_ai_connector_requests
- Anonymous cannot read/insert: legal_holds, export_requests, retention_policies, cross_market_transfers, cross_market_shares, data_classifications
- Schema validation: users, automations, automation_runs, documents, organizations tables have new columns
- Helper function existence: hash_token, is_account_locked, revoke_user_sessions, invalidate_reset_tokens, get_org_market_id, is_same_market, is_service_stopped

### SQL test suite

**`tests/sql-tests.sql`** — Documented SQL assertions for authenticated-user scenarios, run via the Supabase MCP `execute_sql` tool using `SET LOCAL ROLE authenticated` to simulate real user contexts:

- User A sees only own documents (not User B's)
- User B sees only own documents (not User A's)
- Admin sees all documents
- User A cannot update User B's documents
- User A cannot delete User B's documents
- Ownership columns set correctly on insert
- `log_audit` creates entries for file access, role changes, denied access, record updates
- `record_file_access` creates file_access_log entries and increments access_count
- `rag_health_check` returns vector extension status and chunk counts
- `rag_search` returns matching results and respects user isolation

### Test scripts

| Script | Purpose |
|---|---|
| `npm test` | Run the automated test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint over the project |
| `npm run build` | Create a production frontend build |

---

## 22. Local development and verification

Available package scripts:

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production frontend build |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint over the project |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the automated test suite |

Recommended verification sequence:

1. Run `npm test` to verify anonymous access is denied.
2. Run the SQL test suite via `execute_sql` to verify user isolation and audit.
3. Confirm the app loads and the public landing page appears.
4. Create an app account using the landing-page sign-up form.
5. Sign out and sign back in.
6. Confirm the authenticated shell and navigation render.
7. Test privacy mode and emergency stop behavior.
8. Add an AI connection and test chat with a local provider.
9. Test web search and confirm failure states are visible.
10. Test knowledge upload and processing with a non-sensitive sample file.
11. Run `npm run build` to verify the production build.

---

## 23. Deployment checklist

### Frontend

- Build succeeds.
- Frontend configuration contains only public Supabase values.
- No service-role or provider secrets are bundled.
- Production origin is configured for authentication redirects if OAuth is enabled.
- The production site uses HTTPS.
- Content Security Policy headers are configured at the hosting/CDN layer.

### Supabase

- All migrations are applied in order.
- RLS is enabled on every exposed application table.
- Policies are owner-, admin-, or manager-scoped.
- Anonymous grants are revoked on all protected tables.
- Storage buckets are private.
- Storage object policies match the intended owner/path model.
- Edge Functions are deployed with JWT verification enabled.
- Edge Function secrets exist and are server-only (verify with `list_edge_function_secrets`).
- SECURITY DEFINER functions have EXECUTE revoked from anon.
- Trigger functions have EXECUTE revoked from PUBLIC.
- Required RPC functions and extensions exist.
- Database backups and monitoring are enabled.
- Rate limit middleware is wired into all edge functions.
- CORS allowlist (`ALLOWED_ORIGINS`) is configured (no wildcard).
- MFA encryption key (`MFA_ENCRYPTION_KEY`) is configured.
- Email service is configured for token delivery (tokens not in API response).
- Malware scanner adapter is configured.

### Product readiness

- All 7 release blockers in section 2 are resolved and their required tests pass.
- Demo records are clearly separated from live records or removed.
- Each major screen has a real empty state, loading state, and error state.
- Account recovery and password reset behavior are documented and tested.
- Audit events are durable and tamper-resistant.
- Audit chain checkpoints are being created and externally anchored.
- Data deletion and retention behavior are documented.
- Provider costs, request limits, and upload limits are enforced.
- Backup restore test has been run and evidence retained.

---

## 24. Known limitations

- Several UI screens use demo records alongside database-backed data.
- The app's localStorage state is browser-specific and is not synchronized between devices.
- The custom user table and Supabase Auth user list can diverge if users are managed directly in Supabase.
- OAuth imports users into the custom users table but does not establish a Supabase Auth session.
- The `can_read_record` and `can_write_record` functions are still used by some tables (users, knowledge_settings, oauth_configs, search_settings, role_permissions, storage_settings) that have not been migrated to the typed ownership model.
- Rate limiting infrastructure (`rate_limit_configs`, `rate_limit_counters`, `rate_limit_denials`, `check_rate_limit` function) is deployed but not yet enforced in edge function middleware (production blocker #3).
- Upload size enforcement is in edge function code, not at the storage policy level.
- Single-row settings tables are not enforced by a database constraint.
- CORS origin allowlist is not yet configured for production domains (production blocker #4).
- Content Security Policy headers are not yet set (should be configured at the hosting/CDN layer) (production blocker #4).
- Email service for password reset and email verification links is not yet configured; tokens are returned in API responses (production blocker #2).
- TOTP code verification in the auth-api edge function accepts any 6-digit code; real TOTP verification with otplib and encrypted secrets is not yet wired (production blocker #1). The `mfa_enrollments.secret_encrypted` column and recovery code infrastructure are deployed but not yet used by the edge function.
- MFA recovery codes table and `consume_mfa_recovery_code` function are deployed but not yet integrated into the auth-api edge function (production blocker).
- MFA step-up challenges table and `check_mfa_step_up` function are deployed but not yet enforced for sensitive actions in edge functions (production blocker).
- Malware scanning infrastructure is in place (`document_scan_records` table, quarantine columns) but actual scanning requires integration with a scanning service (e.g., ClamAV, VirusTotal API) (production blocker #5).
- Prompt-injection scanning infrastructure is in place but actual scanning requires integration with a scanner.
- Classification policy matrix is seeded (`classification_policy_versions`) but enforcement in edge functions is not yet implemented.
- Audit chain checkpoints table is deployed but external anchoring and verification tooling are not yet operational.
- Offboarding records table is deployed but the UI and automated revocation flow are not yet implemented.
- DNS re-resolution protection for outbound endpoint validation is not yet implemented.
- Authenticated cross-user and cross-market authorization tests are not yet written; current automated tests cover anonymous denial only (production blocker #7).
- Backup, restore, and disaster recovery testing is documented (section 17) but quarterly restore test evidence is not yet available (production blocker #6).

---

## 25. Migration history

### Early migrations (2026-08-24 to 2026-08-28)

- Document folders, AI Connections, API keys, AI usage function
- Users, automations, OAuth2 columns, documents table and storage
- Role permissions, automation runs, search settings and logs
- AI knowledge tables, RLS policy fixes

### Security hardening (2026-09-10)

- Harden authenticated data access
- Add OAuth state storage
- Restrict usage function execution
- Remove browser API key select
- Create RBAC infrastructure (app_roles, manager_relationships, helper functions)
- Add ownership audit columns to all tables
- Backfill ownership and enforce NOT NULL
- RBAC policies on all tables
- Add ownership triggers (set_ownership_on_insert, set_updated_at, set_updated_by_on_update)
- Restrict helper function execution
- Create audit logs table
- Add audit triggers on all protected tables
- Secure file storage (private buckets, file_metadata, file_access_log, storage_settings)
- Fix retention function search path
- Add RAG functions (rag_search, rag_health_check)

### Bug fixes during testing (2026-09-10)

- Fix audit trigger for tables without `id` column
- Fix audit trigger JSON cast
- Fix set_ownership trigger for tables missing `updated_by_user_id`
- Add missing `updated_by_user_id` column to automation_runs, knowledge_chunks, search_logs

### Security hardening fixes (2026-09-10)

- Revoke anon grants on 6 protected tables
- Fix weak WITH CHECK on 7 UPDATE policies
- Add RLS policies for oauth_states
- Revoke EXECUTE on 14 functions from anon/PUBLIC
- Replace FOR ALL policies with per-verb policies on app_roles and manager_relationships

### Multi-tenant ownership (2026-09-12)

- Create organizations and organization_memberships tables with RLS policies and triggers
- Add auth_user_id, email_normalized, login_providers, last_login_at to users table
- Add unique partial indexes on auth_user_id and email_normalized
- Create link_or_create_user_profile function for profile linking
- Add ownership_type and organization_id columns to all 15 owned tables
- Create can_access_record, can_write_record_typed, is_org_member, is_org_admin functions
- Create transfer_record_ownership function
- Update RLS policies on 10 core tables to use typed ownership model
- Revoke EXECUTE on new functions from anon
- Update OAuth edge function to use link_or_create_user_profile
- Update admin-api with organization, membership, ownership transfer, and user-disable endpoints
- Add 8 multi-tenant tests (26 total)

### Security hardening v2 (2026-09-12)

- Create markets table with RLS, add market_id to all 14 org-owned tables, backfill
- Create account security tables: password_reset_tokens, mfa_enrollments, user_sessions, login_attempts, account_lockouts
- Add 12 account security columns to users table (email_verified, disabled, locked_until, etc.)
- Add mfa_required to organizations table
- Create helper functions: hash_token, is_account_locked, count_recent_failures, revoke_user_sessions, invalidate_reset_tokens
- Create emergency_stop_switches (11 seeded switches) and emergency_stop_history tables
- Create local_ai_connectors and local_ai_connector_requests tables with RLS
- Add automation reliability columns: retry, idempotency, concurrency, timeout, notifications, paused state
- Add document security columns: quarantined, malware_scan_status, prompt_injection_detected, legal_hold
- Create data_classifications, legal_holds, export_requests, retention_policies tables
- Create api_rate_limits, cross_market_transfers, cross_market_shares tables
- Add integrity_hash and previous_hash to audit_logs with auto-computation trigger
- Add market_id, share_scope, expires_at, revoked_at to record_shares
- Deploy auth-api edge function (password reset, MFA, lockout, email verification, sessions)
- Update admin-api with emergency stop, markets, connectors, legal holds, transfers, retention, user enable/disable
- Add 4 new frontend sections: Emergency Stop, Authorization Matrix, Local AI Connectors, Data Governance
- Add 34 new security tests (60 total)

### Security hardening sprint (2026-09-13)

Three new migrations plus one fix migration:

1. **`20260913120000_mfa_hardening_infrastructure`** — MFA hardening:
   - Add `secret_encrypted`, `recovery_codes_hash`, `failed_attempts`, `locked_until`, `last_verified_at`, `enrolled_at` to `mfa_enrollments`
   - Create `mfa_recovery_codes` table (one-time-use, SHA-256 hashed, RLS-scoped, no delete)
   - Create `mfa_step_up_challenges` table (5-minute expiry, pending/verified/failed/expired)
   - Create `mfa_audit_events` table (dedicated MFA audit log)
   - Functions: `consume_mfa_recovery_code`, `create_mfa_step_up_challenge`, `verify_mfa_step_up_challenge`, `check_mfa_step_up`

2. **`20260913121000_rate_limiting_infrastructure`** — Rate limiting:
   - Create `rate_limit_configs` table (per-endpoint, per-scope, per-role-tier) seeded with 28 default configs
   - Create `rate_limit_counters` table (sliding window)
   - Create `rate_limit_denials` table (denied request audit)
   - `check_rate_limit()` SECURITY DEFINER function returning `{allowed, limit, current, retry_after}`
   - `cleanup_expired_rate_limits()` function
   - Views: `rate_limit_usage_summary`, `rate_limit_denial_summary`

3. **`20260913122000_document_security_and_classification`** — Document security, classification policy, audit integrity, offboarding, production readiness:
   - Create `document_scan_records` table (malware + prompt-injection scan history)
   - Create `classification_policy_versions` table (versioned policy matrix, seeded v1 for Public/Internal/Confidential/Restricted)
   - Create `audit_chain_checkpoints` table (signed checkpoints for external anchoring)
   - Create `audit_verification_results` table (verification run results)
   - Create `offboarding_records` table (user departure workflow)
   - Create `production_readiness_items` table (seeded with all hardening-sprint items including 7 release blockers)
   - `verify_audit_chain()` function

4. **`20260913123000_fix_recovery_code_verification`** — Fix:
   - Update `consume_mfa_recovery_code` to use SHA-256 hash comparison (matching edge function Web Crypto API) instead of `crypt()`/bcrypt

---

## 26. Glossary

- **RLS:** Row Level Security; database rules that decide which rows a user can read or change.
- **RBAC:** Role-Based Access Control; the system of roles, permissions, and ownership checks.
- **JWT:** A signed session token used to prove a caller is authenticated.
- **Edge Function:** A server-side function hosted by Supabase.
- **RAG:** Retrieval-Augmented Generation; supplying relevant private documents to an AI prompt before generating an answer.
- **Embedding:** A numeric representation of text used for similarity search.
- **pgvector:** PostgreSQL extension for storing and comparing vector embeddings.
- **Service role:** A highly privileged Supabase server credential that must never reach browser code.
- **SSRF:** Server-Side Request Forgery; a vulnerability where an attacker causes a server to make requests to unintended internal or private network resources.
- **SECURITY DEFINER:** A PostgreSQL function attribute that causes the function to run with the privileges of the function owner rather than the caller.
- **CSRF:** Cross-Site Request Forgery; an attack where a third-party site tricks a user's browser into making unwanted requests.
- **Signed URL:** A time-limited URL that grants temporary access to a private storage object.
- **TOTP:** Time-based One-Time Password; a 6-digit code generated by an authenticator app that changes every 30 seconds.
- **Market:** A top-level organizational tenant in the multi-market tenancy model. Each organization belongs to exactly one market, and data cannot cross markets by default.
- **Legal Hold:** A designation that prevents data from being deleted or purged by normal retention processes, typically used for litigation or compliance.
- **Idempotency Key:** A unique identifier for an automation run that prevents duplicate executions of the same task.
- **Integrity Hash:** A SHA256 hash computed for each audit log entry, chained to the previous entry's hash, enabling detection of tampering.
- **Step-Up Authentication:** An additional authentication challenge (e.g., TOTP or recovery code) required before performing a sensitive action, with a limited validity window.
- **RPO:** Recovery Point Objective; the maximum acceptable amount of data loss measured in time.
- **RTO:** Recovery Time Objective:** the maximum acceptable time to restore a service after an incident.
- **PITR:** Point-In-Time Recovery; a database backup feature that allows restoration to any specific timestamp within the retention window.
- **Quarantine:** A document state that blocks downloads and RAG indexing until malware and prompt-injection scans are complete.
- **Classification Policy Matrix:** A versioned set of rules per data classification (Public/Internal/Confidential/Restricted) controlling upload, view, download, share, export, print, delete, cloud AI, local AI, RAG indexing, encryption, retention, approval, MFA step-up, and cross-market transfer.
- **Offboarding:** The controlled workflow for revoking a departing user's sessions, exports, connectors, and automations when they leave an organization.
