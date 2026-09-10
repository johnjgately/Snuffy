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

function validateEmbeddingEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid embedding endpoint.');
  }
  const host = url.hostname.toLowerCase();
  const parts = host.split('.').map(Number);
  const privateIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    parts[0] === 127 ||
    parts[0] === 0
  );
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'].includes(host) || privateIpv4 || host.startsWith('fc') || host.startsWith('fd')) {
    throw new Error('Embedding endpoint is not allowed.');
  }
}

interface KnowledgeSettings {
  embedding_provider: string;
  embedding_model: string;
  embedding_endpoint: string;
  embedding_dim: number;
  vector_provider: string;
  chunk_size: number;
  chunk_overlap: number;
}

interface ChunkMetadata {
  page_number?: number;
  slide_number?: number;
  sheet_name?: string;
  section?: string;
  cell_range?: string;
}

async function getSettings(supabase: ReturnType<typeof createClient>): Promise<KnowledgeSettings> {
  const { data } = await supabase
    .from("knowledge_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  return {
    embedding_provider: data?.embedding_provider ?? "ollama",
    embedding_model: data?.embedding_model ?? "nomic-embed-text",
    embedding_endpoint: data?.embedding_endpoint ?? "http://localhost:11434",
    embedding_dim: data?.embedding_dim ?? 1024,
    vector_provider: data?.vector_provider ?? "pgvector",
    chunk_size: data?.chunk_size ?? 512,
    chunk_overlap: data?.chunk_overlap ?? 50,
  };
}

// --- Text Extraction ---

function extractTextFromContent(content: string, fileType: string): { text: string; pages: number; chunks: Array<{ text: string; metadata: ChunkMetadata }> } {
  const chunks: Array<{ text: string; metadata: ChunkMetadata }> = [];

  if (fileType === "txt" || fileType === "md" || fileType === "csv" || fileType === "tsv" || fileType === "json" || fileType === "jsonl" || fileType === "xml" || fileType === "yaml" || fileType === "yml" || fileType === "html" || fileType === "htm" || fileType === "rtf") {
    // Plain text or structured text — split by paragraphs
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
    for (let i = 0; i < paragraphs.length; i++) {
      chunks.push({ text: paragraphs[i].trim(), metadata: { section: `Paragraph ${i + 1}` } });
    }
    return { text: content, pages: 1, chunks };
  }

  // For binary formats (pdf, docx, xlsx, pptx, etc.), the content is already extracted text
  // Split by form feed (page separator) or double newlines
  const pageSplit = content.split(/\f/);
  let pageNum = 0;
  for (const page of pageSplit) {
    pageNum++;
    const paragraphs = page.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
    for (const p of paragraphs) {
      chunks.push({ text: p.trim(), metadata: { page_number: pageNum } });
    }
  }
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({ text: content.trim().slice(0, 5000), metadata: { page_number: 1 } });
  }
  return { text: content, pages: pageSplit.length, chunks };
}

// --- Chunking ---

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

// --- Embedding Generation (Ollama) ---

async function generateEmbedding(
  text: string,
  settings: KnowledgeSettings,
): Promise<number[] | null> {
  validateEmbeddingEndpoint(settings.embedding_endpoint);
  const endpoint = settings.embedding_endpoint.replace(/\/$/, "");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    if (settings.embedding_provider === "ollama") {
      const resp = await fetch(`${endpoint}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.embedding_model, prompt: text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.embedding ?? null;
    }

    // OpenAI-compatible embedding endpoint
    const resp = await fetch(`${endpoint}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.embedding_model, input: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// --- RAG Search ---

async function ragSearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  knowledgeBaseIds: string[],
  userId: string,
  topK: number,
  settings: KnowledgeSettings,
): Promise<Array<{
  chunk_text: string;
  chunk_id: string;
  document_id: string;
  document_name: string;
  page_number: number | null;
  slide_number: number | null;
  sheet_name: string | null;
  section: string | null;
  cell_range: string | null;
  similarity: number;
}>> {
  const queryEmbedding = await generateEmbedding(query, settings);
  if (!queryEmbedding) return [];

  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Use server-side pgvector similarity search via rag_search RPC
  const { data: ragResults, error: ragError } = await supabase.rpc("rag_search", {
    query_embedding: embeddingStr,
    top_k: topK,
    p_user_id: userId,
    p_knowledge_base_ids: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : null,
  });

  if (ragError || !ragResults) return [];

  const results = (ragResults as Array<{
    chunk_id: string;
    document_id: string;
    knowledge_base_id: string;
    chunk_text: string;
    page_number: number | null;
    slide_number: number | null;
    sheet_name: string | null;
    section: string | null;
    cell_range: string | null;
    similarity: number;
  }>).map((r) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    chunk_text: r.chunk_text,
    page_number: r.page_number,
    slide_number: r.slide_number,
    sheet_name: r.sheet_name,
    section: r.section,
    cell_range: r.cell_range,
    similarity: r.similarity,
  }));

  // Fetch document names
  const docIds = [...new Set(results.map((r) => r.document_id))];
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("id, filename")
      .eq("user_id", userId)
      .in("id", docIds);
    const docMap = new Map<string, string>();
    for (const d of docs ?? []) {
      docMap.set(d.id, d.filename);
    }
    for (const r of results) {
      (r as unknown as { document_name: string }).document_name = docMap.get(r.document_id) ?? "Unknown";
    }
  }

  return results.slice(0, topK).filter((r) => r.similarity > 0.1);
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
    const settings = await getSettings(supabase);

    // --- Process document ---
    if (action === "process") {
      const { documentId } = body;
      if (!documentId) return jsonResponse({ error: "No documentId provided." }, 400);

      const { data: doc, error: docError } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("id", documentId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (docError || !doc) return jsonResponse({ error: "Document not found." }, 404);

      // Update status to parsing
      await supabase.from("knowledge_documents").update({
        status: "parsing",
        processing_stage: "Parsing document",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId).eq("user_id", user.id);

      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from("knowledge-files")
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        await supabase.from("knowledge_documents").update({
          status: "failed",
          processing_error: "Failed to download file from storage.",
          updated_at: new Date().toISOString(),
        }).eq("id", documentId).eq("user_id", user.id);
        return jsonResponse({ error: "Failed to download file." }, 500);
      }

      const fileText = await fileData.text();
      const fileType = doc.file_type.toLowerCase();

      // Extract text and create chunks
      const { pages, chunks: rawChunks } = extractTextFromContent(fileText, fileType);

      // Update page count
      await supabase.from("knowledge_documents").update({
        page_count: pages,
        processing_stage: "Chunking",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId).eq("user_id", user.id);

      // Chunk each extracted segment
      const allChunks: Array<{ text: string; metadata: ChunkMetadata }> = [];
      for (const raw of rawChunks) {
        const subChunks = chunkText(raw.text, settings.chunk_size, settings.chunk_overlap);
        for (const sc of subChunks) {
          allChunks.push({ text: sc, metadata: raw.metadata });
        }
      }

      if (allChunks.length === 0) {
        await supabase.from("knowledge_documents").update({
          status: "failed",
          processing_error: "No text content could be extracted from this file.",
          updated_at: new Date().toISOString(),
        }).eq("id", documentId).eq("user_id", user.id);
        return jsonResponse({ error: "No text content extracted." }, 400);
      }

      // Update to embedding stage
      await supabase.from("knowledge_documents").update({
        status: "embedding",
        processing_stage: `Generating embeddings for ${allChunks.length} chunks`,
        chunk_count: allChunks.length,
        updated_at: new Date().toISOString(),
      }).eq("id", documentId).eq("user_id", user.id);

      // Generate embeddings and insert chunks
      let embeddedCount = 0;
      for (let i = 0; i < allChunks.length; i++) {
        const chunk = allChunks[i];
        const embedding = await generateEmbedding(chunk.text, settings);

        await supabase.from("knowledge_chunks").insert({
          document_id: documentId,
          knowledge_base_id: doc.knowledge_base_id,
          user_id: user.id,
          chunk_index: i,
          chunk_text: chunk.text,
          page_number: chunk.metadata.page_number ?? null,
          slide_number: chunk.metadata.slide_number ?? null,
          sheet_name: chunk.metadata.sheet_name ?? null,
          section: chunk.metadata.section ?? null,
          cell_range: chunk.metadata.cell_range ?? null,
          embedding: embedding ? `[${embedding.join(",")}]` : null,
          metadata: chunk.metadata,
        });

        if (embedding) embeddedCount++;
      }

      // Mark as ready
      await supabase.from("knowledge_documents").update({
        status: "ready",
        processing_stage: "Ready",
        embedding_status: embeddedCount > 0 ? "complete" : "failed",
        ocr_status: "not_required",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId).eq("user_id", user.id);

      // Audit log document processing
      try {
        await supabase.rpc("log_audit", {
          p_action: "knowledge_document.process",
          p_entity_type: "knowledge_documents",
          p_entity_id: documentId,
          p_actor_user_id: user.id,
          p_metadata: { chunks: allChunks.length, embedded: embeddedCount, pages },
        });
      } catch { /* best-effort */ }

      return jsonResponse({
        success: true,
        documentId,
        chunks: allChunks.length,
        embedded: embeddedCount,
        pages,
      });
    }

    // --- RAG Search ---
    if (action === "search") {
      const { query, knowledgeBaseIds, topK } = body;
      if (!query || !query.trim()) return jsonResponse({ error: "No query provided." }, 400);

      const results = await ragSearch(
        supabase,
        query,
        knowledgeBaseIds ?? [],
        user.id,
        Math.min(Number(topK) || 5, 20),
        settings,
      );

      // Audit log RAG search without storing query text
      try {
        await supabase.rpc("log_audit", {
          p_action: "rag.search",
          p_entity_type: "knowledge_chunks",
          p_outcome: results.length > 0 ? "success" : "failed",
          p_actor_user_id: user.id,
          p_metadata: { result_count: results.length, knowledge_base_ids: knowledgeBaseIds ?? [] },
        });
      } catch { /* best-effort */ }

      return jsonResponse({ results, query, totalResults: results.length });
    }

    // --- RAG Query (search + format context) ---
    if (action === "rag-query") {
      const { query, knowledgeBaseIds, topK } = body;
      if (!query || !query.trim()) return jsonResponse({ error: "No query provided." }, 400);

      const results = await ragSearch(
        supabase,
        query,
        knowledgeBaseIds ?? [],
        user.id,
        Math.min(Number(topK) || 5, 20),
        settings,
      );

      // Audit log RAG query without storing query text
      try {
        await supabase.rpc("log_audit", {
          p_action: "rag.query",
          p_entity_type: "knowledge_chunks",
          p_outcome: results.length > 0 ? "success" : "failed",
          p_actor_user_id: user.id,
          p_metadata: { result_count: results.length, knowledge_base_ids: knowledgeBaseIds ?? [] },
        });
      } catch { /* best-effort */ }

      // Format context for AI
      const context = results.map((r, i) => {
        let source = `${r.document_name}`;
        if (r.page_number) source += ` — Page ${r.page_number}`;
        if (r.slide_number) source += ` — Slide ${r.slide_number}`;
        if (r.sheet_name) source += ` — Sheet: ${r.sheet_name}`;
        if (r.section) source += ` — ${r.section}`;
        if (r.cell_range) source += ` — Cells: ${r.cell_range}`;
        return `[${i + 1}] Source: ${source}\n    Content: ${r.chunk_text}`;
      }).join("\n\n");

      const citations = results.map((r) => {
        let source = `${r.document_name}`;
        if (r.page_number) source += ` — Page ${r.page_number}`;
        if (r.slide_number) source += ` — Slide ${r.slide_number}`;
        if (r.sheet_name) source += ` — Sheet: ${r.sheet_name}`;
        if (r.section) source += ` — ${r.section}`;
        return source;
      });

      return jsonResponse({
        results,
        context,
        citations,
        totalResults: results.length,
      });
    }

    // --- Health Check ---
    if (action === "health") {
      validateEmbeddingEndpoint(settings.embedding_endpoint);
      const endpoint = settings.embedding_endpoint.replace(/\/$/, "");
      let embeddingStatus = "unknown";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        if (settings.embedding_provider === "ollama") {
          const resp = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
          clearTimeout(timeout);
          embeddingStatus = resp.ok ? "connected" : "unavailable";
        } else {
          const resp = await fetch(`${endpoint}/v1/models`, { signal: controller.signal });
          clearTimeout(timeout);
          embeddingStatus = resp.ok ? "connected" : "unavailable";
        }
      } catch {
        embeddingStatus = "unreachable";
      }

      // Check vector DB (pgvector) via rag_health_check RPC
      const { data: healthData, error: vecError } = await supabase.rpc("rag_health_check");
      const vectorStatus = vecError ? "error" : (healthData?.status ?? "unknown");
      const totalChunks = vecError ? 0 : (healthData?.total_chunks ?? 0);
      const embeddedChunks = vecError ? 0 : (healthData?.embedded_chunks ?? 0);

      return jsonResponse({
        embedding: {
          provider: settings.embedding_provider,
          model: settings.embedding_model,
          endpoint: settings.embedding_endpoint,
          status: embeddingStatus,
        },
        vectorDb: {
          provider: settings.vector_provider,
          status: vectorStatus,
          vectorExtension: vecError ? "error" : (healthData?.vector_extension ?? "unknown"),
          totalChunks,
          embeddedChunks,
        },
      });
    }

    // --- Get Settings ---
    if (action === "getSettings") {
      return jsonResponse({ settings });
    }

    // --- Update Settings (admin only) ---
    if (action === "updateSettings") {
      const { data: roleData } = await supabase
        .from("app_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleData?.role !== "admin") return jsonResponse({ error: "Admin access required." }, 403);

      const updates = body.settings ?? {};
      const cleanEndpoint = typeof updates.embeddingEndpoint === "string" ? updates.embeddingEndpoint : settings.embedding_endpoint;
      if (cleanEndpoint) validateEmbeddingEndpoint(cleanEndpoint);
      const cleanProvider = typeof updates.embeddingProvider === "string" ? updates.embeddingProvider.slice(0, 50) : settings.embedding_provider;
      const cleanModel = typeof updates.embeddingModel === "string" ? updates.embeddingModel.slice(0, 100) : settings.embedding_model;
      const cleanDim = typeof updates.embeddingDim === "number" && updates.embeddingDim > 0 && updates.embeddingDim <= 4096 ? updates.embeddingDim : settings.embedding_dim;
      const cleanVectorProvider = typeof updates.vectorProvider === "string" ? updates.vectorProvider.slice(0, 50) : settings.vector_provider;
      const cleanChunkSize = typeof updates.chunkSize === "number" && updates.chunkSize > 0 && updates.chunkSize <= 10000 ? updates.chunkSize : settings.chunk_size;
      const cleanChunkOverlap = typeof updates.chunkOverlap === "number" && updates.chunkOverlap >= 0 && updates.chunkOverlap < cleanChunkSize ? updates.chunkOverlap : settings.chunk_overlap;
      const { data: existing } = await supabase.from("knowledge_settings").select("id").limit(1).maybeSingle();
      if (existing) {
        await supabase.from("knowledge_settings").update({
          embedding_provider: cleanProvider,
          embedding_model: cleanModel,
          embedding_endpoint: cleanEndpoint,
          embedding_dim: cleanDim,
          vector_provider: cleanVectorProvider,
          chunk_size: cleanChunkSize,
          chunk_overlap: cleanChunkOverlap,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("knowledge_settings").insert({
          embedding_provider: cleanProvider,
          embedding_model: cleanModel,
          embedding_endpoint: cleanEndpoint,
          embedding_dim: cleanDim,
          vector_provider: cleanVectorProvider,
          chunk_size: cleanChunkSize,
          chunk_overlap: cleanChunkOverlap,
        });
      }
      return jsonResponse({ success: true });
    }

    // --- Get Stats ---
    if (action === "stats") {
      const [kbResult, docResult, chunkResult, readyResult] = await Promise.all([
        supabase.from("knowledge_bases").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "ready"),
      ]);

      return jsonResponse({
        knowledgeBases: kbResult.count ?? 0,
        documents: docResult.count ?? 0,
        chunks: chunkResult.count ?? 0,
        readyDocuments: readyResult.count ?? 0,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('knowledge-rag request failed', err);
    return jsonResponse({ error: "The knowledge request could not be completed." }, 500);
  }
});
