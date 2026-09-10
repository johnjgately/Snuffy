/*
# Add missing rag_search and rag_health_check database functions

The knowledge-rag edge function calls these RPCs but they were never created:
- rag_search: performs pgvector cosine similarity search on knowledge_chunks
- rag_health_check: verifies the vector extension and table are healthy

Both are SECURITY DEFINER so the service-role client can call them.
*/

-- rag_search: returns top-k similar chunks for a query embedding
CREATE OR REPLACE FUNCTION public.rag_search(
  query_embedding vector,
  top_k integer DEFAULT 5,
  p_user_id uuid DEFAULT NULL,
  p_knowledge_base_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  knowledge_base_id uuid,
  chunk_text text,
  page_number integer,
  slide_number integer,
  sheet_name text,
  section text,
  cell_range text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id AS chunk_id,
    kc.document_id,
    kc.knowledge_base_id,
    kc.chunk_text,
    kc.page_number,
    kc.slide_number,
    kc.sheet_name,
    kc.section,
    kc.cell_range,
    (1 - (kc.embedding <=> query_embedding))::double precision AS similarity
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND (p_user_id IS NULL OR kc.user_id = p_user_id)
    AND (p_knowledge_base_ids IS NULL OR kc.knowledge_base_id = ANY(p_knowledge_base_ids))
  ORDER BY kc.embedding <=> query_embedding
  LIMIT LEAST(top_k, 20);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rag_search(vector, integer, uuid, uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rag_search(vector, integer, uuid, uuid[]) TO authenticated;

-- rag_health_check: verifies pgvector extension is available and chunks table is accessible
CREATE OR REPLACE FUNCTION public.rag_health_check()
RETURNS TABLE (
  vector_extension text,
  total_chunks bigint,
  embedded_chunks bigint,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext_exists boolean;
  v_total bigint;
  v_embedded bigint;
BEGIN
  -- Check if vector extension is installed
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) INTO v_ext_exists;

  IF NOT v_ext_exists THEN
    RETURN QUERY SELECT 'not_installed'::text, 0::bigint, 0::bigint, 'error'::text;
    RETURN;
  END IF;

  -- Count total and embedded chunks
  SELECT COUNT(*) INTO v_total FROM knowledge_chunks;
  SELECT COUNT(*) INTO v_embedded FROM knowledge_chunks WHERE embedding IS NOT NULL;

  RETURN QUERY SELECT 'installed'::text, v_total, v_embedded,
    CASE WHEN v_embedded > 0 THEN 'connected'::text ELSE 'empty'::text END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rag_health_check() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rag_health_check() TO authenticated;
