import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// --- TOTP verification (RFC 6238) using Web Crypto ---
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(secret: string): Uint8Array {
  const cleaned = secret.replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of cleaned) {
    const val = BASE32_CHARS.indexOf(c);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bits += 5;
    while (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(sig);
}

async function generateTotp(secret: string, counter: number, period = 30): Promise<string> {
  const key = base32Decode(secret);
  const counterBytes = new Uint8Array(8);
  let ts = Math.floor(counter / period);
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  const hmac = await hmacSha1(key, counterBytes);
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, "0");
}

async function verifyTotp(token: string, secret: string, period = 30, window = 1): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const counter = (now + i * period) * period;
    const expected = await generateTotp(secret, counter, period);
    if (token === expected) return true;
  }
  return false;
}

function totpKeyuri(email: string, issuer: string, secret: string): string {
  const label = encodeURIComponent(issuer + ":" + email);
  const params = new URLSearchParams({ secret, issuer });
  return "otpauth://totp/" + label + "?" + params.toString();
}

// --- SHA-256 hashing for recovery codes ---
async function hashRecoveryCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Production CORS ---
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

function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function rateLimitResponse(req: Request, retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later.", retry_after: retryAfter }), {
    status: 429,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

function getClientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

// --- AES-256-GCM encryption for TOTP secrets ---
async function encryptSecret(plaintext: string): Promise<string> {
  const keyHex = Deno.env.get("MFA_ENCRYPTION_KEY") ?? "";
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY not configured (expected 64-char hex for 256-bit key).");
  }
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptSecret(encrypted: string): Promise<string> {
  const keyHex = Deno.env.get("MFA_ENCRYPTION_KEY") ?? "";
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY not configured.");
  }
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
  return new TextDecoder().decode(decrypted);
}

// --- Rate limiting ---
async function checkRate(supabase: ReturnType<typeof createClient>, endpoint: string, scope: string, identifier: string, roleTier: string, ip: string, userId: string | null): Promise<{ allowed: boolean; retryAfter: number }> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_endpoint: endpoint,
    p_scope: scope,
    p_identifier: identifier,
    p_role_tier: roleTier,
    p_ip: ip,
    p_user_id: userId ?? null,
  });
  if (error || !data) return { allowed: true, retryAfter: 0 };
  const result = data as { allowed: boolean; retry_after: number };
  return { allowed: result.allowed, retryAfter: result.retry_after ?? 0 };
}

// --- Auth helpers ---
async function verifyUser(req: Request, supabase: ReturnType<typeof createClient>): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await userClient.auth.getUser(token);
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

async function logMfaEvent(supabase: ReturnType<typeof createClient>, userId: string, eventType: string, outcome: string, ip: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await supabase.from("mfa_audit_events").insert({
    user_id: userId,
    event_type: eventType,
    outcome,
    ip_address: ip,
    metadata,
  });
}

// --- Base32 secret generation ---
function generateBase32Secret(length = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let secret = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      secret += BASE32_CHARS[(buffer >>> bits) & 31];
    }
  }
  return secret;
}

// --- Recovery code generation ---
function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    codes.push(hex.slice(0, 4) + "-" + hex.slice(4, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16));
  }
  return codes;
}

// --- Email delivery ---
async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const emailProvider = Deno.env.get("EMAIL_PROVIDER") ?? "";
  const emailApiKey = Deno.env.get("EMAIL_API_KEY") ?? "";
  const fromEmail = Deno.env.get("EMAIL_FROM") ?? "noreply@platform.local";
  const devMode = Deno.env.get("EMAIL_DEV_MODE") === "true" && !isProduction;

  if (devMode) {
    console.log("[DEV EMAIL] To: " + to + ", Subject: " + subject);
    return true;
  }

  if (!emailProvider || !emailApiKey) {
    console.error("Email provider not configured. Set EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM secrets.");
    return false;
  }

  try {
    const resp = await fetch(emailProvider, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + emailApiKey,
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html: body }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// --- Main handler ---
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: getCorsHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const ip = getClientIP(req);

    // ===== PASSWORD RESET: Request =====
    if (action === "password-reset-request" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      if (!email) return jsonResponse(req, { error: "Email is required." }, 400);

      const rlUser = await checkRate(supabase, "password-reset", "user", email, "standard", ip, null);
      if (!rlUser.allowed) return rateLimitResponse(req, rlUser.retryAfter);
      const rlIP = await checkRate(supabase, "password-reset", "ip", ip, "anonymous", ip, null);
      if (!rlIP.allowed) return rateLimitResponse(req, rlIP.retryAfter);

      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = (userData?.users ?? []).find((u) => u.email?.toLowerCase() === email);

      const genericOk = jsonResponse(req, { ok: true, message: "If the email exists, a reset link has been sent." });
      if (!user) return genericOk;

      await supabase.rpc("invalidate_reset_tokens", { p_user_id: user.id });

      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse(req, { error: "Could not process request." }, 500);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await supabase.from("password_reset_tokens").insert({
        token_hash: tokenHash,
        user_id: user.id,
        expires_at: expiresAt,
        ip_address: ip,
      });

      const appUrl = Deno.env.get("APP_URL") ?? "";
      const resetLink = appUrl ? appUrl + "/reset-password?token=" + token : "";

      await sendEmail(
        user.email ?? email,
        "Password Reset Request",
        '<p>A password reset was requested for your account.</p><p><a href="' + resetLink + '">Click here to reset your password</a></p><p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>',
      );

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "password_reset.request",
        entity_type: "auth",
        entity_id: user.id,
        outcome: "success",
        source_ip: ip,
        metadata: { email },
      });

      return genericOk;
    }

    // ===== PASSWORD RESET: Confirm =====
    if (action === "password-reset-confirm" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";

      if (!token || !newPassword) return jsonResponse(req, { error: "Token and new password are required." }, 400);
      if (newPassword.length < 8) return jsonResponse(req, { error: "Password must be at least 8 characters." }, 400);

      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse(req, { error: "Invalid or expired token." }, 400);

      const { data: tokenRow } = await supabase
        .from("password_reset_tokens")
        .select("user_id, expires_at, used_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
        return jsonResponse(req, { error: "Invalid or expired token." }, 400);
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(tokenRow.user_id, { password: newPassword });
      if (updateError) return jsonResponse(req, { error: "Could not update password." }, 500);

      await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);
      await supabase.rpc("invalidate_reset_tokens", { p_user_id: tokenRow.user_id });
      await supabase.rpc("revoke_user_sessions", { p_user_id: tokenRow.user_id, p_reason: "password_reset" });

      await supabase.from("users").update({
        password_changed_at: new Date().toISOString(),
        initial_password_changed: true,
        must_reset_password: false,
      }).eq("auth_user_id", tokenRow.user_id);

      await supabase.from("audit_logs").insert({
        actor_user_id: tokenRow.user_id,
        action: "password_reset.confirm",
        entity_type: "auth",
        entity_id: tokenRow.user_id,
        outcome: "success",
        source_ip: ip,
      });

      return jsonResponse(req, { ok: true, message: "Password updated successfully." });
    }

    // ===== EMAIL VERIFICATION: Send =====
    if (action === "email-verification-send" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const rl = await checkRate(supabase, "email-verification", "user", user.id, "standard", ip, user.id);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

      const verifyToken = crypto.randomUUID();
      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: verifyToken });

      await supabase.from("password_reset_tokens").insert({
        token_hash: tokenHash,
        user_id: user.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ip_address: ip,
      });

      const appUrl = Deno.env.get("APP_URL") ?? "";
      const verifyLink = appUrl ? appUrl + "/verify-email?token=" + verifyToken : "";

      await sendEmail(
        user.email,
        "Email Verification",
        '<p>Please verify your email address.</p><p><a href="' + verifyLink + '">Click here to verify</a></p><p>This link expires in 24 hours.</p>',
      );

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "email_verification.send",
        entity_type: "auth",
        entity_id: user.id,
        outcome: "success",
        source_ip: ip,
      });

      return jsonResponse(req, { ok: true, message: "Verification email sent." });
    }

    // ===== EMAIL VERIFICATION: Confirm =====
    if (action === "email-verification-confirm" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) return jsonResponse(req, { error: "Token is required." }, 400);

      const { data: tokenHash } = await supabase.rpc("hash_token", { p_token: token });
      if (!tokenHash) return jsonResponse(req, { error: "Invalid or expired token." }, 400);

      const { data: tokenRow } = await supabase
        .from("password_reset_tokens")
        .select("user_id, expires_at, used_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
        return jsonResponse(req, { error: "Invalid or expired token." }, 400);
      }

      await supabase.from("users").update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      }).eq("auth_user_id", tokenRow.user_id);

      await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash);

      await supabase.from("audit_logs").insert({
        actor_user_id: tokenRow.user_id,
        action: "email_verification.confirm",
        entity_type: "auth",
        entity_id: tokenRow.user_id,
        outcome: "success",
        source_ip: ip,
      });

      return jsonResponse(req, { ok: true, message: "Email verified successfully." });
    }

    // ===== LOGIN ATTEMPT TRACKING =====
    if (action === "login-attempt" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      const success = Boolean(body.success);

      if (!email) return jsonResponse(req, { ok: true });

      const rl = await checkRate(supabase, "auth-signin", "user", email, "anonymous", ip, null);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

      const { data: emailHash } = await supabase.rpc("hash_token", { p_token: email });

      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = (userData?.users ?? []).find((u) => u.email?.toLowerCase() === email);

      await supabase.from("login_attempts").insert({
        email,
        email_hash: emailHash || "unknown",
        ip_address: ip,
        success,
        user_id: user?.id ?? null,
      });

      if (!success) {
        const { data: failCount } = await supabase.rpc("count_recent_failures", {
          p_email: email,
          p_window_minutes: 15,
        });

        const count = typeof failCount === "number" ? failCount : 0;
        if (count >= 5) {
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

          return jsonResponse(req, { ok: true, locked: true, message: "Account temporarily locked due to too many failed attempts." });
        }
      }

      return jsonResponse(req, { ok: true, locked: false });
    }

    // ===== CHECK LOCKOUT STATUS =====
    if (action === "check-lockout" && req.method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      if (!email) return jsonResponse(req, { locked: false });

      const { data: isLocked } = await supabase.rpc("is_account_locked", { p_email: email.toLowerCase().trim() });
      return jsonResponse(req, { locked: Boolean(isLocked) });
    }

    // ===== SESSION MANAGEMENT: List =====
    if (action === "sessions" && req.method === "GET") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const { data: sessions, error } = await supabase
        .from("user_sessions")
        .select("id, ip_address, user_agent, created_at, last_activity_at, expires_at, revoked_at, revoked_by")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse(req, { error: "Could not load sessions." }, 500);
      return jsonResponse(req, { sessions: sessions ?? [] });
    }

    // ===== SESSION MANAGEMENT: Revoke =====
    if (action === "revoke-session" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const body = await req.json().catch(() => ({}));
      const sessionId = typeof body.session_id === "string" ? body.session_id : "";
      if (!sessionId) return jsonResponse(req, { error: "Session ID is required." }, 400);

      const { error } = await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString(), revoked_by: "user" })
        .eq("id", sessionId)
        .eq("user_id", user.id);

      if (error) return jsonResponse(req, { error: "Could not revoke session." }, 500);
      return jsonResponse(req, { ok: true });
    }

    // ===== MFA: Enroll =====
    if (action === "mfa-enroll" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const rl = await checkRate(supabase, "mfa-verify", "user", user.id, "standard", ip, user.id);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

      const secret = generateBase32Secret(20);

      let encryptedSecret: string;
      try {
        encryptedSecret = await encryptSecret(secret);
      } catch {
        return jsonResponse(req, { error: "MFA encryption key not configured. Set the MFA_ENCRYPTION_KEY secret." }, 500);
      }

      await supabase.from("mfa_enrollments").delete().eq("user_id", user.id);
      await supabase.from("mfa_enrollments").insert({
        user_id: user.id,
        secret_encrypted: encryptedSecret,
        enabled: false,
      });

      await logMfaEvent(supabase, user.id, "enrollment_started", "info", ip);

      const otpauthUrl = totpKeyuri(user.email, "Snuffy AI Platform", secret);

      return jsonResponse(req, {
        ok: true,
        secret,
        otpauth_url: otpauthUrl,
        message: "Enter the 6-digit code from your authenticator app to complete enrollment.",
      });
    }

    // ===== MFA: Verify (enable MFA with real TOTP) =====
    if (action === "mfa-verify" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const rl = await checkRate(supabase, "mfa-verify", "user", user.id, "standard", ip, user.id);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code || !/^\d{6}$/.test(code)) {
        return jsonResponse(req, { error: "A 6-digit code is required." }, 400);
      }

      const { data: enrollment } = await supabase
        .from("mfa_enrollments")
        .select("id, secret_encrypted, enabled, failed_attempts, locked_until")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!enrollment) return jsonResponse(req, { error: "No MFA enrollment found. Please enroll first." }, 400);
      if (enrollment.enabled) return jsonResponse(req, { error: "MFA is already enabled." }, 400);

      if (enrollment.locked_until && new Date(enrollment.locked_until) > new Date()) {
        return jsonResponse(req, { error: "MFA verification is temporarily locked. Please try again later." }, 423);
      }

      let secret: string;
      try {
        secret = await decryptSecret(enrollment.secret_encrypted);
      } catch {
        return jsonResponse(req, { error: "Could not verify MFA. Please re-enroll." }, 500);
      }

      const isValid = await verifyTotp(code, secret);

      if (!isValid) {
        const newFailedAttempts = (enrollment.failed_attempts ?? 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        await supabase.from("mfa_enrollments").update({
          failed_attempts: newFailedAttempts,
          locked_until: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
        }).eq("id", enrollment.id);

        await logMfaEvent(supabase, user.id, "verification_failure", "failure", ip, { failed_attempts: newFailedAttempts });

        if (shouldLock) {
          await logMfaEvent(supabase, user.id, "mfa_lockout", "failure", ip, { failed_attempts: newFailedAttempts });
          await supabase.from("audit_logs").insert({
            actor_user_id: user.id,
            action: "mfa.lockout",
            entity_type: "auth",
            entity_id: user.id,
            outcome: "locked",
            source_ip: ip,
            metadata: { failed_attempts: newFailedAttempts },
          });
          return jsonResponse(req, { error: "MFA locked due to too many failed attempts. Try again in 15 minutes." }, 423);
        }

        return jsonResponse(req, { error: "Invalid verification code. Please try again.", failed_attempts: newFailedAttempts }, 400);
      }

      const recoveryCodes = generateRecoveryCodes(10);
      const hashedRecoveryCodes = await Promise.all(recoveryCodes.map((c) => hashRecoveryCode(c)));

      for (const hash of hashedRecoveryCodes) {
        await supabase.from("mfa_recovery_codes").insert({
          user_id: user.id,
          code_hash: hash,
        });
      }

      await supabase.from("mfa_enrollments").update({
        enabled: true,
        verified_at: new Date().toISOString(),
        enrolled_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      }).eq("id", enrollment.id);

      await supabase.from("users").update({ mfa_enabled: true }).eq("auth_user_id", user.id);

      await logMfaEvent(supabase, user.id, "enrollment_completed", "success", ip);

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "mfa.enable",
        entity_type: "auth",
        entity_id: user.id,
        outcome: "success",
        source_ip: ip,
      });

      return jsonResponse(req, {
        ok: true,
        message: "MFA enabled successfully. Save your recovery codes - they can only be shown once.",
        recovery_codes: recoveryCodes,
      });
    }

    // ===== MFA: Challenge (verify TOTP for sign-in) =====
    if (action === "mfa-challenge" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const rl = await checkRate(supabase, "mfa-verify", "user", user.id, "standard", ip, user.id);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);

      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const recoveryCode = typeof body.recovery_code === "string" ? body.recovery_code.trim() : "";

      const { data: enrollment } = await supabase
        .from("mfa_enrollments")
        .select("id, secret_encrypted, enabled, failed_attempts, locked_until")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!enrollment || !enrollment.enabled) {
        return jsonResponse(req, { error: "MFA is not enabled for this account." }, 400);
      }

      if (enrollment.locked_until && new Date(enrollment.locked_until) > new Date()) {
        return jsonResponse(req, { error: "MFA is temporarily locked. Please try again later." }, 423);
      }

      if (recoveryCode) {
        const { data: consumed } = await supabase.rpc("consume_mfa_recovery_code", {
          p_user_id: user.id,
          p_code: recoveryCode,
        });

        if (consumed) {
          await logMfaEvent(supabase, user.id, "recovery_code_used", "success", ip);
          await supabase.from("mfa_enrollments").update({ failed_attempts: 0, locked_until: null, last_verified_at: new Date().toISOString() }).eq("id", enrollment.id);
          return jsonResponse(req, { ok: true, message: "MFA verified via recovery code." });
        }

        await logMfaEvent(supabase, user.id, "recovery_code_failed", "failure", ip);
        return jsonResponse(req, { error: "Invalid recovery code." }, 400);
      }

      if (!code || !/^\d{6}$/.test(code)) {
        return jsonResponse(req, { error: "A 6-digit code is required." }, 400);
      }

      let secret: string;
      try {
        secret = await decryptSecret(enrollment.secret_encrypted);
      } catch {
        return jsonResponse(req, { error: "Could not verify MFA." }, 500);
      }

      const isValid = await verifyTotp(code, secret);

      if (!isValid) {
        const newFailedAttempts = (enrollment.failed_attempts ?? 0) + 1;
        const shouldLock = newFailedAttempts >= 5;
        await supabase.from("mfa_enrollments").update({
          failed_attempts: newFailedAttempts,
          locked_until: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
        }).eq("id", enrollment.id);

        await logMfaEvent(supabase, user.id, "verification_failure", "failure", ip, { failed_attempts: newFailedAttempts });

        if (shouldLock) {
          await logMfaEvent(supabase, user.id, "mfa_lockout", "failure", ip, { failed_attempts: newFailedAttempts });
          return jsonResponse(req, { error: "MFA locked due to too many failed attempts." }, 423);
        }

        return jsonResponse(req, { error: "Invalid verification code.", failed_attempts: newFailedAttempts }, 400);
      }

      await supabase.from("mfa_enrollments").update({
        failed_attempts: 0,
        locked_until: null,
        last_verified_at: new Date().toISOString(),
      }).eq("id", enrollment.id);

      await logMfaEvent(supabase, user.id, "verification_success", "success", ip);

      return jsonResponse(req, { ok: true, message: "MFA verified." });
    }

    // ===== MFA: Step-up challenge request =====
    if (action === "mfa-step-up-request" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const body = await req.json().catch(() => ({}));
      const reason = typeof body.reason === "string" ? body.reason : "sensitive_action";
      if (reason.length > 200) return jsonResponse(req, { error: "Reason too long." }, 400);

      const { data: challengeId } = await supabase.rpc("create_mfa_step_up_challenge", {
        p_user_id: user.id,
        p_reason: reason,
        p_ip: ip,
      });

      if (!challengeId) return jsonResponse(req, { error: "Could not create step-up challenge." }, 500);

      await logMfaEvent(supabase, user.id, "step_up_requested", "info", ip, { reason, challenge_id: challengeId });

      return jsonResponse(req, { ok: true, challenge_id: challengeId, expires_in: 300 });
    }

    // ===== MFA: Step-up verify =====
    if (action === "mfa-step-up-verify" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const body = await req.json().catch(() => ({}));
      const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
      const code = typeof body.code === "string" ? body.code.trim() : "";

      if (!challengeId || !code || !/^\d{6}$/.test(code)) {
        return jsonResponse(req, { error: "Challenge ID and 6-digit code are required." }, 400);
      }

      const { data: enrollment } = await supabase
        .from("mfa_enrollments")
        .select("secret_encrypted, enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!enrollment || !enrollment.enabled) {
        return jsonResponse(req, { error: "MFA is not enabled." }, 400);
      }

      let secret: string;
      try {
        secret = await decryptSecret(enrollment.secret_encrypted);
      } catch {
        return jsonResponse(req, { error: "Could not verify MFA." }, 500);
      }

      const isValid = await verifyTotp(code, secret);
      if (!isValid) {
        await logMfaEvent(supabase, user.id, "step_up_failed", "failure", ip, { challenge_id: challengeId });
        return jsonResponse(req, { error: "Invalid verification code." }, 400);
      }

      const { data: verified } = await supabase.rpc("verify_mfa_step_up_challenge", {
        p_challenge_id: challengeId,
        p_user_id: user.id,
      });

      if (!verified) {
        await logMfaEvent(supabase, user.id, "step_up_failed", "failure", ip, { challenge_id: challengeId });
        return jsonResponse(req, { error: "Challenge expired or invalid." }, 400);
      }

      await logMfaEvent(supabase, user.id, "step_up_verified", "success", ip, { challenge_id: challengeId });

      return jsonResponse(req, { ok: true, message: "Step-up verified." });
    }

    // ===== MFA: Check step-up status =====
    if (action === "mfa-step-up-check" && req.method === "GET") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const maxAge = parseInt(url.searchParams.get("max_age") ?? "300", 10);
      const { data: hasStepUp } = await supabase.rpc("check_mfa_step_up", {
        p_user_id: user.id,
        p_max_age_seconds: maxAge,
      });

      return jsonResponse(req, { step_up_verified: Boolean(hasStepUp) });
    }

    // ===== MFA: Disable (requires step-up) =====
    if (action === "mfa-disable" && req.method === "POST") {
      const user = await verifyUser(req, supabase);
      if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

      const { data: hasStepUp } = await supabase.rpc("check_mfa_step_up", {
        p_user_id: user.id,
        p_max_age_seconds: 300,
      });

      if (!hasStepUp) {
        return jsonResponse(req, { error: "MFA step-up verification required to disable MFA. Please verify a TOTP code first.", step_up_required: true }, 403);
      }

      await supabase.from("mfa_enrollments").delete().eq("user_id", user.id);
      await supabase.from("mfa_recovery_codes").delete().eq("user_id", user.id);
      await supabase.from("users").update({ mfa_enabled: false }).eq("auth_user_id", user.id);

      await supabase.rpc("revoke_user_sessions", { p_user_id: user.id, p_reason: "mfa_reset" });

      await logMfaEvent(supabase, user.id, "mfa_disabled", "success", ip);

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "mfa.disable",
        entity_type: "auth",
        entity_id: user.id,
        outcome: "success",
        source_ip: ip,
      });

      return jsonResponse(req, { ok: true, message: "MFA disabled." });
    }

    // ===== CHECK ACCOUNT STATUS =====
    if (action === "check-account-status" && req.method === "GET") {
      const email = url.searchParams.get("email") ?? "";
      if (!email) return jsonResponse(req, { status: "unknown" });

      const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = (userData?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase().trim());
      if (!user) return jsonResponse(req, { status: "unknown" });

      const { data: userRow } = await supabase
        .from("users")
        .select("disabled, locked_until, email_verified, mfa_enabled, mfa_required")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!userRow) return jsonResponse(req, { status: "unknown" });

      const isLocked = userRow.locked_until && new Date(userRow.locked_until) > new Date();
      return jsonResponse(req, {
        status: userRow.disabled ? "disabled" : isLocked ? "locked" : "active",
        email_verified: userRow.email_verified,
        mfa_enabled: userRow.mfa_enabled,
        mfa_required: userRow.mfa_required,
      });
    }

    return jsonResponse(req, { error: "Unknown action." }, 400);
  } catch (err) {
    console.error("auth-api error", err);
    return jsonResponse(req, { error: "The request could not be completed." }, 500);
  }
});
