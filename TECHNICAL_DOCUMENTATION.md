# Snuffy Technical Documentation

**Document status:** Current repository reference
**Product:** Snuffy — AI Command Assistant
**Frontend:** React 18, TypeScript, Vite
**Backend platform:** Supabase
**Last reviewed:** 2026-09-12
**Version:** 2.0.0
**Commit:** `security-hardening-v2`
**Migration range:** `20260824210621` – `20260912206000`

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
- Tamper-resistant audit logging via database triggers

This document describes the repository as it currently exists, including the security hardening, RBAC infrastructure, audit system with integrity hashing, storage governance, multi-market tenancy model, organization memberships, profile linking, emergency stop system, local AI connector registry, automation reliability, data governance, account security, and test coverage.

## 2. Current implementation status

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

## 3. System architecture

```text
Browser
  |
  | React UI, local state, localStorage, Supabase JS client
  |
  +--> Supabase Auth
  |      Email/password sessions and token refresh
  |      Email verification, MFA (TOTP), session tracking
  |
  +--> Supabase Data API
  |      PostgreSQL tables protected by RLS + RBAC + market boundaries
  |      SECURITY DEFINER functions for audit, ownership, and security
  |      Audit integrity hash chaining (SHA256)
  |
  +--> Supabase Storage
  |      documents bucket (private, owner-scoped)
  |      knowledge-files bucket (private, owner-scoped)
  |
  +--> Supabase Edge Functions
         ai-proxy      — AI provider chat and testing
         web-search    — Brave/DuckDuckGo search
         knowledge-rag — Document processing, RAG, settings
         oauth         — OAuth2 profile linking and user import
         admin-api     — User/role/permission/org/market/governance management
         auth-api      — Password reset, MFA, lockout, email verification, sessions
              |
              +--> AI providers, search providers, OAuth providers,
                   embedding services, and local AI connectors (allowlisted)
```

There is no separate application server in this repository. Browser code talks directly to Supabase for authentication and table reads (protected by RLS), and calls Edge Functions for operations that require server-side provider keys or service-role access.

## 4. Repository layout

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
  sql-tests.sql            SQL test suite for authenticated-user scenarios

vitest.config.ts           Vitest configuration
```

## 5. Frontend architecture

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

## 6. Feature inventory

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

## 7. Database model

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

- `audit_logs` — Stores audit events with action, entity type, entity ID, outcome, actor, record owner, IP, and metadata.
- `file_access_log` — Stores file access events (download, preview, share) with actor, timestamp, and metadata.
- `file_metadata` — Stores file governance data: bucket, path, owner, MIME type, size, upload date, retention, access count, last accessed.
- `audit_trigger_fn()` — SECURITY DEFINER trigger function that fires on INSERT, UPDATE, DELETE for all protected tables. Uses `to_jsonb(NEW/OLD)` to dynamically extract `id` and `owner_user_id` without requiring those columns to exist.
- `record_file_access(uuid, text, text, jsonb)` — SECURITY DEFINER function that creates a file_access_log entry and increments the access_count on file_metadata.

### Core tables

#### `document_folders`

Stores document folders with ownership. Scoped to `owner_user_id = auth.uid()`.

#### `documents`

Stores owner-scoped document metadata: name, type, MIME type, size, storage path, folder, processing status, tags, summary, classification, and ownership columns. Policies use `can_read_record` and `can_write_record`.

#### `ai_connections`

Stores AI and local provider connections: name, provider, endpoint, models, enabled/health status, usage tokens, cost, masked key, and encrypted API key. The raw API key column is not selectable by the browser client. Policies use `can_read_record` and `can_write_record`.

#### `automations`

Stores automation definitions: trigger, action, schedule, enabled status, last-run info, run count, and ownership columns.

#### `automation_runs`

Stores automation execution history, status, output, summary, timestamps, and ownership columns.

#### `users`

Custom application directory: names, emails, roles, statuses, MFA flags, permissions, avatar data, activity metadata, and OAuth identifiers. Extended with `auth_user_id` (unique link to `auth.users`), `email_normalized` (lowercase trimmed email for matching), `login_providers` (array of provider names), and `last_login_at`. The `link_or_create_user_profile()` function handles profile creation and linking on sign-in. This table is separate from Supabase's `auth.users`. Policies use `can_read_record` and `can_write_record`.

#### `organizations`

Stores organizations: name, slug (unique), description, `market_type` (configurable market/category), status, and ownership columns. Members can see their orgs; org admins/owners can manage them.

#### `organization_memberships`

Maps users to organizations with roles (`owner`, `administrator`, `manager`, `member`, `viewer`) and status. Unique constraint on (organization_id, user_id). Members can see their own memberships; org admins can manage memberships.

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

Stores document processing records: knowledge-base association, file metadata, storage path, SHA-256 hash, version, classification, processing/OCR/embedding status, chunk/page counts, approval fields, and ownership columns. Policies use `can_read_record` and `can_write_record`.

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

### Database functions

- `increment_ai_usage(conn_id, token_count)` — SECURITY DEFINER function that updates AI connection usage counters. Execution restricted to authenticated role.
- `rag_search(query_embedding, top_k, p_user_id, p_knowledge_base_ids)` — SECURITY DEFINER function that performs vector similarity search. Scoped to the caller's user ID. Execution restricted to authenticated role.
- `rag_health_check()` — SECURITY DEFINER function that returns vector extension status, total chunk count, and embedded chunk count. Execution restricted to authenticated role.
- `log_audit(...)` — SECURITY DEFINER function for manual audit logging. Execution restricted to authenticated role.
- `record_file_access(p_file_metadata_id, p_action, ...)` — SECURITY DEFINER function that logs file access and increments access count. Execution restricted to authenticated role.

### Extensions and indexes

The `vector` extension is installed. Indexes cover document ownership, folders, creation time, knowledge relationships, document hashes, processing status, and vector similarity (IVFFlat cosine).

## 8. Storage

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

## 9. Edge Functions

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
- User listing includes `auth_user_id`, `login_providers`, `last_login_at`, and `email_normalized`

Security:

- JWT verification required.
- Admin role verification required for all operations.
- Service-role access for database operations.
- Ownership transfers are audited via `transfer_record_ownership()`.

## 10. Security posture

### Access control model

The system uses a deny-by-default approach:

1. **Anonymous access is denied** on all protected tables, storage buckets, and RPC functions. The anon role has no grants on any protected table.
2. **Row-level security** is enabled on every table. Policies enforce ownership (`owner_user_id = auth.uid()`), organization membership (`is_org_member`/`is_org_admin`), admin access (`is_admin()`), or manager relationships. The `can_access_record` and `can_write_record_typed` functions handle personal, organization, and shared ownership types.
3. **SECURITY DEFINER functions** are restricted to the authenticated role. Trigger functions are restricted from PUBLIC (only callable by triggers, not via the API).
4. **Storage buckets** are private. Downloads use signed URLs with 60-second expiration.
5. **API keys** are encrypted at rest and fetched server-side. The browser never sees raw API keys.
6. **Settings updates** require admin role verification in the edge function.
7. **Input validation** is performed server-side on all user-supplied parameters.

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

Audit logs are tamper-resistant — regular users cannot delete or modify them. Only admins can read all audit logs; standard users see only their own.

### Remaining hardening items

- CORS origin allowlist: Edge functions currently use `*` for CORS (Supabase client requirement). Production should restrict via reverse proxy or Supabase project settings.
- Content Security Policy headers: Should be configured at the hosting/CDN layer for the specific production domain.
- Email service: Password reset and email verification tokens are returned via API response. Production should configure an email service to send links.
- TOTP verification: MFA enroll generates a TOTP secret but the verify endpoint accepts any 6-digit code. Production should integrate a proper TOTP library.
- Malware scanning: Document quarantine infrastructure is in place but actual scanning requires integration with a scanning service.
- DNS re-resolution protection for outbound endpoint validation.
- Enforce single-row settings with a database constraint.
- OAuth PKCE and nonce support.

## 11. Configuration and secrets

The application requires the Supabase URL and anonymous browser key as frontend configuration. Server-only secrets should be configured for Edge Functions, such as:

- AI provider API keys (stored encrypted in `ai_connections` table)
- Brave Search API key (stored as Edge Function secret)
- OAuth client secrets (stored in `oauth_configs` table, fetched server-side)
- Service-role access used internally by Edge Functions

Secret values are intentionally not documented here. Do not commit secret values to the repository, place them in client-visible code, or paste them into public issue trackers.

## 12. Testing

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

## 13. Local development and verification

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

## 14. Deployment checklist

### Frontend

- Build succeeds.
- Frontend configuration contains only public Supabase values.
- No service-role or provider secrets are bundled.
- Production origin is configured for authentication redirects if OAuth is enabled.
- The production site uses HTTPS.

### Supabase

- All migrations are applied in order.
- RLS is enabled on every exposed application table.
- Policies are owner-, admin-, or manager-scoped.
- Anonymous grants are revoked on all protected tables.
- Storage buckets are private.
- Storage object policies match the intended owner/path model.
- Edge Functions are deployed with JWT verification enabled.
- Edge Function secrets exist and are server-only.
- SECURITY DEFINER functions have EXECUTE revoked from anon.
- Trigger functions have EXECUTE revoked from PUBLIC.
- Required RPC functions and extensions exist.
- Database backups and monitoring are enabled.

### Product readiness

- Demo records are clearly separated from live records or removed.
- Each major screen has a real empty state, loading state, and error state.
- Account recovery and password reset behavior are documented and tested.
- Audit events are durable and tamper-resistant.
- Data deletion and retention behavior are documented.
- Provider costs, request limits, and upload limits are enforced.

## 15. Known limitations

- Several UI screens use demo records alongside database-backed data.
- The app's localStorage state is browser-specific and is not synchronized between devices.
- The custom user table and Supabase Auth user list can diverge if users are managed directly in Supabase.
- OAuth imports users into the custom users table but does not establish a Supabase Auth session.
- The `can_read_record` and `can_write_record` functions are still used by some tables (users, knowledge_settings, oauth_configs, search_settings, role_permissions, storage_settings) that have not been migrated to the typed ownership model.
- Rate limiting infrastructure (api_rate_limits table) exists but is not yet enforced in edge function middleware.
- Upload size enforcement is in edge function code, not at the storage policy level.
- Single-row settings tables are not enforced by a database constraint.
- CORS origin allowlist is not yet configured for production domains.
- Content Security Policy headers are not yet set (should be configured at the hosting/CDN layer).
- Email service for password reset and email verification links is not yet configured.
- TOTP code verification in the auth-api edge function accepts any 6-digit code (should integrate a proper TOTP library).
- Malware scanning infrastructure is in place but actual scanning requires integration with a scanning service (e.g., ClamAV, VirusTotal API).
- DNS re-resolution protection for outbound endpoint validation is not yet implemented.

## 16. Migration history

### Early migrations (2026-08-24 to 2026-08-28)

- Document folders, AI connections, API keys, AI usage function
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

## 17. Glossary

- **RLS:** Row Level Security; database rules that decide which rows a user can read or change.
- **RBAC:** Role-Based Access Control; the system of roles, permissions, and ownership checks.
- **JWT:** A signed session token used to prove a caller is authenticated.
- **Edge Function:** A server-side function hosted by Supabase.
- **RAG:** Retrieval-Augmented Generation; supplying relevant private documents to an AI prompt before generating an answer.
- **Embedding:** A numeric representation of text used for similarity search.
- **pgvector:** PostgreSQL extension for storing and comparing vector embeddings.
- **Service role:** A highly privileged Supabase server credential that must never reach browser code.
- **SSRF:** Server-Side Request Forgery; a weakness where an attacker causes a server to request an unintended internal or private URL.
- **SECURITY DEFINER:** A PostgreSQL function attribute that causes the function to run with the privileges of the function owner rather than the caller.
- **CSRF:** Cross-Site Request Forgery; an attack where a third-party site tricks a user's browser into making unwanted requests.
- **Signed URL:** A time-limited URL that grants temporary access to a private storage object.
- **TOTP:** Time-based One-Time Password; a 6-digit code generated by an authenticator app that changes every 30 seconds.
- **SSRF:** Server-Side Request Forgery; a vulnerability where an attacker causes a server to make requests to unintended internal or private network resources.
- **Market:** A top-level organizational tenant in the multi-market tenancy model. Each organization belongs to exactly one market, and data cannot cross markets by default.
- **Legal Hold:** A designation that prevents data from being deleted or purged by normal retention processes, typically used for litigation or compliance.
- **Idempotency Key:** A unique identifier for an automation run that prevents duplicate executions of the same task.
- **Integrity Hash:** A SHA256 hash computed for each audit log entry, chained to the previous entry's hash, enabling detection of tampering.
