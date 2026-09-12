import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  if (!user) return { user: null, ok: false, response: jsonResponse({ error: "Unauthorized." }, 401) };
  const { data: roleRow } = await supabase
    .from("app_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!roleRow || roleRow.role !== "admin") {
    const reqUrl = new URL(req.url);
    await logAudit(supabase, { actor_user_id: user?.id ?? null, action: "admin_api.denied", outcome: "denied", metadata: { resource: reqUrl.searchParams.get("resource") ?? "" } });
    return { user, ok: false, response: jsonResponse({ error: "Administrator access required." }, 403) };
  }
  return { user, ok: true, response: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource") ?? "";

    // All resources require admin except role lookup (which any authenticated user can do for themselves)
    if (resource === "my-role") {
      const user = await getUser(req, supabase);
      if (!user) {
        await logAudit(supabase, { actor_user_id: null, action: "role_lookup.denied", outcome: "denied" });
        return jsonResponse({ error: "Unauthorized." }, 401);
      };
      const { data: roleRow } = await supabase
        .from("app_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      return jsonResponse({ role: roleRow?.role ?? "standard_user" });
    }

    const { user, ok, response } = await requireAdmin(req, supabase);
    if (!ok) return response;

    if (req.method === "GET") {
      if (resource === "users") {
        const { data, error } = await supabase
          .from("users")
          .select("id, name, email, role, status, mfa, permissions, oauth_provider, oauth_id, avatar_url, last_active, created_at, owner_user_id, auth_user_id, email_normalized, login_providers, last_login_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load users." }, 500);
        return jsonResponse({ users: data ?? [] });
      }

      if (resource === "organizations") {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug, description, market_type, status, owner_user_id, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load organizations." }, 500);
        return jsonResponse({ organizations: data ?? [] });
      }

      if (resource === "memberships") {
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("id, organization_id, user_id, role, status, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load memberships." }, 500);
        return jsonResponse({ memberships: data ?? [] });
      }

      if (resource === "roles") {
        const { data, error } = await supabase
          .from("app_roles")
          .select("user_id, role, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load roles." }, 500);
        return jsonResponse({ roles: data ?? [] });
      }

      if (resource === "permissions") {
        const { data, error } = await supabase
          .from("role_permissions")
          .select("id, capability, capability_icon, role, access_level")
          .order("capability");
        if (error) return jsonResponse({ error: "Could not load permissions." }, 500);
        return jsonResponse({ permissions: data ?? [] });
      }

      if (resource === "managers") {
        const { data, error } = await supabase
          .from("manager_relationships")
          .select("id, manager_id, managed_id, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load manager relationships." }, 500);
        return jsonResponse({ managers: data ?? [] });
      }

      if (resource === "oauth-configs") {
        const { data, error } = await supabase
          .from("oauth_configs")
          .select("id, provider, client_id, auth_url, token_url, userinfo_url, scopes, enabled, created_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: "Could not load OAuth configurations." }, 500);
        return jsonResponse({ configs: data ?? [] });
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
        if (error) return jsonResponse({ error: "Could not load audit logs." }, 500);
        return jsonResponse({ logs: data ?? [] });
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

        if (filesError) return jsonResponse({ error: "Could not load file metadata." }, 500);

        // Get storage settings
        const { data: settings } = await supabase
          .from("storage_settings")
          .select("allowed_mime_types, max_file_size_mb, default_retention_days")
          .limit(1)
          .maybeSingle();

        return jsonResponse({
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
        if (!body.name || !body.email) return jsonResponse({ error: "Name and email are required." }, 400);
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
        };
        const { data, error: insertError } = await supabase.from("users").insert(row).select("id").single();
        if (insertError) return jsonResponse({ error: "Could not create the user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.create", entity_type: "users", entity_id: data.id, metadata: { name: row.name, email: row.email, role: row.role } });
        return jsonResponse({ id: data.id });
      }

      if (resource === "users-update") {
        if (!body.id) return jsonResponse({ error: "User ID is required." }, 400);
        const update: Record<string, unknown> = { updated_by_user_id: user.id };
        if (typeof body.name === "string") update.name = body.name.slice(0, 200);
        if (typeof body.email === "string") update.email = body.email.slice(0, 200);
        if (typeof body.role === "string") update.role = body.role.slice(0, 50);
        if (typeof body.status === "string") update.status = body.status.slice(0, 20);
        if (typeof body.mfa === "boolean") update.mfa = body.mfa;
        const { error: updateError } = await supabase.from("users").update(update).eq("id", body.id);
        if (updateError) return jsonResponse({ error: "Could not update the user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.update", entity_type: "users", entity_id: body.id, metadata: { fields: Object.keys(update) } });
        return jsonResponse({ ok: true });
      }

      if (resource === "users-delete") {
        if (!body.id) return jsonResponse({ error: "User ID is required." }, 400);
        const { error: deleteError } = await supabase.from("users").delete().eq("id", body.id);
        if (deleteError) return jsonResponse({ error: "Could not delete the user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.delete", entity_type: "users", entity_id: body.id });
        return jsonResponse({ ok: true });
      }

      if (resource === "role-assign") {
        if (!body.user_id || !body.role) return jsonResponse({ error: "User ID and role are required." }, 400);
        const role = String(body.role);
        if (!["admin", "manager", "standard_user", "read_only"].includes(role)) {
          return jsonResponse({ error: "Invalid role." }, 400);
        }
        const { error } = await supabase
          .from("app_roles")
          .upsert({ user_id: body.user_id, role }, { onConflict: "user_id" });
        if (error) return jsonResponse({ error: "Could not assign the role." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "role.assign", entity_type: "app_roles", entity_id: body.user_id, metadata: { role } });
        return jsonResponse({ ok: true });
      }

      if (resource === "manager-assign") {
        if (!body.manager_id || !body.managed_id) return jsonResponse({ error: "Manager and managed user IDs are required." }, 400);
        if (body.manager_id === body.managed_id) return jsonResponse({ error: "A user cannot manage themselves." }, 400);
        const { error } = await supabase
          .from("manager_relationships")
          .upsert({ manager_id: body.manager_id, managed_id: body.managed_id }, { onConflict: "manager_id,managed_id" });
        if (error) return jsonResponse({ error: "Could not assign the manager relationship." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "manager.assign", entity_type: "manager_relationships", metadata: { manager_id: body.manager_id, managed_id: body.managed_id } });
        return jsonResponse({ ok: true });
      }

      if (resource === "manager-remove") {
        if (!body.id) return jsonResponse({ error: "Relationship ID is required." }, 400);
        const { error } = await supabase.from("manager_relationships").delete().eq("id", body.id);
        if (error) return jsonResponse({ error: "Could not remove the manager relationship." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "manager.remove", entity_type: "manager_relationships", entity_id: body.id });
        return jsonResponse({ ok: true });
      }

      if (resource === "permissions") {
        if (!body.capability || !body.role) return jsonResponse({ error: "Capability and role are required." }, 400);
        const accessLevel = typeof body.access_level === "string" ? body.access_level : "none";
        if (!["full", "admin", "write", "read", "none"].includes(accessLevel)) {
          return jsonResponse({ error: "Invalid access level." }, 400);
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
          if (error) return jsonResponse({ error: "Could not update permission." }, 500);
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
          if (error) return jsonResponse({ error: "Could not set permission." }, 500);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.update", entity_type: "role_permissions", entity_id: existing.data?.id, metadata: { capability: body.capability, role: body.role, access_level: accessLevel } });
        return jsonResponse({ ok: true });
      }

      if (resource === "permissions-add-capability") {
        if (!body.capability) return jsonResponse({ error: "Capability name is required." }, 400);
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
        if (error) return jsonResponse({ error: "Could not add capability." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.add_capability", entity_type: "role_permissions", metadata: { capability: capName } });
        return jsonResponse({ ok: true });
      }

      if (resource === "permissions-delete-capability") {
        if (!body.capability) return jsonResponse({ error: "Capability name is required." }, 400);
        const { error } = await supabase.from("role_permissions").delete().eq("capability", body.capability);
        if (error) return jsonResponse({ error: "Could not delete capability." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "permission.delete_capability", entity_type: "role_permissions", metadata: { capability: body.capability } });
        return jsonResponse({ ok: true });
      }

      if (resource === "org-create") {
        if (!body.name || !body.slug) return jsonResponse({ error: "Name and slug are required." }, 400);
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
        if (error) return jsonResponse({ error: "Could not create organization." }, 500);
        // Add creator as owner
        await supabase.from("organization_memberships").insert({
          organization_id: data.id, user_id: user.id, role: "owner", status: "active",
        });
        await logAudit(supabase, { actor_user_id: user.id, action: "org.create", entity_type: "organizations", entity_id: data.id, metadata: { name: body.name, slug: body.slug } });
        return jsonResponse({ id: data.id });
      }

      if (resource === "membership-add") {
        if (!body.organization_id || !body.user_id || !body.role) return jsonResponse({ error: "Organization ID, user ID, and role are required." }, 400);
        const role = String(body.role);
        if (!["owner", "administrator", "manager", "member", "viewer"].includes(role)) return jsonResponse({ error: "Invalid role." }, 400);
        const { error } = await supabase.from("organization_memberships").upsert({
          organization_id: body.organization_id, user_id: body.user_id, role, status: "active",
        }, { onConflict: "organization_id,user_id" });
        if (error) return jsonResponse({ error: "Could not add member." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "membership.add", entity_type: "organization_memberships", metadata: { organization_id: body.organization_id, user_id: body.user_id, role } });
        return jsonResponse({ ok: true });
      }

      if (resource === "membership-remove") {
        if (!body.id) return jsonResponse({ error: "Membership ID is required." }, 400);
        const { error } = await supabase.from("organization_memberships").delete().eq("id", body.id);
        if (error) return jsonResponse({ error: "Could not remove member." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "membership.remove", entity_type: "organization_memberships", entity_id: body.id });
        return jsonResponse({ ok: true });
      }

      if (resource === "ownership-transfer") {
        if (!body.table_name || !body.record_id || !body.new_owner_user_id) return jsonResponse({ error: "Table name, record ID, and new owner are required." }, 400);
        const { error } = await supabase.rpc("transfer_record_ownership", {
          p_table_name: String(body.table_name).slice(0, 100),
          p_record_id: body.record_id,
          p_new_owner_user_id: body.new_owner_user_id,
          p_new_ownership_type: typeof body.ownership_type === "string" ? body.ownership_type : "personal",
          p_new_organization_id: body.organization_id ?? null,
        });
        if (error) return jsonResponse({ error: "Could not transfer ownership." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "ownership.transfer_admin", entity_type: body.table_name, entity_id: body.record_id, metadata: { new_owner: body.new_owner_user_id } });
        return jsonResponse({ ok: true });
      }

      if (resource === "user-disable") {
        if (!body.id) return jsonResponse({ error: "User ID is required." }, 400);
        const { error } = await supabase.from("users").update({ status: "suspended", updated_by_user_id: user.id }).eq("id", body.id);
        if (error) return jsonResponse({ error: "Could not disable user." }, 500);
        await logAudit(supabase, { actor_user_id: user.id, action: "user.disable", entity_type: "users", entity_id: body.id });
        return jsonResponse({ ok: true });
      }

      if (resource === "oauth-config") {
        if (!body.provider || !body.client_id || !body.client_secret) {
          return jsonResponse({ error: "Provider, client ID, and client secret are required." }, 400);
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
          if (error) return jsonResponse({ error: "Could not update OAuth configuration." }, 500);
        } else {
          const { error } = await supabase.from("oauth_configs").insert({ ...row, created_by_user_id: user.id });
          if (error) return jsonResponse({ error: "Could not save OAuth configuration." }, 500);
        }
        await logAudit(supabase, { actor_user_id: user.id, action: "oauth_config.save", entity_type: "oauth_configs", metadata: { provider: body.provider } });
        return jsonResponse({ ok: true });
      }
    }

    return jsonResponse({ error: "Unknown resource or action." }, 400);
  } catch (err) {
    console.error("admin-api request failed", err);
    return jsonResponse({ error: "The request could not be completed." }, 500);
  }
});
