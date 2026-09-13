import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const isProduction = Deno.env.get("APP_ENV") === "production";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (isProduction) {
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
      };
    }
    return {
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
      "Vary": "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

function getClientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function checkRate(supabase: ReturnType<typeof createClient>, endpoint: string, identifier: string, roleTier: string, ip: string, userId: string | null): Promise<{ allowed: boolean; retryAfter: number }> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_endpoint: endpoint, p_scope: "user", p_identifier: identifier, p_role_tier: roleTier, p_ip: ip, p_user_id: userId ?? null,
  });
  if (error || !data) return { allowed: true, retryAfter: 0 };
  const result = data as { allowed: boolean; retry_after: number };
  return { allowed: result.allowed, retryAfter: result.retry_after ?? 0 };
}

async function logAudit(supabase: ReturnType<typeof createClient>, params: {
  actor_user_id: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  outcome?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.rpc("log_audit", {
      p_action: params.action,
      p_entity_type: params.entity_type ?? null,
      p_entity_id: params.entity_id ?? null,
      p_outcome: params.outcome ?? "success",
      p_actor_user_id: params.actor_user_id,
      p_metadata: params.metadata ?? {},
    });
  } catch { /* audit logging must never break the request */ }
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function rateLimitResponse(req: Request, retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded.", retry_after: retryAfter }), {
    status: 429,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

async function getUser(req: Request, supabase: ReturnType<typeof createClient>) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const { data } = await supabase.auth.getUser(header.slice(7));
  return data.user ?? null;
}

async function requireAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const user = await getUser(req, supabase);
  if (!user) return { user: null, ok: false, response: jsonResponse(req, { error: "Unauthorized." }, 401) };
  const { data: roleRow } = await supabase
    .from("app_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!roleRow || roleRow.role !== "admin") {
    const reqUrl = new URL(req.url);
    await logAudit(supabase, { actor_user_id: user?.id ?? null, action: "admin_api.denied", outcome: "denied", metadata: { resource: reqUrl.searchParams.get("resource") ?? "" } });
    return { user, ok: false, response: jsonResponse(req, { error: "Administrator access required." }, 403) };
  }
  return { user, ok: true, response: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: getCorsHeaders(req) });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource") ?? "";
    const ip = getClientIP(req);

    // All resources require admin except role lookup (which any authenticated user can do for themselves)
    if (resource === "my-role") {
      const user = await getUser(req, supabase);
      if (!user) {
        await logAudit(supabase, { actor_user_id: null, action: "role_lookup.denied", outcome: "denied" });
        return jsonResponse(req, { error: "Unauthorized." }, 401);
      };
      const { data: roleRow } = await supabase
        .from("app_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: userRow } = await supabase
        .from("users")
        .select("must_reset_password, email_verified, mfa_enabled, mfa_required, disabled, locked_until")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const isLocked = userRow?.locked_until && new Date(userRow.locked_until) > new Date();
      return jsonResponse(req, {
        role: roleRow?.role ?? "standard_user",
        must_reset_password: userRow?.must_reset_password ?? false,
        email_verified: userRow?.email_verified ?? false,
        mfa_enabled: userRow?.mfa_enabled ?? false,
        mfa_required: userRow?.mfa_required ?? false,
        disabled: userRow?.disabled ?? false,
        locked: isLocked ?? false,
      });
    }

    if (resource === "reset-password") {
      const user = await getUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);
      const body = await req.json().catch(() => ({}));
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      if (newPassword.length < 8) return jsonResponse(req, { error: "Password must be at least 8 characters." }, 400);
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!userRow) return jsonResponse(req, { error: "User record not found." }, 404);
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (updateAuthError) return jsonResponse(req, { error: "Could not update password." }, 500);
      await supabase.from("users").update({ must_reset_password: false, updated_by_user_id: user.id }).eq("id", userRow.id);
      await logAudit(supabase, { actor_user_id: user.id, action: "user.password_reset", entity_type: "users", entity_id: userRow.id });
      return jsonResponse(req, { ok: true });
    }

    const { user, ok, response } = await requireAdmin(req, supabase);
    if (!ok) return response;

    // Rate limit admin operations
    const rl = await checkRate(supabase, "admin", user.id, "platform_admin", ip, user.id);
    if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

    if (req.method === "GET") {
      if (resource === "users") {
        const { data, error } = await supabase
          .from("users")
          .select("id, name, email, role, status, mfa, permissions, oauth_provider, oauth_id, avatar_url, last_active, created_at, owner_user_id, auth_user_id, email_normalized, login_providers, last_login_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load users." }, 500);
        return jsonResponse(req, { users: data ?? [] });
      }

      if (resource === "organizations") {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug, description, market_type, status, owner_user_id, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load organizations." }, 500);
        return jsonResponse(req, { organizations: data ?? [] });
      }

      if (resource === "memberships") {
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("id, organization_id, user_id, role, status, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load memberships." }, 500);
        return jsonResponse(req, { memberships: data ?? [] });
      }

      if (resource === "roles") {
        const { data, error } = await supabase
          .from("app_roles")
          .select("user_id, role, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load roles." }, 500);
        return jsonResponse(req, { roles: data ?? [] });
      }

      if (resource === "permissions") {
        const { data, error } = await supabase
          .from("role_permissions")
          .select("id, capability, capability_icon, role, access_level")
          .order("capability");
        if (error) return jsonResponse(req, { error: "Could not load permissions." }, 500);
        return jsonResponse(req, { permissions: data ?? [] });
      }

      if (resource === "managers") {
        const { data, error } = await supabase
          .from("manager_relationships")
          .select("id, manager_id, managed_id, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load manager relationships." }, 500);
        return jsonResponse(req, { managers: data ?? [] });
      }

      if (resource === "oauth-configs") {
        const { data, error } = await supabase
          .from("oauth_configs")
          .select("id, provider, client_id, auth_url, token_url, userinfo_url, scopes, enabled, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load OAuth configurations." }, 500);
        return jsonResponse(req, { configs: data ?? [] });
      }

      if (resource === "audit-logs") {
        const actor = url.searchParams.get("actor") ?? "";
        const action = url.searchParams.get("action") ?? "";
        const entityType = url.searchParams.get("entity_type") ?? "";
        const outcome = url.searchParams.get("outcome") ?? "";
        const entityId = url.searchParams.get("entity_id") ?? "";
        const fromDate = url.searchParams.get("from_date") ?? "";
        const toDate = url.searchParams.get("to_date") ?? "";
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

        let query = supabase
          .from("audit_logs")
          .select("id, occurred_at, actor_user_id, actor_display_name, action, entity_type, entity_id, record_owner_user_id, file_path, outcome, request_id, source_ip, metadata")
          .order("occurred_at", { ascending: false })
          .limit(limit);

        if (actor) query = query.eq("actor_user_id", actor);
        if (action) query = query.ilike("action", `%${action}%`);
        if (entityType) query = query.eq("entity_type", entityType);
        if (outcome) query = query.eq("outcome", outcome);
        if (entityId) query = query.eq("entity_id", entityId);
        if (fromDate) query = query.gte("occurred_at", fromDate);
        if (toDate) query = query.lte("occurred_at", `${toDate}T23:59:59.999Z`);

        const { data, error } = await query;
        if (error) return jsonResponse(req, { error: "Could not load audit logs." }, 500);
        return jsonResponse(req, { logs: data ?? [] });
      }

      if (resource === "emergency-stop") {
        const { data, error } = await supabase
          .from("emergency_stop_switches")
          .select("id, service, label, is_stopped, stopped_by, stopped_at, reason, restored_by, restored_at, restored_reason, updated_at")
          .order("service");
        if (error) return jsonResponse(req, { error: "Could not load emergency stop switches." }, 500);
        const { data: history } = await supabase
          .from("emergency_stop_history")
          .select("id, service, action, actor_user_id, reason, occurred_at, metadata")
          .order("occurred_at", { ascending: false })
          .limit(100);
        return jsonResponse(req, { switches: data ?? [], history: history ?? [] });
      }

      if (resource === "markets") {
        const { data, error } = await supabase
          .from("markets")
          .select("id, name, slug, description, status, owner_user_id, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load markets." }, 500);
        return jsonResponse(req, { markets: data ?? [] });
      }

      if (resource === "connectors") {
        const { data, error } = await supabase
          .from("local_ai_connectors")
          .select("id, name, description, organization_id, market_id, allowlisted_endpoints, health_status, health_checked_at, health_error, owner_user_id, approved, approved_by, approved_at, created_at, updated_at, review_date")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load connectors." }, 500);
        return jsonResponse(req, { connectors: data ?? [] });
      }

      if (resource === "legal-holds") {
        const { data, error } = await supabase
          .from("legal_holds")
          .select("id, entity_type, entity_id, reason, placed_by, placed_at, released_at, released_by, release_reason, metadata")
          .order("placed_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load legal holds." }, 500);
        return jsonResponse(req, { holds: data ?? [] });
      }

      if (resource === "export-requests") {
        const { data, error } = await supabase
          .from("export_requests")
          .select("id, requested_by, scope, entity_type, entity_ids, status, download_url_expires_at, file_size_bytes, created_at, completed_at, metadata")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load export requests." }, 500);
        return jsonResponse(req, { exports: data ?? [] });
      }

      if (resource === "cross-market-transfers") {
        const { data, error } = await supabase
          .from("cross_market_transfers")
          .select("id, entity_type, entity_id, from_organization_id, to_organization_id, from_market_id, to_market_id, from_owner_user_id, to_owner_user_id, requested_by, reason, status, approved_by, approved_at, approval_reason, created_at, completed_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse(req, { error: "Could not load transfers." }, 500);
        return jsonResponse(req, { transfers: data ?? [] });
      }

      if (resource === "data-classifications") {
        const { data, error } = await supabase
          .from("data_classifications")
          .select("id, level, label, description, retention_days, created_at")
          .order("retention_days");
        if (error) return jsonResponse(req, { error: "Could not load classifications." }, 500);
        return jsonResponse(req, { classifications: data ?? [] });
      }

      if (resource === "retention-policies") {
        const { data, error } = await supabase
          .from("retention_policies")
          .select("id, entity_type, organization_id, market_id, retention_days, created_at, updated_at")
          .order("entity_type");
        if (error) return jsonResponse(req, { error: "Could not load retention policies." }, 500);
        return jsonResponse(req, { policies: data ?? [] });
      }

      if (resource === "storage-review") {
        // Get bucket posture from storage.buckets
        const { data: buckets } = await supabase
          .from("storage.buckets")
          .select("id, name, public, created_at, updated_at")
          .order("name");

        // Get all file metadata with owner info
        const { data: files, error: filesError } = await supabase
          .from("file_metadata")
          .select("id, bucket_id, storage_path, owner_user_id, original_filename, mime_type, file_size, upload_date, retention_days, retention_expires_at, access_count, last_accessed_at")
          .order("upload_date", { ascending: false })
          .limit(500);

        if (filesError) return jsonResponse(req, { error: "Could not load file metadata." }, 500);

        // Get storage settings
        const { data: settings } = await supabase
          .from("storage_settings")
          .select("allowed_mime_types, max_file_size_mb, default_retention_days")
          .limit(1)
          .maybeSingle();

        return jsonResponse(req, {
          buckets: (buckets ?? []).map((b: { id: string; name: string; public: boolean; created_at: string; updated_at: string }) => ({
            id: b.id,
            name: b.name,
            public: b.public,
            created_at: b.created_at,
            updated_at: b.updated_at,
          })),
          files: files ?? [],
          settings: settings ?? { allowed_mime_types: [], max_file_size_mb: 50, default_retention_days: 90 },
        });
      }
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.json();

      if (resource === "users") {
        if (!body.name || !body.email) return jsonResponse(req, { error: "Name and email are required." }, 400);
        const row: Record<string, unknown> = {
          name: String(body.name).slice(0, 200),
          email: String(body.email).slice(0, 200),
          role: typeof body.role === "string" ? body.role.slice(0, 50) : "Viewer",
          status: typeof body.status === "string" ? body.status.slice(0, 20) : "invited",
          mfa: Boolean(body.mfa),
          permissions: Array.isArray(body.permissions) ? body.permissions : [],
          owner_user_id: user.id,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
          created_by_admin_user_id: user.id,
        };
        const tempPassword = typeof body.password === "string" ? body.password : "";
        if (tempPassword) {
          if (tempPassword.length < 8) return jsonResponse(req, { error: "Password must be at least 8 characters." }, 400);
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: String(body.email).slice(0, 200),
            password: tempPassword,
            email_confirm: true,
          });
          if (authError) return jsonResponse(req, { error: authError.message || "Could not create auth account." }, 500);
          row.auth_user_id = authData.user.id;
          row.must_reset_password = true;
          row.status = "active";
          row.initial_password_changed = false;
        }
        const { data, error: insertError } = await supabase.from("users").insert(row).select("id").single();
        if (insertError) {
          if (row.auth_user_id) {
            await supabase.auth.admin.deleteUser(row.auth_user_id as string);
          }
          return jsonResponse(req, { error: "Could not create the user." }, 500);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "user.create", entity_type: "users", entity_id: data.id, metadata: { name: row.name, email: row.email, role: row.role, with_auth: !!tempPassword } });
        return jsonResponse(req, { id: data.id });
      }

      if (resource === "users-update") {
        if (!body.id) return jsonResponse(req, { error: "User ID is required." }, 400);
        const update: Record<string, unknown> = { updated_by_user_id: user.id };
        if (typeof body.name === "string") update.name = body.name.slice(0, 200);
        if (typeof body.email === "string") update.email = body.email.slice(0, 200);
        if (typeof body.role === "string") update.role = body.role.slice(0, 50);
        if (typeof body.status === "string") update.status = body.status.slice(0, 20);
        if (typeof body.mfa === "boolean") update.mfa = body.mfa;
        const { error: updateError } = await supabase.from("users").update(update).eq("id", body.id);
        if (updateError) return jsonResponse(req, { error: "Could not update the user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.update", entity_type: "users", entity_id: body.id, metadata: { fields: Object.keys(update) } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "users-delete") {
        if (!body.id) return jsonResponse(req, { error: "User ID is required." }, 400);
        const { error: deleteError } = await supabase.from("users").delete().eq("id", body.id);
        if (deleteError) return jsonResponse(req, { error: "Could not delete the user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.delete", entity_type: "users", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "role-assign") {
        if (!body.user_id || !body.role) return jsonResponse(req, { error: "User ID and role are required." }, 400);
        const role = String(body.role);
        if (!["admin", "manager", "standard_user", "read_only"].includes(role)) {
          return jsonResponse(req, { error: "Invalid role." }, 400);
        }
        const { error } = await supabase
          .from("app_roles")
          .upsert({ user_id: body.user_id, role }, { onConflict: "user_id" });
        if (error) return jsonResponse(req, { error: "Could not assign the role." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "role.assign", entity_type: "app_roles", entity_id: body.user_id, metadata: { role } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "manager-assign") {
        if (!body.manager_id || !body.managed_id) return jsonResponse(req, { error: "Manager and managed user IDs are required." }, 400);
        if (body.manager_id === body.managed_id) return jsonResponse(req, { error: "A user cannot manage themselves." }, 400);
        const { error } = await supabase
          .from("manager_relationships")
          .upsert({ manager_id: body.manager_id, managed_id: body.managed_id }, { onConflict: "manager_id,managed_id" });
        if (error) return jsonResponse(req, { error: "Could not assign the manager relationship." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "manager.assign", entity_type: "manager_relationships", metadata: { manager_id: body.manager_id, managed_id: body.managed_id } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "manager-remove") {
        if (!body.id) return jsonResponse(req, { error: "Relationship ID is required." }, 400);
        const { error } = await supabase.from("manager_relationships").delete().eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not remove the manager relationship." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "manager.remove", entity_type: "manager_relationships", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "permissions") {
        if (!body.capability || !body.role) return jsonResponse(req, { error: "Capability and role are required." }, 400);
        const accessLevel = typeof body.access_level === "string" ? body.access_level : "none";
        if (!["full", "admin", "write", "read", "none"].includes(accessLevel)) {
          return jsonResponse(req, { error: "Invalid access level." }, 400);
        }
        const existing = await supabase
          .from("role_permissions")
          .select("id")
          .eq("capability", body.capability)
          .eq("role", body.role)
          .maybeSingle();
        if (existing.data) {
          const { error } = await supabase
            .from("role_permissions")
            .update({ access_level: accessLevel, updated_by_user_id: user.id })
            .eq("id", existing.data.id);
          if (error) return jsonResponse(req, { error: "Could not update permission." }, 500);
        } else {
          const capIcon = typeof body.capability_icon === "string" ? body.capability_icon : "Cpu";
          const { error } = await supabase.from("role_permissions").insert({
            capability: String(body.capability).slice(0, 100),
            capability_icon: capIcon,
            role: String(body.role).slice(0, 50),
            access_level: accessLevel,
            owner_user_id: user.id,
            created_by_user_id: user.id,
            updated_by_user_id: user.id,
          });
          if (error) return jsonResponse(req, { error: "Could not set permission." }, 500);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.update", entity_type: "role_permissions", entity_id: existing.data?.id, metadata: { capability: body.capability, role: body.role, access_level: accessLevel } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "permissions-add-capability") {
        if (!body.capability) return jsonResponse(req, { error: "Capability name is required." }, 400);
        const capName = String(body.capability).slice(0, 100);
        const capIcon = typeof body.capability_icon === "string" ? body.capability_icon : "Cpu";
        const roleOptions = ["Administrator", "Operator", "Analyst", "Auditor", "Viewer"];
        const rows = roleOptions.map((role) => ({
          capability: capName,
          capability_icon: capIcon,
          role,
          access_level: "none",
          owner_user_id: user.id,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
        }));
        const { error } = await supabase.from("role_permissions").insert(rows);
        if (error) return jsonResponse(req, { error: "Could not add capability." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.add_capability", entity_type: "role_permissions", metadata: { capability: capName } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "permissions-delete-capability") {
        if (!body.capability) return jsonResponse(req, { error: "Capability name is required." }, 400);
        const { error } = await supabase.from("role_permissions").delete().eq("capability", body.capability);
        if (error) return jsonResponse(req, { error: "Could not delete capability." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.delete_capability", entity_type: "role_permissions", metadata: { capability: body.capability } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "org-create") {
        if (!body.name || !body.slug) return jsonResponse(req, { error: "Name and slug are required." }, 400);
        const { data, error } = await supabase.from("organizations").insert({
          name: String(body.name).slice(0, 200),
          slug: String(body.slug).slice(0, 100).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
          market_type: typeof body.market_type === "string" ? body.market_type.slice(0, 50) : "general",
          status: "active",
          owner_user_id: user.id,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
        }).select("id").single();
        if (error) return jsonResponse(req, { error: "Could not create organization." }, 500);
        // Add creator as owner
        await supabase.from("organization_memberships").insert({
          organization_id: data.id, user_id: user.id, role: "owner", status: "active",
        });
        await logAudit(supabase, { actor_user_id: user.id, action: "org.create", entity_type: "organizations", entity_id: data.id, metadata: { name: body.name, slug: body.slug } });
        return jsonResponse(req, { id: data.id });
      }

      if (resource === "membership-add") {
        if (!body.organization_id || !body.user_id || !body.role) return jsonResponse(req, { error: "Organization ID, user ID, and role are required." }, 400);
        const role = String(body.role);
        if (!["owner", "administrator", "manager", "member", "viewer"].includes(role)) return jsonResponse(req, { error: "Invalid role." }, 400);
        const { error } = await supabase.from("organization_memberships").upsert({
          organization_id: body.organization_id, user_id: body.user_id, role, status: "active",
        }, { onConflict: "organization_id,user_id" });
        if (error) return jsonResponse(req, { error: "Could not add member." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "membership.add", entity_type: "organization_memberships", metadata: { organization_id: body.organization_id, user_id: body.user_id, role } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "membership-remove") {
        if (!body.id) return jsonResponse(req, { error: "Membership ID is required." }, 400);
        const { error } = await supabase.from("organization_memberships").delete().eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not remove member." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "membership.remove", entity_type: "organization_memberships", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "ownership-transfer") {
        if (!body.table_name || !body.record_id || !body.new_owner_user_id) return jsonResponse(req, { error: "Table name, record ID, and new owner are required." }, 400);
        const { error } = await supabase.rpc("transfer_record_ownership", {
          p_table_name: String(body.table_name).slice(0, 100),
          p_record_id: body.record_id,
          p_new_owner_user_id: body.new_owner_user_id,
          p_new_ownership_type: typeof body.ownership_type === "string" ? body.ownership_type : "personal",
          p_new_organization_id: body.organization_id ?? null,
        });
        if (error) return jsonResponse(req, { error: "Could not transfer ownership." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "ownership.transfer_admin", entity_type: body.table_name, entity_id: body.record_id, metadata: { new_owner: body.new_owner_user_id } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "user-disable") {
        if (!body.id) return jsonResponse(req, { error: "User ID is required." }, 400);
        const { data: userRow } = await supabase.from("users").select("auth_user_id").eq("id", body.id).maybeSingle();
        const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "Admin action";
        const { error } = await supabase.from("users").update({
          status: "suspended", disabled: true, disabled_at: new Date().toISOString(),
          disabled_by_user_id: user.id, disabled_reason: reason, updated_by_user_id: user.id,
        }).eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not disable user." }, 500);
        if (userRow?.auth_user_id) {
          await supabase.rpc("revoke_user_sessions", { p_user_id: userRow.auth_user_id, p_reason: "disabled" });
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "user.disable", entity_type: "users", entity_id: body.id, metadata: { reason } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "user-enable") {
        if (!body.id) return jsonResponse(req, { error: "User ID is required." }, 400);
        const { error } = await supabase.from("users").update({
          status: "active", disabled: false, disabled_at: null, disabled_by_user_id: null, disabled_reason: null,
          locked_until: null, updated_by_user_id: user.id,
        }).eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not enable user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.enable", entity_type: "users", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "revoke-user-sessions") {
        if (!body.user_id) return jsonResponse(req, { error: "User ID is required." }, 400);
        await supabase.rpc("revoke_user_sessions", { p_user_id: body.user_id, p_reason: "admin" });
        await logAudit(supabase, { actor_user_id: user.id, action: "user.revoke_sessions", entity_type: "auth", entity_id: body.user_id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "emergency-stop-toggle") {
        if (!body.service) return jsonResponse(req, { error: "Service is required." }, 400);
        if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
          return jsonResponse(req, { error: "A reason is required to activate or restore emergency stop." }, 400);
        }
        const { data: sw } = await supabase.from("emergency_stop_switches").select("*").eq("service", body.service).maybeSingle();
        if (!sw) return jsonResponse(req, { error: "Unknown service switch." }, 404);
        const activate = body.activate !== false;
        if (activate) {
          await supabase.from("emergency_stop_switches").update({
            is_stopped: true, stopped_by: user.id, stopped_at: new Date().toISOString(),
            reason: body.reason, restored_by: null, restored_at: null, restored_reason: null,
            updated_at: new Date().toISOString(),
          }).eq("id", sw.id);
        } else {
          await supabase.from("emergency_stop_switches").update({
            is_stopped: false, restored_by: user.id, restored_at: new Date().toISOString(),
            restored_reason: body.reason, updated_at: new Date().toISOString(),
          }).eq("id", sw.id);
        }
        await supabase.from("emergency_stop_history").insert({
          service: body.service, action: activate ? "activate" : "restore",
          actor_user_id: user.id, reason: body.reason, occurred_at: new Date().toISOString(),
        });
        await logAudit(supabase, { actor_user_id: user.id, action: activate ? "emergency_stop.activate" : "emergency_stop.restore", entity_type: "emergency_stop", entity_id: body.service, metadata: { reason: body.reason } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "market-create") {
        if (!body.name || !body.slug) return jsonResponse(req, { error: "Name and slug are required." }, 400);
        const { data, error } = await supabase.from("markets").insert({
          name: String(body.name).slice(0, 200),
          slug: String(body.slug).slice(0, 100).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
          status: "active", owner_user_id: user.id, created_by_user_id: user.id, updated_by_user_id: user.id,
        }).select("id").single();
        if (error) return jsonResponse(req, { error: "Could not create market." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "market.create", entity_type: "markets", entity_id: data.id });
        return jsonResponse(req, { id: data.id });
      }

      if (resource === "connector-create") {
        if (!body.name || !Array.isArray(body.endpoints)) return jsonResponse(req, { error: "Name and endpoints array are required." }, 400);
        const { data, error } = await supabase.from("local_ai_connectors").insert({
          name: String(body.name).slice(0, 200),
          description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
          organization_id: body.organization_id ?? null,
          market_id: body.market_id ?? null,
          allowlisted_endpoints: body.endpoints,
          owner_user_id: user.id, created_by_user_id: user.id, updated_by_user_id: user.id,
          approved: false, review_date: body.review_date ?? null,
        }).select("id").single();
        if (error) return jsonResponse(req, { error: "Could not create connector." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "connector.create", entity_type: "local_ai_connectors", entity_id: data.id, metadata: { name: body.name } });
        return jsonResponse(req, { id: data.id });
      }

      if (resource === "connector-approve") {
        if (!body.id) return jsonResponse(req, { error: "Connector ID is required." }, 400);
        const { error } = await supabase.from("local_ai_connectors").update({
          approved: true, approved_by: user.id, approved_at: new Date().toISOString(),
        }).eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not approve connector." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "connector.approve", entity_type: "local_ai_connectors", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "connector-delete") {
        if (!body.id) return jsonResponse(req, { error: "Connector ID is required." }, 400);
        const { error } = await supabase.from("local_ai_connectors").delete().eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not delete connector." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "connector.delete", entity_type: "local_ai_connectors", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "legal-hold-place") {
        if (!body.entity_type || !body.entity_id || !body.reason) return jsonResponse(req, { error: "Entity type, entity ID, and reason are required." }, 400);
        const { data, error } = await supabase.from("legal_holds").insert({
          entity_type: String(body.entity_type).slice(0, 100), entity_id: body.entity_id,
          reason: String(body.reason).slice(0, 500), placed_by: user.id,
        }).select("id").single();
        if (error) return jsonResponse(req, { error: "Could not place legal hold." }, 500);
        if (body.entity_type === "documents") {
          await supabase.from("documents").update({ legal_hold: true, legal_hold_reason: body.reason, legal_hold_at: new Date().toISOString(), legal_hold_by: user.id }).eq("id", body.entity_id);
        } else if (body.entity_type === "knowledge_documents") {
          await supabase.from("knowledge_documents").update({ legal_hold: true, legal_hold_reason: body.reason, legal_hold_at: new Date().toISOString(), legal_hold_by: user.id }).eq("id", body.entity_id);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "legal_hold.place", entity_type: body.entity_type, entity_id: body.entity_id, metadata: { reason: body.reason } });
        return jsonResponse(req, { id: data.id });
      }

      if (resource === "legal-hold-release") {
        if (!body.id) return jsonResponse(req, { error: "Hold ID is required." }, 400);
        const { data: hold } = await supabase.from("legal_holds").select("entity_type, entity_id").eq("id", body.id).maybeSingle();
        if (!hold) return jsonResponse(req, { error: "Hold not found." }, 404);
        const releaseReason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "Released";
        const { error } = await supabase.from("legal_holds").update({
          released_at: new Date().toISOString(), released_by: user.id, release_reason: releaseReason,
        }).eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not release legal hold." }, 500);
        if (hold.entity_type === "documents") {
          await supabase.from("documents").update({ legal_hold: false, legal_hold_reason: null, legal_hold_at: null, legal_hold_by: null }).eq("id", hold.entity_id);
        } else if (hold.entity_type === "knowledge_documents") {
          await supabase.from("knowledge_documents").update({ legal_hold: false, legal_hold_reason: null, legal_hold_at: null, legal_hold_by: null }).eq("id", hold.entity_id);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "legal_hold.release", entity_type: hold.entity_type, entity_id: hold.entity_id, metadata: { reason: releaseReason } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "cross-market-transfer-approve") {
        if (!body.id) return jsonResponse(req, { error: "Transfer ID is required." }, 400);
        const { data: transfer } = await supabase.from("cross_market_transfers").select("*").eq("id", body.id).maybeSingle();
        if (!transfer) return jsonResponse(req, { error: "Transfer not found." }, 404);
        const { error } = await supabase.from("cross_market_transfers").update({
          status: "approved", approved_by: user.id, approved_at: new Date().toISOString(),
          approval_reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "",
        }).eq("id", body.id);
        if (error) return jsonResponse(req, { error: "Could not approve transfer." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "cross_market_transfer.approve", entity_type: "cross_market_transfers", entity_id: body.id });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "retention-policy-set") {
        if (!body.entity_type || typeof body.retention_days !== "number") return jsonResponse(req, { error: "Entity type and retention days are required." }, 400);
        const { error } = await supabase.from("retention_policies").upsert({
          entity_type: String(body.entity_type).slice(0, 100),
          organization_id: body.organization_id ?? null,
          market_id: body.market_id ?? null,
          retention_days: Math.min(Math.max(body.retention_days, 1), 36500),
        }, { onConflict: "entity_type,organization_id,market_id" });
        if (error) return jsonResponse(req, { error: "Could not set retention policy." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "retention_policy.set", entity_type: "retention_policies", metadata: { entity_type: body.entity_type, retention_days: body.retention_days } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "org-mfa-required") {
        if (!body.organization_id) return jsonResponse(req, { error: "Organization ID is required." }, 400);
        const { error } = await supabase.from("organizations").update({
          mfa_required: Boolean(body.mfa_required), updated_by_user_id: user.id, updated_at: new Date().toISOString(),
        }).eq("id", body.organization_id);
        if (error) return jsonResponse(req, { error: "Could not update MFA policy." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "org.mfa_policy", entity_type: "organizations", entity_id: body.organization_id, metadata: { mfa_required: body.mfa_required } });
        return jsonResponse(req, { ok: true });
      }

      if (resource === "oauth-config") {
        if (!body.provider || !body.client_id || !body.client_secret) {
          return jsonResponse(req, { error: "Provider, client ID, and client secret are required." }, 400);
        }
        const row: Record<string, unknown> = {
          provider: String(body.provider).slice(0, 50),
          client_id: String(body.client_id).slice(0, 500),
          client_secret: String(body.client_secret).slice(0, 500),
          enabled: true,
          owner_user_id: user.id,
          updated_by_user_id: user.id,
        };
        if (typeof body.auth_url === "string") row.auth_url = body.auth_url;
        if (typeof body.token_url === "string") row.token_url = body.token_url;
        if (typeof body.userinfo_url === "string") row.userinfo_url = body.userinfo_url;
        if (typeof body.scopes === "string") row.scopes = body.scopes;

        const existing = await supabase.from("oauth_configs").select("id").eq("provider", body.provider).maybeSingle();
        if (existing.data) {
          const { error } = await supabase.from("oauth_configs").update({ ...row, updated_by_user_id: user.id }).eq("id", existing.data.id);
          if (error) return jsonResponse(req, { error: "Could not update OAuth configuration." }, 500);
        } else {
          const { error } = await supabase.from("oauth_configs").insert({ ...row, created_by_user_id: user.id });
          if (error) return jsonResponse(req, { error: "Could not save OAuth configuration." }, 500);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "oauth_config.save", entity_type: "oauth_configs", metadata: { provider: body.provider } });
        return jsonResponse(req, { ok: true });
      }
    }

    return jsonResponse(req, { error: "Unknown resource or action." }, 400);
  } catch (err) {
    console.error("admin-api request failed", err);
    return jsonResponse(req, { error: "The request could not be completed." }, 500);
  }
});
