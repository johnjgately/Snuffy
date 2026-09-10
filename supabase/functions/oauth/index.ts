import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const user = await getUser(req, supabase);
    if (!user) return jsonResponse({ error: "Unauthorized." }, 401);

    const url = new URL(req.url);
    const urlAction = url.searchParams.get("action");

    if (urlAction === "authorize") {
      const provider = url.searchParams.get("provider");
      if (!provider || provider.length > 50) return jsonResponse({ error: "Provider is required." }, 400);

      const { data: config, error: configError } = await supabase
        .from("oauth_configs")
        .select("provider, client_id, auth_url, scopes")
        .eq("provider", provider)
        .eq("enabled", true)
        .maybeSingle();
      if (configError || !config) return jsonResponse({ error: "OAuth provider is not configured or not enabled." }, 404);

      validateProviderUrl(config.auth_url);
      const state = crypto.randomUUID();
      const { error: stateError } = await supabase.from("oauth_states").insert({
        state,
        provider,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (stateError) return jsonResponse({ error: "Could not start OAuth authorization." }, 500);

      const redirectUri = url.origin + "/oauth/callback";
      const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes,
        state,
      });
      return jsonResponse({ authUrl: `${config.auth_url}?${params.toString()}`, state });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (body.action !== "callback") return jsonResponse({ error: "Unknown action." }, 400);

      const provider = typeof body.provider === "string" ? body.provider : "";
      const code = typeof body.code === "string" ? body.code : "";
      const state = typeof body.state === "string" ? body.state : "";
      if (!provider || !code || !state || code.length > 2000 || state.length > 100) {
        return jsonResponse({ error: "Invalid OAuth callback." }, 400);
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
      if (!stateRow) return jsonResponse({ error: "OAuth state is invalid or expired." }, 400);

      const { data: claimedState } = await supabase
        .from("oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("id", stateRow.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (!claimedState) return jsonResponse({ error: "OAuth state is invalid or already used." }, 400);

      const { data: config, error: configError } = await supabase
        .from("oauth_configs")
        .select("provider, client_id, client_secret, token_url, userinfo_url")
        .eq("provider", provider)
        .eq("enabled", true)
        .maybeSingle();
      if (configError || !config) return jsonResponse({ error: "OAuth provider is not configured." }, 404);
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
      if (!tokenResp.ok) return jsonResponse({ error: "Token exchange failed." }, 502);

      const tokenData = await tokenResp.json();
      if (typeof tokenData.access_token !== "string" || tokenData.access_token.length > 10000) {
        return jsonResponse({ error: "No access token returned from provider." }, 502);
      }

      const userInfoResp = await fetch(config.userinfo_url, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userInfoResp.ok) return jsonResponse({ error: "Failed to fetch user info from provider." }, 502);

      const userInfo = await userInfoResp.json();
      if (typeof userInfo.sub !== "string" || typeof userInfo.email !== "string") {
        return jsonResponse({ error: "Incomplete user info from provider." }, 502);
      }

      const { data: byOauthId } = await supabase
        .from("users")
        .select("id, name, email, role, status, mfa, oauth_provider, oauth_id")
        .eq("oauth_id", userInfo.sub)
        .maybeSingle();

      const { data: byEmail } = await supabase
        .from("users")
        .select("id, name, email, role, status, mfa, oauth_provider, oauth_id")
        .eq("email", userInfo.email)
        .maybeSingle();

      const existing = byOauthId ?? byEmail;

      if (existing) {
        const newStatus = existing.status === "invited" ? "active" : existing.status;
        await supabase.from("users").update({
          oauth_provider: provider,
          oauth_id: userInfo.sub,
          avatar_url: typeof userInfo.picture === "string" ? userInfo.picture : null,
          last_active: "Just now",
          status: newStatus,
        }).eq("id", existing.id);
        return jsonResponse({ user: { id: existing.id, name: existing.name, email: existing.email, role: existing.role, status: newStatus }, isNew: false });
      }

      const { data: created, error: createError } = await supabase.from("users").insert({
        name: typeof userInfo.name === "string" ? userInfo.name : userInfo.email.split("@")[0],
        email: userInfo.email,
        role: "Viewer",
        status: "active",
        mfa: false,
        permissions: [],
        oauth_provider: provider,
        oauth_id: userInfo.sub,
        avatar_url: typeof userInfo.picture === "string" ? userInfo.picture : null,
        last_active: "Just now",
      }).select("id, name, email, role, status").maybeSingle();
      if (createError || !created) return jsonResponse({ error: "Failed to create user from OAuth." }, 500);
      return jsonResponse({ user: created, isNew: true });
    }

    if (urlAction === "providers") {
      const { data, error } = await supabase.from("oauth_configs").select("id, provider, enabled").eq("enabled", true);
      if (error) return jsonResponse({ error: "Failed to list providers." }, 500);
      return jsonResponse({ providers: data ?? [] });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error("oauth request failed", err);
    return jsonResponse({ error: "The OAuth request could not be completed." }, 500);
  }
});
