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

async function getUserRole(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await supabase.from("app_roles").select("role").eq("user_id", userId).maybeSingle();
  if (!data) return "standard";
  return data.role === "admin" ? "platform_admin" : "standard";
}

async function checkRate(supabase: ReturnType<typeof createClient>, endpoint: string, identifier: string, roleTier: string, ip: string, userId: string | null): Promise<{ allowed: boolean; retryAfter: number }> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_endpoint: endpoint, p_scope: "user", p_identifier: identifier, p_role_tier: roleTier, p_ip: ip, p_user_id: userId ?? null,
  });
  if (error || !data) return { allowed: true, retryAfter: 0 };
  const result = data as { allowed: boolean; retry_after: number };
  return { allowed: result.allowed, retryAfter: result.retry_after ?? 0 };
}

interface ConnectionRow {
  id: string;
  name: string;
  kind: string;
  provider: string;
  endpoint: string;
  models: string[];
  enabled: boolean;
  status: string;
  api_key: string | null;
  key_masked: string | null;
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

function validateEndpoint(endpoint: string, provider: string): void {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid provider endpoint.');
  }

  const host = url.hostname.toLowerCase();
  const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal']);
  const parts = host.split('.').map(Number);
  const privateIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    parts[0] === 127 ||
    parts[0] === 0
  );
  if (blockedHosts.has(host) || privateIpv4 || host.startsWith('fc') || host.startsWith('fd')) {
    throw new Error('Provider endpoint is not allowed.');
  }

  const knownHosts = provider.includes('google') || provider.includes('gemini')
    ? ['generativelanguage.googleapis.com']
    : provider.includes('openai')
      ? ['api.openai.com']
      : provider.includes('anthropic')
        ? ['api.anthropic.com']
        : [];
  if (knownHosts.length > 0 && !knownHosts.includes(host)) {
    throw new Error('Provider endpoint is not allowed.');
  }
}

async function callGemini(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: { tokens: number } }> {
  const url = `${endpoint.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const tokens = data?.usageMetadata?.totalTokenCount ?? 0;
  return { text, usage: { tokens } };
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: { tokens: number } }> {
  const url = `${endpoint.replace(/\/$/, "")}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API error (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const tokens = data?.usage?.total_tokens ?? 0;
  return { text, usage: { tokens } };
}

async function callOllama(
  endpoint: string,
  _apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: { tokens: number } }> {
  const url = `${endpoint.replace(/\/$/, "")}/api/chat`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Ollama API error (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const text = data?.message?.content ?? "";
  const tokens = data?.eval_count ?? 0;
  return { text, usage: { tokens } };
}

async function callLMStudio(
  endpoint: string,
  _apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: { tokens: number } }> {
  return callOpenAICompatible(endpoint, _apiKey, model, prompt);
}

async function verifyUser(req: Request, supabase: ReturnType<typeof createClient>): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
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

    const user = await verifyUser(req, supabase);
    if (!user) return jsonResponse(req, { error: "Unauthorized." }, 401);

    const ip = getClientIP(req);
    const roleTier = await getUserRole(supabase, user.id);

    // Rate limit for chat action
    const body = await req.json();
    const { action, connectionId, prompt, model } = body;

    if (action === "chat" || action === "test") {
      const rl = await checkRate(supabase, "ai-chat", user.id, roleTier, ip, user.id);
      if (!rl.allowed) return rateLimitResponse(req, rl.retryAfter);
    }
    if (typeof connectionId !== 'string' || connectionId.length > 100) {
      return jsonResponse(req, { error: 'Invalid connection.' }, 400);
    }
    if (typeof model !== 'undefined' && (typeof model !== 'string' || model.length > 200)) {
      return jsonResponse(req, { error: 'Invalid model.' }, 400);
    }

    // Fetch the connection (using service role to get api_key)
    const { data: conn, error: connError } = await supabase
      .from("ai_connections")
      .select("id, name, kind, provider, endpoint, models, enabled, status, api_key, key_masked")
      .eq("id", connectionId)
      .eq("owner_user_id", user.id)
      .single<ConnectionRow>();

    if (connError || !conn) {
      return jsonResponse(req, { error: "Connection not found." }, 404);
    }

    const provider = conn.provider.toLowerCase();
    validateEndpoint(conn.endpoint, provider);
    const apiKey = conn.api_key ?? "";
    const useModel = model || conn.models[0] || "";

    if (action === "test") {
      // Test the connection with a minimal request
      const testPrompt = "Hello, please respond with 'Connection successful.'";

      let result;
      if (provider.includes("google") || provider.includes("gemini")) {
        if (!apiKey) return jsonResponse(req, { error: "No API key configured for this connection." }, 400);
        const geminiModel = useModel || "gemini-2.0-flash";
        result = await callGemini(conn.endpoint, apiKey, geminiModel, testPrompt);
      } else if (provider.includes("ollama")) {
        const ollamaModel = useModel || "llama3.1:8b";
        result = await callOllama(conn.endpoint, apiKey, ollamaModel, testPrompt);
      } else if (provider.includes("lm studio")) {
        const lsModel = useModel || "local-model";
        result = await callLMStudio(conn.endpoint, apiKey, lsModel, testPrompt);
      } else {
        if (!apiKey && conn.kind === "cloud") {
          return jsonResponse(req, { error: "No API key configured for this connection." }, 400);
        }
        const chatModel = useModel || "gpt-4o-mini";
        result = await callOpenAICompatible(conn.endpoint, apiKey, chatModel, testPrompt);
      }

      await supabase.from("ai_connections").update({ status: "healthy" }).eq("id", connectionId).eq("owner_user_id", user.id);

      return jsonResponse(req, { success: true, status: "healthy", reply: result.text });
    }

    if (action === "chat") {
      if (typeof prompt !== 'string' || !prompt.trim()) {
        return jsonResponse(req, { error: "No prompt provided." }, 400);
      }
      if (prompt.length > 20000) {
        return jsonResponse(req, { error: "Prompt is too long." }, 413);
      }

      let result;
      if (provider.includes("google") || provider.includes("gemini")) {
        if (!apiKey) return jsonResponse(req, { error: "No API key configured." }, 400);
        const geminiModel = useModel || "gemini-2.0-flash";
        result = await callGemini(conn.endpoint, apiKey, geminiModel, prompt);
      } else if (provider.includes("ollama")) {
        const ollamaModel = useModel || "llama3.1:8b";
        result = await callOllama(conn.endpoint, apiKey, ollamaModel, prompt);
      } else if (provider.includes("lm studio")) {
        const lsModel = useModel || "local-model";
        result = await callLMStudio(conn.endpoint, apiKey, lsModel, prompt);
      } else {
        if (!apiKey && conn.kind === "cloud") {
          return jsonResponse(req, { error: "No API key configured." }, 400);
        }
        const chatModel = useModel || "gpt-4o-mini";
        result = await callOpenAICompatible(conn.endpoint, apiKey, chatModel, prompt);
      }

      // Update usage stats
      const tokens = result.usage?.tokens ?? 0;
      await supabase.rpc("increment_ai_usage", {
        conn_id: connectionId,
        token_count: tokens,
      }).then(() => {});

      return jsonResponse(req, { reply: result.text, usage: result.usage });
    }

    return jsonResponse(req, { error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('ai-proxy request failed', err);
    return jsonResponse(req, { error: "The AI request could not be completed." }, 500);
  }
});
