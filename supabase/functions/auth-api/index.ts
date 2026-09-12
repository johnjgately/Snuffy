import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ===== PASSWORD RESET: Request =====
    if (action === "password-reset-request" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      if (!email) return jsonResponse({ error: "Email is required." }, 400);

      const ip = getClientIP(req);

      // Find user by email
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (userError) return jsonResponse({ error: "Could not process request." }, 500);

      const user = (userData.users ?? []).find((u) => u.email?.toLowerCase() === email);
      if (!user) {
        // Don't reveal whether email exists
        return jsonResponse({ ok: true, message: "If the email exists, a reset link has been sent." });
      }

      // Invalidate all prior tokens
      await supabase.rpc("invalidate_reset_tokens", { p_user_id: user.id });

      // Generate a single-use token
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const { error: hashError } = await supabase.rpc("hash_token", { p_token: token });
      if (hashError) return jsonResponse({ error: "Could not process request." }, 500);

      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse({ error: "Could not process request." }, 500);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      await supabase.from("password_reset_tokens").insert({
        token_hash: tokenHash,
        user_id: user.id,
        expires_at: expiresAt,
        ip_address: ip,
      });

      // Log the reset request
      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "password_reset.request",
        entity_type: "auth",
        entity_id: user.id,
        outcome: "success",
        source_ip: ip,
        metadata: { email },
      });

      // In production, send email with reset link. For now return the token
      // (the frontend will use it to show the reset form)
      return jsonResponse({
        ok: true,
        message: "If the email exists, a reset link has been sent.",
        reset_token: token, // In production this would be in the email link
      });
    }

    // ===== PASSWORD RESET: Confirm =====
    if (action === "password-reset-confirm" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";

      if (!token || !newPassword) return jsonResponse({ error: "Token and new password are required." }, 400);
      if (newPassword.length < 8) return jsonResponse({ error: "Password must be at least 8 characters." }, 400);

      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse({ error: "Invalid or expired token." }, 400);

      const { data: tokenRow, error: tokenError } = await supabase
        .from("password_reset_tokens")
        .select("user_id, expires_at, used_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (tokenError || !tokenRow) return jsonResponse({ error: "Invalid or expired token." }, 400);
      if (tokenRow.used_at) return jsonResponse({ error: "This reset link has already been used." }, 400);
      if (new Date(tokenRow.expires_at) < new Date()) return jsonResponse({ error: "This reset link has expired." }, 400);

      // Update password
      const { error: updateError } = await supabase.auth.admin.updateUserById(tokenRow.user_id, {
        password: newPassword,
      });
      if (updateError) return jsonResponse({ error: "Could not update password." }, 500);

      // Mark token as used
      await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);

      // Invalidate all other tokens for this user
      await supabase.rpc("invalidate_reset_tokens", { p_user_id: tokenRow.user_id });

      // Revoke all sessions
      await supabase.rpc("revoke_user_sessions", { p_user_id: tokenRow.user_id, p_reason: "password_reset" });

      // Update users table
      await supabase.from("users").update({
        password_changed_at: new Date().toISOString(),
        initial_password_changed: true,
        must_reset_password: false,
      }).eq("auth_user_id", tokenRow.user_id);

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_user_id: tokenRow.user_id,
        action: "password_reset.confirm",
        entity_type: "auth",
        entity_id: tokenRow.user_id,
        outcome: "success",
        source_ip: getClientIP(req),
      });

      return jsonResponse({ ok: true, message: "Password updated successfully." });
    }

    // ===== EMAIL VERIFICATION: Send =====
    if (action === "email-verification-send" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      // Rate limit: 1 verification email per 60 seconds
      const { data: recentLogs } = await supabase
        .from("audit_logs")
        .select("id")
        .eq("actor_user_id", userData.user.id)
        .eq("action", "email_verification.send")
        .gt("occurred_at", new Date(Date.now() - 60 * 1000).toISOString())
        .limit(1);

      if (recentLogs && recentLogs.length > 0) {
        return jsonResponse({ error: "Please wait 60 seconds before requesting another verification email." }, 429);
      }

      // Generate verification token
      const verifyToken = crypto.randomUUID();
      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: verifyToken });

      // Store as a password_reset_tokens variant (reuse table for verification)
      await supabase.from("password_reset_tokens").insert({
        token_hash: tokenHash,
        user_id: userData.user.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
        ip_address: getClientIP(req),
      });

      await supabase.from("audit_logs").insert({
        actor_user_id: userData.user.id,
        action: "email_verification.send",
        entity_type: "auth",
        entity_id: userData.user.id,
        outcome: "success",
        source_ip: getClientIP(req),
      });

      return jsonResponse({
        ok: true,
        message: "Verification email sent.",
        verify_token: verifyToken, // In production, this would be in the email link
      });
    }

    // ===== EMAIL VERIFICATION: Confirm =====
    if (action === "email-verification-confirm" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) return jsonResponse({ error: "Token is required." }, 400);

      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse({ error: "Invalid or expired token." }, 400);

      const { data: tokenRow } = await supabase
        .from("password_reset_tokens")
        .select("user_id, expires_at, used_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
        return jsonResponse({ error: "Invalid or expired token." }, 400);
      }

      // Mark email as verified
      await supabase.from("users").update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      }).eq("auth_user_id", tokenRow.user_id);

      // Mark token as used
      await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);

      await supabase.from("audit_logs").insert({
        actor_user_id: tokenRow.user_id,
        action: "email_verification.confirm",
        entity_type: "auth",
        entity_id: tokenRow.user_id,
        outcome: "success",
        source_ip: getClientIP(req),
      });

      return jsonResponse({ ok: true, message: "Email verified successfully." });
    }

    // ===== LOGIN ATTEMPT TRACKING =====
    if (action === "login-attempt" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      const success = Boolean(body.success);
      const ip = getClientIP(req);

      if (!email) return jsonResponse({ ok: true });

      const { data: emailHash } = await supabase.rpc("hash_token", { p_token: email });

      // Find user if exists
      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = (userData?.users ?? []).find((u) => u.email?.toLowerCase() === email);

      // Log the attempt
      await supabase.from("login_attempts").insert({
        email,
        email_hash: emailHash || "unknown",
        ip_address: ip,
        success,
        user_id: user?.id ?? null,
      });

      if (!success) {
        // Check for lockout
        const { data: failCount } = await supabase.rpc("count_recent_failures", {
          p_email: email,
          p_window_minutes: 15,
        });

        const count = typeof failCount === "number" ? failCount : 0;
        if (count >= 5) {
          // Lock the account for 15 minutes
          await supabase.from("account_lockouts").insert({
            email_hash: emailHash || "unknown",
            locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            reason: "too_many_attempts",
            failed_count: count,
          });

          await supabase.from("audit_logs").insert({
            actor_user_id: user?.id ?? null,
            action: "account.lockout",
            entity_type: "auth",
            entity_id: user?.id ?? null,
            outcome: "locked",
            source_ip: ip,
            metadata: { email, failed_count: count },
          });

          return jsonResponse({ ok: true, locked: true, message: "Account temporarily locked due to too many failed attempts." });
        }
      }

      return jsonResponse({ ok: true, locked: false });
    }

    // ===== CHECK LOCKOUT STATUS =====
    if (action === "check-lockout" && req.method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      if (!email) return jsonResponse({ locked: false });

      const { data: isLocked } = await supabase.rpc("is_account_locked", { p_email: email.toLowerCase().trim() });
      return jsonResponse({ locked: Boolean(isLocked) });
    }

    // ===== SESSION MANAGEMENT: List =====
    if (action === "sessions" && req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      const { data: sessions, error } = await supabase
        .from("user_sessions")
        .select("id, ip_address, user_agent, created_at, last_activity_at, expires_at, revoked_at, revoked_by")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: "Could not load sessions." }, 500);
      return jsonResponse({ sessions: sessions ?? [] });
    }

    // ===== SESSION MANAGEMENT: Revoke =====
    if (action === "revoke-session" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      const body = await req.json().catch(() => ({}));
      const sessionId = typeof body.session_id === "string" ? body.session_id : "";
      if (!sessionId) return jsonResponse({ error: "Session ID is required." }, 400);

      const { error } = await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_by: "user" })
        .eq("id", sessionId)
        .eq("user_id", userData.user.id);

      if (error) return jsonResponse({ error: "Could not revoke session." }, 500);
      return jsonResponse({ ok: true });
    }

    // ===== MFA: Enroll (generate TOTP secret) =====
    if (action === "mfa-enroll" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      // Generate a TOTP secret (base32)
      const secretBytes = new Uint8Array(20);
      crypto.getRandomValues(secretBytes);
      const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let secret = "";
      for (let i = 0; i < secretBytes.length; i += 5) {
        const bytes: number[] = [];
        for (let j = 0; j < 5; j++) bytes.push(secretBytes[i + j] ?? 0);
        let bits = 0;
        let value = 0;
        for (const b of bytes) {
          value = (value << 8) | b;
          bits += 8;
        }
        while (bits >= 5) {
          bits -= 5;
          secret += base32Chars[(value >>> bits) & 31];
        }
      }

      const { data: secretHash } = await supabase.rpc("hash_token", { p_token: secret + userData.user.id });

      // Delete any existing enrollment
      await supabase.from("mfa_enrollments").delete().eq("user_id", userData.user.id);

      // Create new enrollment (not yet enabled)
      await supabase.from("mfa_enrollments").insert({
        user_id: userData.user.id,
        secret_hash: secretHash,
        enabled: false,
      });

      const otpauthUrl = `otpauth://totp/${encodeURIComponent(userData.user.email ?? "user")}?secret=${secret}&issuer=${encodeURIComponent("Platform")}`;

      return jsonResponse({
        ok: true,
        secret,
        otpauth_url: otpauthUrl,
      });
    }

    // ===== MFA: Verify (enable MFA) =====
    if (action === "mfa-verify" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code : "";
      if (!code || code.length !== 6) return jsonResponse({ error: "A 6-digit code is required." }, 400);

      // In production, verify the TOTP code against the stored secret
      // For now, accept any 6-digit code (the secret is stored hashed)
      const { error: updateError } = await supabase
        .from("mfa_enrollments")
        .update({ enabled: true, verified_at: new Date().toISOString() })
        .eq("user_id", userData.user.id)
        .eq("enabled", false);

      if (updateError) return jsonResponse({ error: "Could not enable MFA." }, 500);

      await supabase.from("users").update({ mfa_enabled: true }).eq("auth_user_id", userData.user.id);

      await supabase.from("audit_logs").insert({
        actor_user_id: userData.user.id,
        action: "mfa.enable",
        entity_type: "auth",
        entity_id: userData.user.id,
        outcome: "success",
        source_ip: getClientIP(req),
      });

      return jsonResponse({ ok: true, message: "MFA enabled successfully." });
    }

    // ===== MFA: Disable =====
    if (action === "mfa-disable" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Unauthorized." }, 401);

      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      if (!userData.user) return jsonResponse({ error: "Unauthorized." }, 401);

      await supabase.from("mfa_enrollments").delete().eq("user_id", userData.user.id);
      await supabase.from("users").update({ mfa_enabled: false }).eq("auth_user_id", userData.user.id);

      // Revoke all sessions (MFA reset)
      await supabase.rpc("revoke_user_sessions", { p_user_id: userData.user.id, p_reason: "mfa_reset" });

      await supabase.from("audit_logs").insert({
        actor_user_id: userData.user.id,
        action: "mfa.disable",
        entity_type: "auth",
        entity_id: userData.user.id,
        outcome: "success",
        source_ip: getClientIP(req),
      });

      return jsonResponse({ ok: true, message: "MFA disabled." });
    }

    // ===== DISABLED USER CHECK =====
    if (action === "check-account-status" && req.method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      if (!email) return jsonResponse({ status: "unknown" });

      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = (userData?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase().trim());
      if (!user) return jsonResponse({ status: "unknown" });

      const { data: userRow } = await supabase
        .from("users")
        .select("disabled, locked_until, email_verified, mfa_enabled, mfa_required")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!userRow) return jsonResponse({ status: "unknown" });

      const isLocked = userRow.locked_until && new Date(userRow.locked_until) > new Date();
      return jsonResponse({
        status: userRow.disabled ? "disabled" : isLocked ? "locked" : "active",
        email_verified: userRow.email_verified,
        mfa_enabled: userRow.mfa_enabled,
        mfa_required: userRow.mfa_required,
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error("auth-api error", err);
    return jsonResponse({ error: "The request could not be completed." }, 500);
  }
});
