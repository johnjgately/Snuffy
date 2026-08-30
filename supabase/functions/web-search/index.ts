import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NormalizedResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedDate: string | null;
  provider: "brave" | "duckduckgo";
  isFallback: boolean;
}

interface SearchOptions {
  query: string;
  maxResults?: number;
  safeSearch?: "off" | "moderate" | "strict";
  freshness?: string;
  searchType?: "web" | "news";
}

interface SearchResponse {
  results: NormalizedResult[];
  provider: "brave" | "duckduckgo";
  isFallback: boolean;
  fallbackReason?: string;
  totalResults: number;
  executionTimeMs: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// --- SSRF Protection ---

const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "0.0.0.0",
  "metadata.google.internal",
];

function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(host)) return true;
    // Block private IPv4 ranges
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 127) return true;
      if (parts[0] === 0) return true;
    }
    // Block private IPv6 (fc00::/7, ::1)
    if (host.startsWith("fc") || host.startsWith("fd") || host === "::1") return true;
    return false;
  } catch {
    return true;
  }
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
    .slice(0, 500);
}

// --- Brave Search Provider ---

async function braveSearch(
  apiKey: string,
  opts: SearchOptions,
  timeoutMs: number,
): Promise<{ results: NormalizedResult[]; error?: string; statusCode?: number }> {
  const maxResults = Math.min(opts.maxResults ?? 10, 20);
  const params = new URLSearchParams({
    q: opts.query,
    count: String(maxResults),
    safesearch: opts.safeSearch ?? "moderate",
  });
  if (opts.searchType === "news") {
    params.set("freshness", opts.freshness ?? "pw");
  } else if (opts.freshness) {
    params.set("freshness", opts.freshness);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      return { results: [], error: "AUTH_FAILED", statusCode: resp.status };
    }
    if (resp.status === 429) {
      return { results: [], error: "RATE_LIMIT", statusCode: resp.status };
    }
    if (!resp.ok) {
      return { results: [], error: `PROVIDER_ERROR_${resp.status}`, statusCode: resp.status };
    }

    const data = await resp.json();
    const webResults = (data?.web?.results ?? data?.results ?? []) as Array<{
      title?: string;
      url?: string;
      description?: string;
      published?: string;
      age?: string;
    }>;

    const results: NormalizedResult[] = webResults
      .filter((r) => r.url && r.title && !isBlockedUrl(r.url))
      .slice(0, maxResults)
      .map((r) => ({
        title: sanitizeHtml(r.title ?? ""),
        url: r.url!,
        snippet: sanitizeHtml(r.description ?? ""),
        domain: extractDomain(r.url!),
        publishedDate: r.published ?? r.age ?? null,
        provider: "brave" as const,
        isFallback: false,
      }));

    return { results };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { results: [], error: "TIMEOUT" };
    }
    return { results: [], error: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

// --- DuckDuckGo Fallback Provider ---

async function duckDuckGoSearch(
  opts: SearchOptions,
  timeoutMs: number,
): Promise<{ results: NormalizedResult[]; error?: string }> {
  const maxResults = Math.min(opts.maxResults ?? 10, 20);
  const params = new URLSearchParams({
    q: opts.query,
    format: "json",
    no_html: "1",
    no_redirect: "1",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`https://api.duckduckgo.com/?${params}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    if (!resp.ok) {
      return { results: [], error: `PROVIDER_ERROR_${resp.status}` };
    }

    const data = await resp.json();
    const rawResults = (data?.Results ?? []) as Array<{
      Text?: string;
      FirstURL?: string;
    }>;
    const relatedTopics = (data?.RelatedTopics ?? []) as Array<{
      Text?: string;
      FirstURL?: string;
    }>;

    const allRaw = [...rawResults, ...relatedTopics];
    const results: NormalizedResult[] = allRaw
      .filter((r) => r.FirstURL && r.Text && !isBlockedUrl(r.FirstURL))
      .slice(0, maxResults)
      .map((r) => {
        const text = sanitizeHtml(r.Text ?? "");
        const title = text.split(" - ")[0] ?? text;
        const snippet = text;
        return {
          title,
          url: r.FirstURL!,
          snippet,
          domain: extractDomain(r.FirstURL!),
          publishedDate: null,
          provider: "duckduckgo" as const,
          isFallback: true,
        };
      });

    return { results };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { results: [], error: "TIMEOUT" };
    }
    return { results: [], error: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Search Manager ---

async function performSearch(
  supabase: ReturnType<typeof createClient>,
  opts: SearchOptions,
  settings: {
    enabled: boolean;
    primaryProvider: string;
    fallbackProvider: string;
    autoFallback: boolean;
    maxResults: number;
    safeSearch: string;
    timeoutMs: number;
  },
  user: { id: string; email: string } | null,
  aiProvider?: string,
  aiModel?: string,
): Promise<SearchResponse> {
  const start = Date.now();

  if (!settings.enabled) {
    return {
      results: [],
      provider: "brave",
      isFallback: false,
      totalResults: 0,
      executionTimeMs: Date.now() - start,
    };
  }

  const maxResults = opts.maxResults ?? settings.maxResults ?? 10;
  const safeSearch = (opts.safeSearch ?? settings.safeSearch ?? "moderate") as "off" | "moderate" | "strict";
  const timeoutMs = settings.timeoutMs ?? 10000;

  let results: NormalizedResult[] = [];
  let provider: "brave" | "duckduckgo" = "brave";
  let isFallback = false;
  let fallbackReason: string | undefined;

  // Try Brave first
  if (settings.primaryProvider === "brave") {
    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
    if (!braveKey) {
      fallbackReason = "NO_API_KEY";
    } else {
      const braveResult = await braveSearch(braveKey, { ...opts, maxResults, safeSearch }, timeoutMs);
      if (braveResult.error) {
        fallbackReason = braveResult.error;
      } else if (braveResult.results.length > 0) {
        results = braveResult.results;
      } else {
        // Valid zero-result response — do NOT fallback
        results = [];
      }
    }
  }

  // Fallback to DuckDuckGo
  if (results.length === 0 && fallbackReason && settings.autoFallback && settings.fallbackProvider === "duckduckgo") {
    const ddgResult = await duckDuckGoSearch({ ...opts, maxResults, safeSearch }, timeoutMs);
    if (ddgResult.results.length > 0) {
      results = ddgResult.results;
      provider = "duckduckgo";
      isFallback = true;
    } else if (!ddgResult.error) {
      // DDG also returned zero results — valid empty response
    }
  }

  const executionTimeMs = Date.now() - start;

  // Log the search
  try {
    await supabase.from("search_logs").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      query: opts.query,
      search_type: opts.searchType ?? "web",
      primary_provider: settings.primaryProvider,
      provider_used: provider,
      is_fallback: isFallback,
      fallback_reason: fallbackReason ?? null,
      result_count: results.length,
      result_urls: results.map((r) => r.url),
      ai_provider: aiProvider ?? null,
      ai_model: aiModel ?? null,
      execution_time_ms: executionTimeMs,
      success: results.length > 0,
    });
  } catch {
    // Logging is best-effort
  }

  return {
    results,
    provider,
    isFallback,
    fallbackReason,
    totalResults: results.length,
    executionTimeMs,
  };
}

// --- Health Check ---

async function checkHealth(provider: string): Promise<{ status: string; detail: string }> {
  if (provider === "brave") {
    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
    if (!braveKey) return { status: "no_key", detail: "No Brave API key configured" };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=test&count=1`, {
        headers: { "X-Subscription-Token": braveKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.status === 401 || resp.status === 403) return { status: "auth_failed", detail: "Authentication failed" };
      if (resp.status === 429) return { status: "rate_limited", detail: "Rate limited" };
      if (!resp.ok) return { status: "unavailable", detail: `HTTP ${resp.status}` };
      return { status: "connected", detail: "Connected" };
    } catch {
      return { status: "timeout", detail: "Connection timed out" };
    }
  }
  if (provider === "duckduckgo") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://api.duckduckgo.com/?q=test&format=json&no_html=1`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return { status: "unavailable", detail: `HTTP ${resp.status}` };
      return { status: "available", detail: "Available" };
    } catch {
      return { status: "timeout", detail: "Connection timed out" };
    }
  }
  return { status: "unknown", detail: "Unknown provider" };
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
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const user = await verifyUser(req, supabase);
    if (!user) return jsonResponse({ error: "Unauthorized." }, 401);

    const body = await req.json();
    const { action } = body;

    // Get search settings from DB
    const { data: settingsRow } = await supabase
      .from("search_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const settings = {
      enabled: settingsRow?.enabled ?? true,
      primaryProvider: settingsRow?.primary_provider ?? "brave",
      fallbackProvider: settingsRow?.fallback_provider ?? "duckduckgo",
      autoFallback: settingsRow?.auto_fallback ?? true,
      maxResults: settingsRow?.max_results ?? 10,
      safeSearch: settingsRow?.safe_search ?? "moderate",
      timeoutMs: settingsRow?.timeout_ms ?? 10000,
    };

    if (action === "search") {
      const opts: SearchOptions = {
        query: body.query,
        maxResults: body.maxResults,
        safeSearch: body.safeSearch,
        freshness: body.freshness,
        searchType: body.searchType,
      };

      if (!opts.query || !opts.query.trim()) {
        return jsonResponse({ error: "No search query provided." }, 400);
      }

      const result = await performSearch(
        supabase,
        opts,
        settings,
        user,
        body.aiProvider,
        body.aiModel,
      );

      return jsonResponse(result);
    }

    if (action === "health") {
      const provider = body.provider ?? "brave";
      const health = await checkHealth(provider);
      return jsonResponse({ provider, ...health });
    }

    if (action === "test") {
      const provider = body.provider ?? "brave";
      const testQuery = "Snuffy AI assistant";
      const health = await checkHealth(provider);

      let testResults: NormalizedResult[] = [];
      if (provider === "brave" && health.status === "connected") {
        const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
        const r = await braveSearch(braveKey, { query: testQuery, maxResults: 3 }, 10000);
        testResults = r.results;
      } else if (provider === "duckduckgo" && health.status === "available") {
        const r = await duckDuckGoSearch({ query: testQuery, maxResults: 3 }, 10000);
        testResults = r.results;
      }

      return jsonResponse({ provider, health, testResults });
    }

    if (action === "getSettings") {
      return jsonResponse({ settings });
    }

    if (action === "updateSettings") {
      const updates = body.settings;
      if (settingsRow) {
        const { error } = await supabase
          .from("search_settings")
          .update({
            enabled: updates.enabled,
            primary_provider: updates.primaryProvider,
            fallback_provider: updates.fallbackProvider,
            auto_fallback: updates.autoFallback,
            allow_auto_search: updates.allowAutoSearch,
            max_results: updates.maxResults,
            safe_search: updates.safeSearch,
            timeout_ms: updates.timeoutMs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settingsRow.id);
        if (error) return jsonResponse({ error: error.message }, 500);
      } else {
        const { error } = await supabase.from("search_settings").insert({
          enabled: updates.enabled,
          primary_provider: updates.primaryProvider,
          fallback_provider: updates.fallbackProvider,
          auto_fallback: updates.autoFallback,
          allow_auto_search: updates.allowAutoSearch,
          max_results: updates.maxResults,
          safe_search: updates.safeSearch,
          timeout_ms: updates.timeoutMs,
        });
        if (error) return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
