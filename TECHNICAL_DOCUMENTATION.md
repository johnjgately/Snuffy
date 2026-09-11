# Snuffy Technical Documentation

**Document status:** Current repository reference
**Product:** Snuffy — AI Command Assistant
**Frontend:** React 18, TypeScript, Vite
**Backend platform:** Supabase
**Last reviewed:** 2026-09-11

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

This document describes the repository as it currently exists, including the security hardening, RBAC infrastructure, audit system, storage governance, and test coverage.

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
- Five Supabase Edge Functions (ai-proxy, web-search, knowledge-rag, oauth, admin-api)
- AI chat requests through the AI proxy function
- Web search through the web-search function with Brave and DuckDuckGo
- Knowledge retrieval and RAG search through the knowledge-rag function
- OAuth2 user import through the oauth function
- Administrator API for user/role/permission management through the admin-api function
- Tamper-resistant audit logging via database triggers on all protected tables
- File access logging with download/preview/share tracking
- Storage review section for administrators
- Automated test suite (18 tests) covering anonymous access denial
- SQL test suite covering user isolation, admin access, ownership, audit, and RAG health

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
  |
  +--> Supabase Data API
  |      PostgreSQL tables protected by RLS + RBAC
  |      SECURITY DEFINER functions for audit and ownership
  |
  +--> Supabase Storage
  |      documents bucket (private, owner-scoped)
  |      knowledge-files bucket (private, owner-scoped)
  |
  +--> Supabase Edge Functions
         ai-proxy      — AI provider chat and testing
         web-search    — Brave/DuckDuckGo search
         knowledge-rag — Document processing, RAG, settings
         oauth         — OAuth2 user import
         admin-api     — User/role/permission management
              |
              +--> AI providers, search providers, OAuth providers,
                   and embedding services
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

All tables use Row Level Security. Policies enforce ownership (`owner_user_id = auth.uid()`), admin access (`is_admin()`), or manager relationships. Anonymous access is denied on all protected tables.

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

### Ownership columns

Every protected table has these columns (where applicable):

- `owner_user_id` — The user who owns the record. Set automatically by the `set_ownership_on_insert` trigger if not provided.
- `created_by_user_id` — The user who created the record. Set automatically.
- `updated_by_user_id` — The user who last updated the record. Set automatically on insert and update.
- `updated_at` — Timestamp of the last update. Set automatically.

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

Custom application directory: names, emails, roles, statuses, MFA flags, permissions, avatar data, activity metadata, and OAuth identifiers. This table is separate from Supabase's `auth.users`. Policies use `can_read_record` and `can_write_record`.

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
- Import or update users in the custom users table

Security:

- JWT verification required.
- Provider URLs validated to prevent SSRF (blocks localhost, internal IPs, metadata endpoints).
- OAuth state is single-use, bound to the user, and expires after 10 minutes.
- State is atomically claimed (concurrent requests cannot reuse it).
- PostgREST filter injection fixed — user lookup uses separate parameterized queries instead of `.or()`.
- Client secrets fetched server-side, never exposed to browser.
- Input validation on provider, code, and state parameters (length limits).

### `admin-api`

Purpose:

- User management (list, create, update, delete, suspend/reactivate)
- Role and permission management (permission matrix, capability CRUD)
- OAuth configuration management

Security:

- JWT verification required.
- Admin role verification required for all operations.
- Service-role access for database operations.

## 10. Security posture

### Access control model

The system uses a deny-by-default approach:

1. **Anonymous access is denied** on all protected tables, storage buckets, and RPC functions. The anon role has no grants on any protected table.
2. **Row-level security** is enabled on every table. Policies enforce ownership (`owner_user_id = auth.uid()`), admin access (`is_admin()`), or manager relationships.
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

Audit logs are tamper-resistant — regular users cannot delete or modify them. Only admins can read all audit logs; standard users see only their own.

### Remaining hardening items

- Add rate limiting to AI, search, OAuth, and document-processing operations.
- Add upload size enforcement at the storage policy level (currently enforced in edge function code).
- Complete OAuth PKCE and nonce support.
- Add DNS re-resolution protection for outbound endpoint validation.
- Enforce single-row settings with a database constraint.

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
- Rate limiting is not yet implemented.
- Upload size enforcement is in edge function code, not at the storage policy level.
- Single-row settings tables are not enforced by a database constraint.

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
