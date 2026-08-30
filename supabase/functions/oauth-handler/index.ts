import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const urlAction = url.searchParams.get("action");

    // GET ?action=authorize&provider=google
    if (urlAction === "authorize") {
      const provider = url.searchParams.get("provider");
      if (!provider) return jsonResponse({ error: "Provider is required." }, 400);

      const result = await supabase
        .from("oauth_configs")
        .select("*")
        .eq("provider", provider)
        .eq("enabled", true)
        .single();

      if (result.error || !result.data) {
        return jsonResponse({ error: "OAuth provider is not configured or not enabled." }, 404);
      }

      const config = result.data;
      const state = crypto.randomUUID();
      const allowedRedirect = url.origin + "/oauth/callback";
      const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: allowedRedirect,
        response_type: "code",
        scope: config.scopes,
        state: state,
      });

      const authUrl = config.auth_url + "?" + params.toString();
      return jsonResponse({ authUrl: authUrl, state: state });
    }

    // POST { action: "callback", provider, code, state }
    if (req.method === "POST") {
      const body = await req.json();
      if (body.action !== "callback") {
        return jsonResponse({ error: "Unknown action." }, 400);
      }

      const provider = body.provider;
      const code = body.code;
      if (!provider || !code) {
        return jsonResponse({ error: "Provider and code are required." }, 400);
      }

      const result = await supabase
        .from("oauth_configs")
        .select("*")
        .eq("provider", provider)
        .eq("enabled", true)
        .single();

      if (result.error || !result.data) {
        return jsonResponse({ error: "OAuth provider is not configured." }, 404);
      }

      const config = result.data;
      const redirectUri = url.origin + "/oauth/callback";

      // Exchange code for access token
      const tokenResp = await fetch(config.token_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.client_id,
          client_secret: config.client_secret,
          code: code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        return jsonResponse({ error: "Token exchange failed: " + errText }, 502);
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        return jsonResponse({ error: "No access token returned from provider." }, 502);
      }

      // Fetch user info
      const userInfoResp = await fetch(config.userinfo_url, {
        headers: { Authorization: "Bearer " + accessToken },
      });

      if (!userInfoResp.ok) {
        return jsonResponse({ error: "Failed to fetch user info from provider." }, 502);
      }

      const userInfo = await userInfoResp.json();
      if (!userInfo.sub || !userInfo.email) {
        return jsonResponse({ error: "Incomplete user info from provider." }, 502);
      }

      // Check if user already exists
      const existingResult = await supabase
        .from("users")
        .select("id, name, email, role, status, mfa, oauth_provider, oauth_id")
        .or("oauth_id.eq." + userInfo.sub + ",email.eq." + userInfo.email)
        .maybeSingle();

      if (existingResult.data) {
        const existing = existingResult.data;
        const newStatus = existing.status === "invited" ? "active" : existing.status;
        await supabase.from("users").update({
          oauth_provider: provider,
          oauth_id: userInfo.sub,
          avatar_url: userInfo.picture ?? null,
          last_active: "Just now",
          status: newStatus,
        }).eq("id", existing.id);

        return jsonResponse({
          user: {
            id: existing.id,
            name: existing.name,
            email: existing.email,
            role: existing.role,
            status: newStatus,
          },
          isNew: false,
        });
      }

      // Create new user from OAuth
      const name = userInfo.name ?? userInfo.email.split("@")[0];
      const insertResult = await supabase
        .from("users")
        .insert({
          name: name,
          email: userInfo.email,
          role: "Viewer",
          status: "active",
          mfa: false,
          permissions: [],
          oauth_provider: provider,
          oauth_id: userInfo.sub,
          avatar_url: userInfo.picture ?? null,
          last_active: "Just now",
        })
        .select("id, name, email, role, status")
        .single();

      if (insertResult.error || !insertResult.data) {
        return jsonResponse({ error: "Failed to create user from OAuth." }, 500);
      }

      return jsonResponse({ user: insertResult.data, isNew: true });
    }

    // GET ?action=providers
    if (urlAction === "providers") {
      const providersResult = await supabase
        .from("oauth_configs")
        .select("id, provider, enabled")
        .eq("enabled", true);

      if (providersResult.error) {
        return jsonResponse({ error: "Failed to list providers." }, 500);
      }
      return jsonResponse({ providers: providersResult.data ?? [] });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
