/*
# Create AI Knowledge & Training Center Tables (Phase 1 — Local Knowledge / RAG)

1. Extension
- Enable `vector` (pgvector) for embedding storage and similarity search.

2. New Tables
- `knowledge_bases`: Collections of approved documents for RAG retrieval.
  - id, name, description, classification, created_at, updated_at
- `knowledge_documents`: Uploaded files processed for the knowledge base.
  - id, knowledge_base_id, filename, file_type, file_size, mime_type,
    storage_path, file_hash, classification, version, status (uploaded/parsing/ocr/extracting/chunking/embedding/indexing/ready/failed),
    processing_stage, processing_error, ocr_status, ocr_confidence,
    embedding_status, chunk_count, page_count, uploaded_by, approved, approved_by, approved_at,
    effective_date, superseded_date, created_at, updated_at
- `knowledge_chunks`: Individual text chunks with embeddings for vector search.
  - id, document_id, knowledge_base_id, chunk_index, chunk_text,
    page_number, slide_number, sheet_name, section, cell_range,
    embedding (vector(1024)), metadata (jsonb), created_at
- `knowledge_settings`: Single-row config for embedding model and vector search.
  - id, embedding_provider, embedding_model, embedding_endpoint, embedding_dim,
    vector_provider, chunk_size, chunk_overlap, created_at, updated_at

3. Security
- Enable RLS on all tables.
- `knowledge_bases`: anon+authenticated full CRUD (shared, no per-user isolation in this app).
- `knowledge_documents`: anon+authenticated full CRUD.
- `knowledge_chunks`: anon+authenticated full CRUD + SELECT for RAG retrieval.
- `knowledge_settings`: anon+authenticated full CRUD.

4. Important Notes
- The vector dimension is 1024 by default (Ollama nomic-embed-text / bge-large).
  If a different embedding model is used, the column can be recreated.
- File content is stored in Supabase Storage bucket `knowledge-files`.
- All processing (parsing, OCR, embeddings) happens server-side in the edge function.
  No external API calls are made when private/offline mode is active.
- Duplicate detection uses file_hash (SHA-256).
- Classification defaults: Public, Internal, Sensitive, Confidential, Restricted.
*/

CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  classification text NOT NULL DEFAULT 'Internal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_knowledge_bases" ON knowledge_bases;
CREATE POLICY "anon_select_knowledge_bases" ON knowledge_bases FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_knowledge_bases" ON knowledge_bases;
CREATE POLICY "anon_insert_knowledge_bases" ON knowledge_bases FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_knowledge_bases" ON knowledge_bases;
CREATE POLICY "anon_update_knowledge_bases" ON knowledge_bases FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_knowledge_bases" ON knowledge_bases;
CREATE POLICY "anon_delete_knowledge_bases" ON knowledge_bases FOR DELETE
  TO anon, authenticated USING (true);

-- Knowledge Documents
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  storage_path text,
  file_hash text,
  classification text NOT NULL DEFAULT 'Internal',
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'uploaded',
  processing_stage text,
  processing_error text,
  ocr_status text DEFAULT 'not_required',
  ocr_confidence real,
  embedding_status text DEFAULT 'pending',
  chunk_count integer NOT NULL DEFAULT 0,
  page_count integer DEFAULT 0,
  uploaded_by text,
  approved boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  effective_date date,
  superseded_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_knowledge_documents" ON knowledge_documents;
CREATE POLICY "anon_select_knowledge_documents" ON knowledge_documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_knowledge_documents" ON knowledge_documents;
CREATE POLICY "anon_insert_knowledge_documents" ON knowledge_documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_knowledge_documents" ON knowledge_documents;
CREATE POLICY "anon_update_knowledge_documents" ON knowledge_documents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_knowledge_documents" ON knowledge_documents;
CREATE POLICY "anon_delete_knowledge_documents" ON knowledge_documents FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS knowledge_documents_kb_idx ON knowledge_documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_hash_idx ON knowledge_documents (file_hash);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON knowledge_documents (status);

-- Knowledge Chunks (with vector embeddings)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  page_number integer,
  slide_number integer,
  sheet_name text,
  section text,
  cell_range text,
  embedding vector(1024),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "anon_select_knowledge_chunks" ON knowledge_chunks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "anon_insert_knowledge_chunks" ON knowledge_chunks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "anon_update_knowledge_chunks" ON knowledge_chunks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "anon_delete_knowledge_chunks" ON knowledge_chunks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx ON knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_kb_idx ON knowledge_chunks (knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Knowledge Settings (single-row config)
CREATE TABLE IF NOT EXISTS knowledge_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding_provider text NOT NULL DEFAULT 'ollama',
  embedding_model text NOT NULL DEFAULT 'nomic-embed-text',
  embedding_endpoint text NOT NULL DEFAULT 'http://localhost:11434',
  embedding_dim integer NOT NULL DEFAULT 1024,
  vector_provider text NOT NULL DEFAULT 'pgvector',
  chunk_size integer NOT NULL DEFAULT 512,
  chunk_overlap integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_knowledge_settings" ON knowledge_settings;
CREATE POLICY "anon_select_knowledge_settings" ON knowledge_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_knowledge_settings" ON knowledge_settings;
CREATE POLICY "anon_insert_knowledge_settings" ON knowledge_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_knowledge_settings" ON knowledge_settings;
CREATE POLICY "anon_update_knowledge_settings" ON knowledge_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_knowledge_settings" ON knowledge_settings;
CREATE POLICY "anon_delete_knowledge_settings" ON knowledge_settings FOR DELETE
  TO anon, authenticated USING (true);

-- Storage bucket for knowledge files
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "knowledge_files_read" ON storage.objects;
CREATE POLICY "knowledge_files_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'knowledge-files');

DROP POLICY IF EXISTS "knowledge_files_insert" ON storage.objects;
CREATE POLICY "knowledge_files_insert" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'knowledge-files');

DROP POLICY IF EXISTS "knowledge_files_update" ON storage.objects;
CREATE POLICY "knowledge_files_update" ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'knowledge-files')
  WITH CHECK (bucket_id = 'knowledge-files');

DROP POLICY IF EXISTS "knowledge_files_delete" ON storage.objects;
CREATE POLICY "knowledge_files_delete" ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'knowledge-files');
