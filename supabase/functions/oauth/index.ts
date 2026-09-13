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

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getUser(req: Request, supabase: ReturnType<typeof createClient>) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const { data } = await supabase.auth.getUser(header.slice(7));
  return data.user ?? null;
}

function validateProviderUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Invalid OAuth provider configuration.");
  }
  const host = url.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"].includes(host)) {
    throw new Error("Invalid OAuth provider configuration.");
  }
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
    const user = await getUser(req, supabase);
    if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

    const url = new URL(req.url);
    const urlAction = url.searchParams.get("action");

    if (urlAction === "authorize") {
      const provider = url.searchParams.get("provider");
      if (!provider || provider.length > 50) return jsonResponse(req, { error: "Provider is required." }, 400);

      const { data: config, error: configError } = await supabase
        .from("oauth_configs")
        .select("provider, client_id, auth_url, scopes")
        .eq("provider", provider)
        .eq("enabled", true)
        .maybeSingle();
      if (configError || !config) return jsonResponse(req, { error: "OAuth provider is not configured or not enabled." }, 404);

      validateProviderUrl(config.auth_url);
      const state = crypto.randomUUID();
      const { error: stateError } = await supabase.from("oauth_states").insert({
        state,
        provider,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (stateError) return jsonResponse(req, { error: "Could not start OAuth authorization." }, 500);

      const redirectUri = url.origin + "/oauth/callback";
      const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes,
        state,
      });
      return jsonResponse(req, { authUrl: `${config.auth_url}?${params.toString()}`, state });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (body.action !== "callback") return jsonResponse(req, { error: "Unknown action." }, 400);

      const provider = typeof body.provider === "string" ? body.provider : "";
      const code = typeof body.code === "string" ? body.code : "";
      const state = typeof body.state === "string" ? body.state : "";
      if (!provider || !code || !state || code.length > 2000 || state.length > 100) {
        return jsonResponse(req, { error: "Invalid OAuth callback." }, 400);
      }

      const { data: stateRow } = await supabase
        .from("oauth_states")
        .select("id")
        .eq("state", state)
        .eq("provider", provider)
        .eq("user_id", user.id)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!stateRow) return jsonResponse(req, { error: "OAuth state is invalid or expired." }, 400);

      const { data: claimedState } = await supabase
        .from("oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("id", stateRow.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (!claimedState) return jsonResponse(req, { error: "OAuth state is invalid or already used." }, 400);

      const { data: config, error: configError } = await supabase
        .from("oauth_configs")
        .select("provider, client_id, client_secret, token_url, userinfo_url")
        .eq("provider", provider)
        .eq("enabled", true)
        .maybeSingle();
      if (configError || !config) return jsonResponse(req, { error: "OAuth provider is not configured." }, 404);
      validateProviderUrl(config.token_url);
      validateProviderUrl(config.userinfo_url);

      const redirectUri = url.origin + "/oauth/callback";
      const tokenResp = await fetch(config.token_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.client_id,
          client_secret: config.client_secret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenResp.ok) return jsonResponse(req, { error: "Token exchange failed." }, 502);

      const tokenData = await tokenResp.json();
      if (typeof tokenData.access_token !== "string" || tokenData.access_token.length > 10000) {
        return jsonResponse(req, { error: "No access token returned from provider." }, 502);
      }

      const userInfoResp = await fetch(config.userinfo_url, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userInfoResp.ok) return jsonResponse(req, { error: "Failed to fetch user info from provider." }, 502);

      const userInfo = await userInfoResp.json();
      if (typeof userInfo.sub !== "string" || typeof userInfo.email !== "string") {
        return jsonResponse(req, { error: "Incomplete user info from provider." }, 502);
      }

      // Use the profile-linking function to prevent duplicate profiles
      const emailVerified = userInfo.email_verified === true || userInfo.verified_email === true;
      const { data: linkResult, error: linkError } = await supabase.rpc("link_or_create_user_profile", {
        p_auth_user_id: user.id,
        p_email: userInfo.email,
        p_name: typeof userInfo.name === "string" ? userInfo.name : null,
        p_provider: provider,
        p_avatar_url: typeof userInfo.picture === "string" ? userInfo.picture : null,
        p_email_verified: emailVerified,
      });

      if (linkError) return jsonResponse(req, { error: "Failed to link or create user profile." }, 500);

      const result = linkResult as { user_id?: string; is_new?: boolean; action?: string; error?: string };

      if (result.error) {
        return jsonResponse(req, { error: result.error, action: result.action ?? "unknown" }, 403);
      }

      // Fetch the full user record for the response
      const { data: userProfile } = await supabase
        .from("users")
        .select("id, name, email, role, status")
        .eq("id", result.user_id!)
        .maybeSingle();

      if (!userProfile) return jsonResponse(req, { error: "Profile created but could not be retrieved." }, 500);
      return jsonResponse(req, { user: userProfile, isNew: result.is_new ?? false, action: result.action ?? "existing" });
    }

    if (urlAction === "providers") {
      const { data, error } = await supabase.from("oauth_configs").select("id, provider, enabled").eq("enabled", true);
      if (error) return jsonResponse(req, { error: "Failed to list providers." }, 500);
      return jsonResponse(req, { providers: data ?? [] });
    }

    return jsonResponse(req, { error: "Unknown action." }, 400);
  } catch (err) {
    console.error("oauth request failed", err);
    return jsonResponse(req, { error: "The OAuth request could not be completed." }, 500);
  }
});
