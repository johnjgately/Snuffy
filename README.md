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
