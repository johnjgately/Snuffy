# Snuffy Technical Documentation

**Document status:** Current repository reference
**Product:** Snuffy — AI Command Assistant
**Frontend:** React 18, TypeScript, Vite
**Backend platform:** Supabase
**Last reviewed:** 2026-09-09

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

This document describes the repository as it currently exists. It also identifies areas that are represented in the interface but are not yet fully connected to persistent backend behavior.

## 2. Current implementation status

### Implemented and connected

- React application shell and responsive navigation
- Supabase email/password sign-up, sign-in, session restoration, and sign-out
- Supabase PostgreSQL migrations and row-level security configuration
- Supabase Storage buckets and storage policies
- Five Supabase Edge Functions
- AI chat requests through the AI proxy function
- Web search through the web-search function
- Knowledge retrieval requests through the knowledge-rag function
- Browser persistence for selected interface preferences
- Browser speech recognition and speech synthesis where supported

### Partially implemented or demo-oriented

- Several workspace pages use demo records and local React state rather than database-backed CRUD.
- The custom user directory is separate from Supabase Auth users.
- Audit events currently increase a local counter but are not written to a durable audit-events table.
- OAuth configuration and callback code exist, but the OAuth flow does not visibly establish a normal Supabase browser session.
- Some referenced RAG database functions are not represented in the repository migrations.

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
  |      PostgreSQL tables protected by RLS
  |
  +--> Supabase Storage
  |      documents and knowledge-files buckets
  |
  +--> Supabase Edge Functions
         ai-proxy
         web-search
         knowledge-rag
         oauth
         oauth-handler
              |
              +--> AI providers, search providers, OAuth providers,
                   and embedding services
```

There is no separate application server in this repository. Browser code talks directly to Supabase for authentication and selected table reads, and calls Edge Functions for operations that require server-side provider keys or service-role access.

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
  functions/                Supabase Edge Function source code

public/                    Static public assets, if added
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

The sign-up email does not need to match a Bolt account email. The app's login is separate from Bolt and separate from the Supabase dashboard account.

### Supabase client configuration

The browser client reads these public build-time variable names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only the public anonymous key belongs in browser code. Service-role keys and provider API keys must remain in Edge Function secrets or another server-only environment.

`getAuthHeaders()` obtains the current access token and returns an Authorization header for Edge Function requests. If no session exists, it falls back to the anonymous key; protected functions should still reject unauthenticated requests.

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

Browser support and microphone permission are required. Voice functionality is not a substitute for server-side authentication or authorization.

## 7. Database model

All tables created by the repository migrations are intended to use Row Level Security. The exact effective policies in the deployed database should be checked against the database catalog before production launch.

### Core tables

#### `document_folders`

Stores document folders. It has a nullable `user_id` for ownership. Legacy rows with a null owner remain visible to authenticated users under the current policy design.

#### `documents`

Stores owner-scoped document metadata:

- Owner user ID
- Name, type, MIME type, and byte size
- Storage path and optional folder
- Processing status
- Tags and summary
- Creation timestamp

The intended policies scope reads and writes to `auth.uid() = user_id`.

#### `ai_connections`

Stores AI and local provider connections:

- Name and provider type
- Endpoint and available models
- Enabled and health status
- Usage tokens and cost
- Masked key and stored API key

The raw API key is sensitive and must not be exposed to ordinary browser clients. Current table-level authenticated policies do not provide column-level protection.

#### `automations`

Stores automation definitions, including trigger, action, schedule, enabled status, last-run information, and run count.

#### `automation_runs`

Stores automation execution history, status, output, summary, and timestamps.

#### `users`

Custom application directory containing names, emails, roles, statuses, MFA flags, permission arrays, avatar data, activity metadata, and OAuth identifiers.

This table is not the same as Supabase's managed `auth.users` table and is not automatically populated by email/password registration unless application code performs that synchronization.

#### `role_permissions`

Stores capability and role access levels for the application permission matrix.

#### `search_settings`

Stores Internet search provider preferences, fallback behavior, result limits, safe-search mode, timeout, and enabled state. It is intended to behave as a single-row configuration table, but that invariant is not enforced by a database constraint.

#### `search_logs`

Stores search query metadata, provider usage, fallback information, result URLs, timing, AI metadata, success state, and timestamps.

### Knowledge and RAG tables

#### `knowledge_bases`

Stores knowledge library names, descriptions, classification, and timestamps.

#### `knowledge_documents`

Stores document processing records, including:

- Knowledge-base association
- File metadata and storage path
- SHA-256 file hash and version
- Classification
- Processing and OCR status
- Embedding status
- Chunk and page counts
- Approval fields and effective dates

#### `knowledge_chunks`

Stores extracted text chunks and metadata, including page, slide, sheet, section, and cell-range references. Embeddings use `vector(1024)` and an IVFFlat cosine-similarity index.

#### `knowledge_settings`

Stores embedding provider, model, endpoint, vector provider, dimension, chunk size, and overlap. It is intended as a single-row configuration table without a database-enforced single-row constraint.

### Database function

`increment_ai_usage(conn_id, token_count)` updates AI connection usage counters through a `SECURITY DEFINER` function. Public and anonymous execution is revoked in the final security migration. The deployed database should confirm that only the intended authenticated/server role can execute it.

### Extensions and indexes

The knowledge migration enables the PostgreSQL `vector` extension. Indexes cover document ownership, folders, creation time, knowledge relationships, document hashes, processing status, and vector similarity.

## 8. Storage

### `documents` bucket

The repository creates this as a public bucket while also defining owner/path-based policies. The public setting conflicts with a private owner-scoped design and should be changed to private before storing sensitive documents.

Expected path format:

```text
<authenticated-user-id>/<filename>
```

### `knowledge-files` bucket

The repository creates this as a private bucket, but its current policies allow anonymous and authenticated users to read, create, update, and delete objects without an owner or path restriction. This is a critical access-control gap for private knowledge files.

## 9. Edge Functions

All five functions are configured with `verify_jwt = true` in `supabase/config.toml`.

### `ai-proxy`

Purpose:

- Test AI provider connections
- Send chat prompts to supported providers
- Use server-side provider keys
- Support cloud providers and local OpenAI-compatible endpoints
- Update health and usage information

Expected request actions include `test` and `chat`.

Security requirements:

- Validate the caller's JWT.
- Authorize the caller for the selected connection.
- Never return raw API keys.
- Allowlist or otherwise restrict outbound endpoints to prevent server-side request forgery.
- Limit prompt size, request duration, and provider response size.

### `web-search`

Purpose:

- Search through Brave Search
- Fall back to DuckDuckGo
- Apply safe-search and result-limit settings
- Filter and sanitize returned URLs, titles, and snippets
- Record search metadata

The Brave key is expected to be stored as an Edge Function secret. Search result filtering covers several local/private address patterns, but outbound requests and configurable settings still require strict validation.

### `knowledge-rag`

Purpose:

- Process knowledge documents
- Extract and chunk text
- Generate embeddings through Ollama or an OpenAI-compatible endpoint
- Store chunks and embeddings
- Retrieve context and citations
- Report health, settings, and knowledge statistics

Expected actions include `process`, `search`, `rag-query`, `health`, `getSettings`, `updateSettings`, and `stats`.

The function uses service-role access, so JWT validation alone is not sufficient. It must also enforce document ownership, knowledge-base permissions, file limits, content-type limits, and safe outbound endpoint rules.

The code references `rag_search` and `rag_health_check`. Those database functions are not present in the repository migrations; they must either exist in the deployed database or be implemented before relying on those paths.

### `oauth` and `oauth-handler`

These functions read enabled provider configuration, create authorization URLs, exchange authorization codes, fetch provider profiles, and update rows in the custom `users` table.

The repository contains two similar OAuth functions. Keeping one canonical implementation would reduce maintenance and deployment ambiguity.

The OAuth flow requires additional protections before production use:

- Validate a single-use state value on callback.
- Bind state to the initiating browser/session.
- Use PKCE and nonce where supported.
- Avoid returning provider token-exchange details to the browser.
- Do not expose client secrets through table reads.
- Establish or clearly document the resulting Supabase Auth session behavior.

## 10. Security posture and priority actions

This section records implementation findings, not a substitute for a live database security review.

### Critical before production

1. Restrict sensitive tables by owner, tenant, or administrator role instead of allowing every authenticated user to read and write all rows.
2. Remove browser access to raw `ai_connections.api_key` and `oauth_configs.client_secret`.
3. Make `knowledge-files` private and scope every object operation to an authenticated owner or authorized knowledge-base member.
4. Add resource authorization inside service-role Edge Functions, not only JWT validation.
5. Add outbound endpoint allowlists for AI and embedding providers to reduce SSRF risk.
6. Complete OAuth state validation, PKCE, nonce, and session handling.
7. Validate upload size, file type, decompression cost, and processing duration.
8. Add rate limiting and abuse controls to AI, search, OAuth, and document-processing operations.

### Important hardening

- Make the `documents` bucket private.
- Replace the custom user directory's editable role and permission fields with server-enforced administration operations.
- Scope search logs and automation runs to the appropriate owner, tenant, or administrator role.
- Protect approval, classification, moderation, and audit fields from ordinary client updates.
- Enforce single-row settings with a database constraint or a server-side upsert function.
- Add a durable audit-event table and write events server-side for security-sensitive actions.
- Remove or reconcile duplicate OAuth implementations.
- Confirm the deployed database contains all RPC functions referenced by Edge Functions.
- Never place service-role or provider secrets in `VITE_` variables or frontend source.

## 11. Configuration and secrets

The application requires the Supabase URL and anonymous browser key as frontend configuration. Server-only secrets should be configured for Edge Functions, such as:

- AI provider API keys
- Brave Search API key
- OAuth client secrets
- Service-role access used internally by trusted Edge Functions

Secret values are intentionally not documented here. Do not commit secret values to the repository, place them in client-visible code, or paste them into public issue trackers.

## 12. Local development and verification

Available package scripts:

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production frontend build |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint over the project |
| `npm run preview` | Preview the production build locally |

Recommended verification sequence:

1. Confirm the app loads and the public landing page appears.
2. Create an app account using the landing-page sign-up form.
3. Sign out and sign back in.
4. Confirm the authenticated shell and navigation render.
5. Test privacy mode and emergency stop behavior.
6. Add an AI connection only after server-side key handling is confirmed.
7. Test AI chat with a local provider before enabling cloud providers.
8. Test web search and confirm failure states are visible.
9. Test knowledge upload and processing with a non-sensitive sample file.
10. Run type checking, linting, and the production build.
11. Review database RLS and storage policies in the deployed project.

## 13. Deployment checklist

### Frontend

- Build succeeds.
- Frontend configuration contains only public Supabase values.
- No service-role or provider secrets are bundled.
- Production origin is configured for authentication redirects if OAuth is enabled.
- The production site uses HTTPS.

### Supabase

- All migrations are applied in order.
- RLS is enabled on every exposed application table.
- Policies are owner-, tenant-, or role-scoped.
- Storage buckets are private unless public access is intentional.
- Storage object policies match the intended owner/path model.
- Edge Functions are deployed with JWT verification enabled.
- Edge Function secrets exist and are server-only.
- Service-role functions enforce resource authorization.
- Required RPC functions and extensions exist.
- Database backups and monitoring are enabled.

### Product readiness

- Demo records are clearly separated from live records or removed.
- Each major screen has a real empty state, loading state, and error state.
- Account recovery and password reset behavior are documented and tested.
- Audit events are durable and tamper-resistant.
- Data deletion and retention behavior are documented.
- Provider costs, request limits, and upload limits are enforced.

## 14. Known limitations

- There is no automated test suite in the current package scripts.
- Several UI screens are demonstrations rather than complete persistent workflows.
- The app's localStorage state is browser-specific and is not synchronized between devices.
- The custom user table and Supabase Auth user list can diverge.
- The current RLS design includes broad authenticated access on multiple tables.
- OAuth is not yet equivalent to the email/password session flow.
- Storage privacy settings and policies are inconsistent.
- Some RAG database dependencies are assumed rather than created by repository migrations.

## 15. Recommended next implementation phase

The next phase should focus on security and persistence rather than adding more screens:

1. Define the ownership and administrator model.
2. Add server-enforced authorization for every sensitive operation.
3. Protect or remove raw secret columns from browser-readable tables.
4. Make private storage truly private.
5. Connect the highest-value screens to durable database operations.
6. Add durable audit events.
7. Add integration tests for sign-in, AI proxy authorization, search, uploads, RAG, and storage policies.
8. Only then enable OAuth and production AI-provider workflows.

## 16. Glossary

- **RLS:** Row Level Security; database rules that decide which rows a user can read or change.
- **JWT:** A signed session token used to prove a caller is authenticated.
- **Edge Function:** A server-side function hosted by Supabase.
- **RAG:** Retrieval-Augmented Generation; supplying relevant private documents to an AI prompt before generating an answer.
- **Embedding:** A numeric representation of text used for similarity search.
- **pgvector:** PostgreSQL extension for storing and comparing vector embeddings.
- **Service role:** A highly privileged Supabase server credential that must never reach browser code.
- **SSRF:** Server-Side Request Forgery; a weakness where an attacker causes a server to request an unintended internal or private URL.
