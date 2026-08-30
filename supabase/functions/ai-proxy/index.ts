import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callGemini(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: { tokens: number } }> {
  const url = `${endpoint.replace(/\/$/, "")}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    const { action, connectionId, prompt, model } = body;

    // Fetch the connection (using service role to get api_key)
    const { data: conn, error: connError } = await supabase
      .from("ai_connections")
      .select("id, name, kind, provider, endpoint, models, enabled, status, api_key, key_masked")
      .eq("id", connectionId)
      .single<ConnectionRow>();

    if (connError || !conn) {
      return jsonResponse({ error: "Connection not found." }, 404);
    }

    const provider = conn.provider.toLowerCase();
    const apiKey = conn.api_key ?? "";
    const useModel = model || conn.models[0] || "";

    if (action === "test") {
      // Test the connection with a minimal request
      const testPrompt = "Hello, please respond with 'Connection successful.'";

      let result;
      if (provider.includes("google") || provider.includes("gemini")) {
        if (!apiKey) return jsonResponse({ error: "No API key configured for this connection." }, 400);
        const geminiModel = useModel || "gemini-2.0-flash";
        result = await callGemini(conn.endpoint, apiKey, geminiModel, testPrompt);
      } else if (provider.includes("ollama")) {
        const ollamaModel = useModel || "llama3.1:8b";
        result = await callOllama(conn.endpoint, apiKey, ollamaModel, testPrompt);
      } else if (provider.includes("lm studio")) {
        const lsModel = useModel || "local-model";
        result = await callLMStudio(conn.endpoint, apiKey, lsModel, testPrompt);
      } else {
        // OpenAI, Anthropic, vLLM, OpenAI-compatible — all use OpenAI-compatible chat format
        if (!apiKey && conn.kind === "cloud") {
          return jsonResponse({ error: "No API key configured for this connection." }, 400);
        }
        const chatModel = useModel || "gpt-4o-mini";
        result = await callOpenAICompatible(conn.endpoint, apiKey, chatModel, testPrompt);
      }

      // Update status to healthy
      await supabase.from("ai_connections").update({ status: "healthy" }).eq("id", connectionId);

      return jsonResponse({ success: true, status: "healthy", reply: result.text });
    }

    if (action === "chat") {
      if (!prompt || !prompt.trim()) {
        return jsonResponse({ error: "No prompt provided." }, 400);
      }

      let result;
      if (provider.includes("google") || provider.includes("gemini")) {
        if (!apiKey) return jsonResponse({ error: "No API key configured." }, 400);
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
          return jsonResponse({ error: "No API key configured." }, 400);
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

      return jsonResponse({ reply: result.text, usage: result.usage });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
