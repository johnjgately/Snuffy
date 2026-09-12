# Security and Operations Documentation

## Release Metadata

| Field | Value |
|-------|-------|
| Application Version | 2.0.0 |
| Repository Commit | `security-hardening-v2` |
| Migration Range | `20260824210621` – `20260912206000` |
| Environment | Production |
| Deployment Date | 2026-09-12 |
| Last Review Date | 2026-09-12 |

### Migration Identifiers

1. `20260912200000_create_markets_and_link_organizations.sql` — Markets table, market_id on all org-owned tables
2. `20260912201000_account_security_tables.sql` — Email verification, password reset tokens, MFA, sessions, lockout
3. `20260912202000_emergency_stop_system.sql` — Emergency stop switches and history
4. `20260912203000_local_ai_connectors.sql` — Local AI connector registry with SSRF prevention
5. `20260912204000_automation_reliability.sql` — Retry, idempotency, concurrency, timeout columns
6. `20260912205000_document_security_and_governance.sql` — Quarantine, malware scan, legal holds, classifications
7. `20260912206000_api_security_and_cross_market_transfers.sql` — Rate limits, cross-market transfers, audit integrity

---

## 1. Account and Login Policy

### Email Verification
- New accounts must verify their email before accessing protected data, AI, documents, automations, or organization features.
- Verification tokens are single-use, 24-hour lifetime, stored as SHA256 hashes.
- Resend is rate-limited to 1 per 60 seconds.
- Implementation: `auth-api` edge function, `password_reset_tokens` table (reused for verification tokens).

### Password Reset
- Single-use, short-lived (1 hour) reset tokens.
- Creating a new token invalidates all prior tokens for that user (`invalidate_reset_tokens` function).
- On successful reset: all sessions are revoked, password_changed_at is updated.
- Tokens are stored as SHA256 hashes — never plaintext.
- Implementation: `auth-api` edge function, `password_reset_tokens` table.

### MFA (TOTP)
- Optional by default for all users.
- Required for platform administrators (enforced at the application level).
- Organization administrators can require MFA for all members (`organizations.mfa_required`).
- TOTP authenticator app support (RFC 6238). System structured to add passkeys later.
- Secrets stored hashed in `mfa_enrollments` table.
- Disabling MFA revokes all sessions.
- Implementation: `auth-api` edge function, `mfa_enrollments` table.

### Session Policy
- Short-lived access sessions with secure refresh handling.
- Idle timeout: 30 minutes (enforced via `user_sessions.last_activity_at`).
- Absolute session lifetime: 12 hours (enforced via `user_sessions.expires_at`).
- Logout revokes the active session.
- Password reset, password change, MFA reset, disabled-user status, or admin "revoke sessions" action revokes all sessions (`revoke_user_sessions` function).
- Implementation: `user_sessions` table, `revoke_user_sessions` function.

### Account Lockout
- Rate limiting by account (email hash) and IP address.
- After 5 failed attempts in 15 minutes: account locked for 15 minutes.
- Does not reveal whether an email address exists (uniform error messages).
- All lockouts and suspicious authentication events are logged in `audit_logs` and `account_lockouts`.
- Implementation: `login_attempts` table, `account_lockouts` table, `count_recent_failures` and `is_account_locked` functions.

### Disabled Users
- Disabled users cannot sign in, refresh sessions, access APIs, run automations, view documents, or submit AI requests.
- Disabled status checked at sign-in and on every `my-role` API call.
- Data is preserved based on retention policy and legal-hold rules.
- Organization admins can disable membership within their organization; platform admins can disable the entire account.
- Disabling a user revokes all sessions immediately.
- Implementation: `users.disabled` column, `user-disable` admin-api resource, `revoke_user_sessions` function.

### Admin-Created Users
- Organization or platform administrators can manually create users with an initial password.
- Initial password must be at least 8 characters (strength requirement).
- Account is marked with `must_reset_password = true` and `initial_password_changed = false`.
- On first sign-in: only password-change and logout actions are allowed until password is changed.
- No access to app data, AI, uploads, automations, or organization administration before password change.
- `created_by_admin_user_id` records which administrator created the user.
- `initial_password_changed` tracks whether the initial password was changed.
- Audit log records: administrator ID, timestamp, and whether initial password was changed.
- Passwords are never stored in plaintext (Supabase Auth handles hashing).
- Implementation: `admin-api` edge function, `users.must_reset_password`, `users.created_by_admin_user_id`.

---

## 2. Multi-Market Tenancy Model

### Market Structure
- A "market" is a top-level organizational tenant, not merely a label.
- Each organization belongs to exactly one market (`organizations.market_id`).
- Every organization-owned record includes `market_id` (inherited from organization).
- Personal records belong to one user and are not visible to other users unless explicitly shared.
- Data cannot cross markets by default.

### Cross-Market Access
- Cross-market access, sharing, transfer, export, search, RAG retrieval, or automation use is denied unless explicitly approved by a platform administrator.
- Approvals are recorded in `cross_market_transfers` and `cross_market_shares` tables with reason, approver, and scope.
- Market boundaries are enforced in database RLS policies and server-side authorization via `is_same_market()` function.

### User Context
- A user may belong to multiple organizations and markets.
- Active organization and market context is determined by the user's most recent active membership.

### Ownership Transfer
- Only organization admins or platform admins can transfer organization-owned records.
- Cross-organization or cross-market transfers require platform-admin approval and a recorded reason.
- All transfers create audit entries with: old owner, new owner, old organization, new organization, old market, new market, actor, timestamp, and reason.
- Implementation: `cross_market_transfers` table, `transfer_record_ownership` function.

### Owner Departure
- Organization-owned records remain with the organization.
- Personal records remain personal and become inaccessible to the former organization.
- Automations owned by the departing user are paused until reassigned.
- Shared records are reviewed according to the membership-removal workflow.

### Shared Records
- Sharing identifies scope: user-specific, organization-wide, or market-approved.
- When a user loses organization membership, user-specific access through that membership is revoked immediately.
- Organization-owned shared access remains available only to current members with the appropriate role.
- No shared record may silently become public.
- Implementation: `record_shares` table with `share_scope`, `market_id`, `expires_at`, `revoked_at` columns; `cross_market_shares` table.

---

## 3. Authorization Matrix

The authorization matrix is visible in the application under **Governance > Authorization Matrix**.

### Roles
- Platform Administrator
- Platform Auditor
- Organization Administrator
- Organization Member
- Organization Viewer
- Personal User

### Data Types Covered
User profiles, organizations, documents, personal/org/shared knowledge bases, RAG indexes, AI conversations, automations, API keys, local AI endpoints, audit logs, exports, security settings.

### Operations Per Cell
Read, Create, Update, Delete, Transfer, Export, Administer, Audit/View Logs.

### Conflict Resolution
Deny by default. The most restrictive applicable rule wins unless a platform administrator explicitly grants an approved exception.

### Enforcement
- Backend authorization via `can_read_record()`, `can_write_record()`, `is_admin()`, `is_org_admin()`, `is_org_member()` functions.
- Database RLS policies on all tables.
- API/Edge Function checks in `admin-api` and `auth-api`.

---

## 4. RAG and Document Security

### Document Classes
1. **Personal documents**: Only the owning user may read, update, delete, index, retrieve, export, or use in RAG. Administrators do not receive content access unless a documented break-glass procedure is used and audited.
2. **Organization documents**: Owned by an organization and market. Accessible only to current members with permissions from the authorization matrix. RAG retrieval enforces requesting user's organization, market, membership, and role at query time.
3. **Shared documents**: Access explicitly scoped to named users, an organization, or approved market-level audience. RAG retrieval respects the exact sharing scope and current membership status.

### Upload Security
- Files are scanned for malware before being made available (`documents.malware_scan_status`).
- File type validated using MIME type and file-content inspection, not only extensions.
- Mismatched, malformed, encrypted-unsupported, or dangerous file types are rejected.
- Suspicious uploads are quarantined (`documents.quarantined = true`): not searchable, downloadable, indexed, or included in RAG until cleared.
- Filenames are sanitized; path traversal, control characters, executable naming tricks, and content-type spoofing are prevented.
- Unique server-generated storage names (`documents.storage_object_name`).
- Signed URLs with short expiration and authorization checks before generation.
- Storage overwrite attempts and cross-tenant object access are prevented.
- Uploaded content is treated as untrusted data.

### Prompt Injection Detection
- Documents are scanned for likely prompt-injection text (instructions attempting to override system rules, reveal secrets, call tools, or alter permissions).
- `documents.prompt_injection_detected` and `documents.prompt_injection_flags` record findings.
- Embedded document instructions cannot change system behavior, permissions, tool use, or security settings.
- Suspicious content is flagged for review; audit events are preserved without exposing sensitive document contents in logs.

---

## 5. Local AI Connector Policy

### SSRF Prevention
- Users cannot enter arbitrary URLs, localhost, RFC1918 private IPs, link-local, metadata-service, or loopback addresses.
- All local AI access routes through registered, administrator-managed connectors.

### Connector Properties
- Unique identifier
- Approved organization and market scope
- Explicit allowlisted target endpoint(s) with method, max request/response size, timeout, and allowed model path
- Health status (unknown/healthy/unhealthy/degraded)
- Certificate/authentication configuration
- Owner/admin
- Creation and review dates
- Platform admin approval required

### Request Logging
- All connector configuration changes and AI requests routed through a connector are logged in `local_ai_connector_requests`.
- Platform administrators alone may register or approve connector endpoints.

---

## 6. Automation Reliability

### Required Fields
Each automation includes: owner, market, organization scope, schedule, time zone, enabled/paused status, concurrency policy, retry policy, and notification recipients.

### Implemented Features
- Scheduling ownership and reassignment when owner leaves (automations paused on owner departure).
- Retry attempts with exponential backoff (`retry_backoff_base_seconds`) and configurable max retry count.
- Idempotency keys for each run (`automation_runs.idempotency_key`, unique index).
- Duplicate-run prevention (unique idempotency key constraint).
- Per-run timeout and cancellation support (`timeout_at`, `cancelled_at`, `cancel_reason`).
- Concurrency limits: `max_concurrent_runs` per automation, `concurrency_policy` (allow/skip/queue).
- Clear statuses: queued, running, succeeded, failed, timed out, cancelled, skipped, paused, retrying.
- Failure notifications to owners and designated organization admins (`notification_recipients`).
- Audit trail for configuration changes, run start/end, inputs, outputs, failures, retries, cancellations, and actors.
- Secrets are never stored in `inputs` or `error_message`.
- Automations cannot execute outside their organization or market authorization scope.

---

## 7. Emergency Stop

### Activation
- Platform administrators can activate or deactivate emergency stop.
- Every activation and restoration requires a reason and creates an audit event.

### Controlled Switches
1. New AI Requests
2. Web Search / External Retrieval
3. Automations
4. Document Uploads & Processing
5. RAG Indexing & Retrieval
6. Voice Capture & Processing
7. Local AI Connector Requests
8. Provider API Key Use
9. New User Sessions / Sign-ins
10. Active Sessions
11. Active Requests / Jobs

### Behavior
- New requests for stopped services are denied with a safe maintenance/security message.
- Active long-running jobs are cancelled at the next safe checkpoint.
- Queued jobs are not silently destroyed — they are marked paused/cancelled with an audit record.
- Emergency stop dashboard shows: current status, affected services, activator, activation time, reason, and restoration history.
- Restoring service requires a platform administrator, a recorded reason, and a health/validation check before re-enabling.

---

## 8. Disaster Recovery and Operations

### Environments
- Separate development, staging, and production environments.
- Production credentials, customer data, provider keys, and internal endpoints are not used in development or staging unless explicitly approved and masked.

### Backups
- Automated database backups at least daily (Supabase managed).
- Point-in-time recovery supported (Supabase PITR).
- Encrypted backup storage.
- Retention: daily 30 days, weekly 12 weeks, monthly 12 months, subject to legal hold.

### Recovery Objectives
- Target RPO: 24 hours or better.
- Target RTO: 8 hours or better.
- Documented restore tests at least quarterly.

### Monitoring
- Uptime, authentication failures, authorization denials, database errors, queue failures, storage failures, connector health, provider errors, rate-limit events, and emergency-stop activation.
- Alerts designated administrators for high-severity incidents.

### Incident Response
- Severity levels, ownership, containment, evidence preservation, notification, resolution, and post-incident review workflow.

### Deployment
- Deployment rollback capability required.
- Migration rollback or documented forward-fix strategy before production migration.
- Deployments recorded with: version, commit identifier, migration IDs, actor, environment, timestamp, and result.

---

## 9. Data Governance

### Data Classifications
- Public, Internal, Confidential, Restricted/Sensitive.
- Prompts, chat history, search queries, IP addresses, uploaded documents, RAG content, audit logs, and automation outputs are treated as potentially sensitive.
- Privacy notices displayed; data collection minimized.

### Retention
- Retention schedules by data type.
- Configurable retention per organization (`retention_policies` table).
- Secure deletion workflow with deletion requests, approvals, deletion status, and audit records.

### Legal Hold
- Authorized administrators can place records under legal hold.
- Held data cannot be deleted or purged by normal retention processes.
- Legal-hold creation, release, scope, and reason are audited.
- Implementation: `legal_holds` table, `documents.legal_hold` and `knowledge_documents.legal_hold` columns.

### Data Export
- Export only data the requester is authorized to access.
- Short-lived signed download links.
- Log: export request, scope, actor, time, and result.
- Implementation: `export_requests` table.

### Audit Log Retention
- Security and authorization audit logs retained for at least 12 months, subject to legal hold.
- Described as "tamper-resistant" — integrity hashes and chain hashing implemented (`audit_logs.integrity_hash`, `audit_logs.previous_hash`).
- Periodic protected archival for high-value audit logs.

---

## 10. API and Secret Management

### CORS
- CORS origin allowlists per environment.
- Authenticated APIs never use unrestricted `*`.

### Security Headers
- Strict Content Security Policy appropriate to the application.
- Secure cookie settings: Secure, HttpOnly, SameSite, appropriate domain/path scope.

### Secret Rotation
- Secret-rotation procedure for application secrets, database credentials, OAuth secrets, signing keys, and provider API keys.

### API Key Encryption
- Provider API keys encrypted at rest.
- Stored secrets are never returned to clients after creation.

### Database Credentials
- Least-privilege database credentials.
- Read-only database access by default where write is not required.
- Query limits, statement timeouts, connection limits, credential rotation, and query auditing for privileged activity.

### API Validation
- Request and response schemas defined for all APIs and Edge Functions.
- All inputs validated server-side.
- Expected error codes and safe client-facing error responses.
- API quotas/rate limits (`api_rate_limits` table) and API versioning.
- Stack traces, secrets, internal hostnames, and provider details are never exposed to regular users.

### Structured Audit Events
- Authentication, authorization failure, data access, exports, role changes, transfers, secrets changes, connector changes, emergency-stop actions, and administrator actions.
