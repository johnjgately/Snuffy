# Snuffy

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-rjti4v3m)

## Overview

Snuffy is an AI-powered operations platform with document management, knowledge bases, RAG (Retrieval-Augmented Generation), automations, audit logging, and role-based access control.

## OAuth Configuration

The application uses a custom OAuth flow implemented as a Supabase Edge Function. OAuth provider configurations (client ID, client secret, endpoints, scopes) are stored in the `oauth_configs` database table and managed by administrators via the Users & Roles screen.

### Active OAuth Flow

1. **Edge Function**: `oauth` (at `/functions/v1/oauth`)
   - `GET ?action=authorize&provider=<provider>` — initiates authorization by generating a one-time state token stored in `oauth_states`, returns the provider authorization URL
   - `POST` with `action=callback` — exchanges the authorization code for an access token, fetches user info from the provider, creates or updates the user in the `users` table
   - `GET ?action=providers` — lists enabled OAuth providers

2. **State Protection**: OAuth state tokens are stored server-side in the `oauth_states` table with a 10-minute expiry. Each token is single-use (marked `used_at` on callback) to prevent replay attacks.

3. **Supported Providers** (configurable by admins):
   - Google (`google`): `https://accounts.google.com/o/oauth2/v2/auth`
   - GitHub (`github`): `https://github.com/login/oauth/authorize`
   - Microsoft (`azure`): `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`

4. **Retired Endpoint**: The `oauth-handler` edge function has been removed. It previously returned HTTP 410 (Gone). All OAuth traffic now uses the `oauth` function.

### Environment Variables

The following environment variables are required and pre-configured:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous (public) key for client-side access |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, used by edge functions) |

OAuth client secrets are stored in the `oauth_configs` table, not in environment variables.

## RAG / Knowledge Base

The RAG system uses pgvector for vector similarity search. The following database functions support RAG operations:

- **`rag_search(query_embedding, top_k, p_user_id, p_knowledge_base_ids)`**: Performs cosine similarity search on `knowledge_chunks` using pgvector's `<=>` operator. Returns the top-k most similar chunks with similarity scores. Scoped to the calling user's data.
- **`rag_health_check()`**: Verifies the pgvector extension is installed and reports total/embedded chunk counts. Called by the AI Training Dashboard's health check to report RAG system status.

The AI Training Dashboard displays real-time health status for:
- **Embedding Service**: Provider, model, endpoint, and connectivity status
- **Vector Database**: pgvector extension status, total chunks, embedded chunks, and connection status

## Database Migrations

Migrations are in `supabase/migrations/` and are applied via the Supabase MCP tools. Key migrations:

- `20260910160000_create_audit_logs` — Immutable audit log table with server-side triggers
- `20260910170000_secure_file_storage` — Private storage buckets, file metadata, retention tracking
- `20260910180000_add_rag_functions` — `rag_search` and `rag_health_check` database functions
- `20260910190000_fix_audit_trigger_for_tables_without_id` — Audit trigger handles tables without `id` column
- `20260910193500_add_missing_updated_by_columns` — Adds `updated_by_user_id` to tables missing it

## Testing

Tests are in `tests/` and use Vitest. Two types of tests exist:

1. **Client-side tests** (`tests/rls.test.ts`): Run with `npm test`. These verify that anonymous access is denied to all protected tables, storage buckets, and RPC functions using only the anon key.

2. **SQL security tests** (`tests/sql-tests.sql`): Documented SQL assertions for user isolation, admin access, ownership assignment, audit logging, and RAG health. These are run via the Supabase MCP `execute_sql` tool using `SET LOCAL ROLE authenticated` to simulate real user contexts.

### Test Coverage

- Anonymous access denied for: documents, file_metadata, audit_logs, file_access_log, knowledge_chunks, knowledge_bases, users, app_roles, storage_settings
- Anonymous storage access denied for: documents bucket (list, download, upload), knowledge-files bucket (download, upload)
- Anonymous RPC access denied for: rag_health_check, rag_search, record_file_access
- User isolation: User A sees only own records, User B sees only own records
- Admin access: Admin sees all records
- User A cannot update or delete User B's records
- Ownership: owner_user_id and created_by_user_id set to creating user on insert
- Audit: log_audit creates entries for file access, role changes, denied access, record updates
- Audit: record_file_access creates file_access_log entries and increments access_count
- RAG: rag_health_check returns vector extension status and chunk counts
- RAG: rag_search returns matching results and respects user isolation

## Implementation Summary

### Tables Changed

- `file_metadata` — New table for file governance (bucket, path, owner, MIME type, size, upload date, retention, access tracking)
- `file_access_log` — New table tracking file downloads/previews/shares
- `storage_settings` — New table for allowed MIME types, max file size, default retention
- `automation_runs`, `knowledge_chunks`, `search_logs` — Added missing `updated_by_user_id` column

### Policies Added

- Storage: `auth_upload_own_documents`, `auth_read_own_documents`, `auth_delete_own_documents` (documents bucket)
- Storage: `auth_upload_own_knowledge`, `auth_read_own_knowledge`, `auth_delete_own_knowledge` (knowledge-files bucket)
- `file_metadata`: 4 CRUD policies scoped to `owner_user_id = auth.uid()`
- `file_access_log`: 3 policies (select own, insert own, delete own)
- `storage_settings`: select for all authenticated, update for admin only

### Storage Changes

- `documents` and `knowledge-files` buckets set to `public = false`
- All storage policies scoped to `authenticated` role only (no anon access)
- Downloads use 60-second signed URLs instead of raw storage URLs
- Uploads validated against allowed MIME types and 50 MB size limit
- File metadata recorded on upload
- Admin-only Storage Review page added (bucket posture, owner, upload date, retention status)

### OAuth Cleanup Performed

- Removed retired `oauth-handler` edge function (code, config, and deployed function)
- Active OAuth flow uses `oauth` edge function exclusively
- OAuth configuration documented in README

### RAG Changes

- Created `rag_search()` function: server-side pgvector cosine similarity search, scoped to user
- Created `rag_health_check()` function: verifies pgvector extension and reports chunk counts
- Rewrote `ragSearch()` in knowledge-rag edge function to use server-side RPC
- Enhanced health check to return vector extension status, total/embedded chunk counts
- AI Training Dashboard displays enriched RAG health data

### Tests Added

- `tests/rls.test.ts` — 18 client-side tests (anonymous access denial for tables, storage, RPCs)
- `tests/sql-tests.sql` — SQL test suite for user isolation, admin access, ownership, audit, RAG health
- `vitest.config.ts` — Vitest configuration
- `npm test` script added to package.json

### Bug Fixes During Testing

- Fixed `audit_trigger_fn()` to handle tables without an `id` column (app_roles, manager_relationships, etc.)
- Fixed `set_ownership_on_insert()` trigger failing on tables missing `updated_by_user_id`
- Added missing `updated_by_user_id` column to `automation_runs`, `knowledge_chunks`, `search_logs`

### Manual Deployment Steps Still Required

- None. All migrations are applied, edge functions are deployed, and the build passes.
