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

  // Use pgvector similarity search
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  let query_builder = supabase.rpc("rag_search", {
    query_embedding: embeddingStr,
    top_k: topK,
  });

  // Filter by knowledge base IDs if provided
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(`
      id,
      document_id,
      knowledge_base_id,
      chunk_text,
      page_number,
      slide_number,
      sheet_name,
      section,
      cell_range,
      embedding
    `)
    .in("knowledge_base_id", knowledgeBaseIds.length > 0 ? knowledgeBaseIds : (await supabase.from("knowledge_bases").select("id")).data?.map((kb: { id: string }) => kb.id) ?? [])
    .limit(topK);

  if (error || !data) return [];

  // Compute cosine similarity client-side since we can't use raw SQL via the client
  const results = data.map((chunk: {
    id: string;
    document_id: string;
    chunk_text: string;
    page_number: number | null;
    slide_number: number | null;
    sheet_name: string | null;
    section: string | null;
    cell_range: string | null;
    embedding: string;
  }) => {
    let emb: number[] = [];
    try {
      emb = JSON.parse(chunk.embedding) as number[];
    } catch {
      emb = [];
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < Math.min(emb.length, queryEmbedding.length); i++) {
      dotProduct += emb[i] * queryEmbedding[i];
      normA += emb[i] * emb[i];
      normB += queryEmbedding[i] * queryEmbedding[i];
    }
    const similarity = normA > 0 && normB > 0 ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      chunk_text: chunk.chunk_text,
      page_number: chunk.page_number,
      slide_number: chunk.slide_number,
      sheet_name: chunk.sheet_name,
      section: chunk.section,
      cell_range: chunk.cell_range,
      similarity,
    };
  });

  results.sort((a, b) => b.similarity - a.similarity);

  // Fetch document names
  const docIds = [...new Set(results.map((r) => r.document_id))];
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("id, filename")
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
        .maybeSingle();

      if (docError || !doc) return jsonResponse({ error: "Document not found." }, 404);

      // Update status to parsing
      await supabase.from("knowledge_documents").update({
        status: "parsing",
        processing_stage: "Parsing document",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId);

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
        }).eq("id", documentId);
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
      }).eq("id", documentId);

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
        }).eq("id", documentId);
        return jsonResponse({ error: "No text content extracted." }, 400);
      }

      // Update to embedding stage
      await supabase.from("knowledge_documents").update({
        status: "embedding",
        processing_stage: `Generating embeddings for ${allChunks.length} chunks`,
        chunk_count: allChunks.length,
        updated_at: new Date().toISOString(),
      }).eq("id", documentId);

      // Generate embeddings and insert chunks
      let embeddedCount = 0;
      for (let i = 0; i < allChunks.length; i++) {
        const chunk = allChunks[i];
        const embedding = await generateEmbedding(chunk.text, settings);

        await supabase.from("knowledge_chunks").insert({
          document_id: documentId,
          knowledge_base_id: doc.knowledge_base_id,
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
      }).eq("id", documentId);

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
        topK ?? 5,
        settings,
      );

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
        topK ?? 5,
        settings,
      );

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

      // Check vector DB (pgvector)
      const { error: vecError } = await supabase.rpc("rag_health_check");
      const vectorStatus = vecError ? "error" : "connected";

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
        },
      });
    }

    // --- Get Settings ---
    if (action === "getSettings") {
      return jsonResponse({ settings });
    }

    // --- Update Settings ---
    if (action === "updateSettings") {
      const updates = body.settings;
      const { data: existing } = await supabase.from("knowledge_settings").select("id").limit(1).maybeSingle();
      if (existing) {
        await supabase.from("knowledge_settings").update({
          embedding_provider: updates.embeddingProvider,
          embedding_model: updates.embeddingModel,
          embedding_endpoint: updates.embeddingEndpoint,
          embedding_dim: updates.embeddingDim,
          vector_provider: updates.vectorProvider,
          chunk_size: updates.chunkSize,
          chunk_overlap: updates.chunkOverlap,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("knowledge_settings").insert({
          embedding_provider: updates.embeddingProvider,
          embedding_model: updates.embeddingModel,
          embedding_endpoint: updates.embeddingEndpoint,
          embedding_dim: updates.embeddingDim,
          vector_provider: updates.vectorProvider,
          chunk_size: updates.chunkSize,
          chunk_overlap: updates.chunkOverlap,
        });
      }
      return jsonResponse({ success: true });
    }

    // --- Get Stats ---
    if (action === "stats") {
      const [kbResult, docResult, chunkResult, readyResult] = await Promise.all([
        supabase.from("knowledge_bases").select("id", { count: "exact", head: true }),
        supabase.from("knowledge_documents").select("id", { count: "exact", head: true }),
        supabase.from("knowledge_chunks").select("id", { count: "exact", head: true }),
        supabase.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("status", "ready"),
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
