# Multi-Market Account, Ownership, and Permission Model

## Account Lifecycle

### Sign-in flow

1. User authenticates via Supabase Auth (email/password, Google OAuth, or Microsoft OAuth).
2. The system calls `link_or_create_user_profile(auth_user_id, email, name, provider, avatar_url, email_verified)`.
3. The function searches for an existing profile by `auth_user_id` first.
4. If found and active: updates `last_login_at` and adds the provider to `login_providers`. Returns the profile.
5. If found but suspended/deleted: denies access and logs `auth.login_denied`.
6. If not found by `auth_user_id`, searches by normalized email (only if email is verified).
7. If exactly one active profile has that verified email: links `auth_user_id` to it. Logs `auth.profile_linked`.
8. If multiple profiles have the same email: flags for admin review. Logs `auth.profile_conflict`.
9. If no match: creates a new profile with `auth_user_id` set. Logs `auth.profile_created`.

### Key rules

- `auth_user_id` is the permanent link to the authentication identity. It is unique (partial unique index).
- Email is normalized (lowercase, trimmed) before matching. Email is not the sole identifier.
- Unverified emails never trigger auto-linking. They are flagged for admin review.
- A disabled user cannot regain access through any OAuth provider.
- `login_providers` tracks which providers the user has used (e.g., `['google', 'password']`).

## Ownership Model

Every owned record has three ownership fields:

| Field | Type | Description |
|---|---|---|
| `ownership_type` | text | `personal`, `organization`, or `shared` |
| `owner_user_id` | uuid | The user who owns the record (for personal/shared) |
| `organization_id` | uuid | The organization that owns the record (for organization/shared) |

### Ownership types

- **Personal**: `ownership_type = 'personal'`, `owner_user_id` set, `organization_id` null. Only the owner can access.
- **Organization**: `ownership_type = 'organization'`, `organization_id` set, `owner_user_id` may be null. Any active org member can read; org admins can write.
- **Shared**: `ownership_type = 'shared'`, both `owner_user_id` and `organization_id` may be set. Owner and org members can read; owner and org admins can write.

### Default

All existing records default to `ownership_type = 'personal'` with their current `owner_user_id`. This preserves existing access patterns.

## Permission Model

### Access control functions

| Function | Purpose |
|---|---|
| `can_access_record(table, owner, org, type)` | SELECT: true for owner (personal), org member (org/shared), or admin |
| `can_write_record_typed(table, owner, org, type)` | UPDATE/DELETE: true for owner (personal), org admin (org/shared), or admin |
| `is_org_member(org_id)` | True if current user is an active member of the org |
| `is_org_admin(org_id)` | True if current user is an org owner or administrator |
| `is_admin()` | True if current user has the `admin` role in `app_roles` |

### RLS policy pattern

Every owned table uses four policies (SELECT, INSERT, UPDATE, DELETE) with the same pattern:

- **SELECT**: `USING (can_access_record(...))`
- **INSERT**: `WITH CHECK (personal: owner = auth.uid(); org: is_org_admin(org_id); admin: is_admin())`
- **UPDATE**: `USING + WITH CHECK (can_write_record_typed(...))`
- **DELETE**: `USING (can_write_record_typed(...))`

### Organization roles

| Role | Can read org data | Can write org data | Can manage members |
|---|---|---|---|
| owner | Yes | Yes | Yes |
| administrator | Yes | Yes | Yes |
| manager | Yes | No | No |
| member | Yes | No | No |
| viewer | Yes | No | No |

Organization administrators cannot access a user's personal records unless the user explicitly shares them (sets `ownership_type = 'shared'`).

## Database Relationships

```
auth.users (Supabase managed)
  │
  ├─ 1:1 → public.users (auth_user_id)
  │         │
  │         ├─ 1:N → public.organization_memberships
  │         │         │
  │         │         └─ N:1 → public.organizations
  │         │
  │         └─ 1:N → public.documents, .automations, etc.
  │                   (owner_user_id + organization_id + ownership_type)
  │
  └─ 1:1 → public.app_roles (role)
```

### Tables

- **organizations**: id, name, slug, description, market_type, status, owner_user_id
- **organization_memberships**: id, organization_id, user_id, role, status, invited_by
  - Unique constraint on (organization_id, user_id)
  - CHECK constraint on role values
- **users**: extended with auth_user_id, email_normalized, login_providers, last_login_at
  - Unique partial index on auth_user_id (non-null)
  - Unique partial index on email_normalized (active users)

### Indexes

- `idx_users_auth_user_id` — profile lookup by auth identity
- `idx_users_email_normalized` — email-based linking
- `idx_memberships_org`, `idx_memberships_user` — membership lookups
- `idx_<table>_org` — organization-scoped queries on every owned table

## Audit Process

All security-relevant events are logged to `audit_logs` via the `log_audit()` function or automatic triggers:

| Event | Action | When |
|---|---|---|
| Profile created | `auth.profile_created` | New user signs in for the first time |
| Profile linked | `auth.profile_linked` | Existing email/password user signs in via OAuth with verified email |
| Login | `auth.login` | Returning user signs in |
| Login denied | `auth.login_denied` | Disabled user attempts sign-in |
| Profile conflict | `auth.profile_conflict` | Multiple profiles or unverified email |
| Ownership transfer | `ownership.transfer` | Record ownership changes hands |
| Membership added | `membership.add` | User added to organization |
| Membership removed | `membership.remove` | User removed from organization |
| Org created | `org.create` | New organization created |
| User disabled | `user.disable` | Admin disables a user account |
| Role assigned | `role.assign` | Admin changes a user's role |

Audit logs are append-only. Regular users cannot edit or delete them. Audit history is preserved even after a user is disabled.

## Account Removal and Lifecycle

- **Disabling**: Sets `status = 'suspended'`. User cannot sign in. Personal records remain but are inaccessible. Organization records are unaffected.
- **Deletion**: Sets `status = 'deleted'`. Organization-owned records are preserved (owned by the org, not the user). Personal records may be transferred via `transfer_record_ownership`.
- **Ownership transfer**: Admin or record owner can call `transfer_record_ownership(table, record_id, new_owner, type, org_id)`. Transfer is audited.
- **Audit preservation**: All audit history is retained regardless of user status.

## Multi-Market Readiness

- `organizations.market_type` allows configurable market categories (e.g., 'healthcare', 'finance', 'government').
- The core identity, ownership, permissions, storage, and audit architecture is market-agnostic.
- Market-specific modules, terminology, workflows, and fields can be added without changing the core tables.
- The `market_type` field is a free-text string, not an enum, allowing flexible categorization.

## Admin API Endpoints

The admin-api edge function now supports:

| Resource | Method | Purpose |
|---|---|---|
| `organizations` | GET | List all organizations |
| `memberships` | GET | List all memberships |
| `org-create` | POST | Create a new organization |
| `membership-add` | POST | Add a member to an organization |
| `membership-remove` | POST | Remove a member |
| `ownership-transfer` | POST | Transfer record ownership |
| `user-disable` | POST | Disable a user account |

All admin-api endpoints require the `admin` role.
