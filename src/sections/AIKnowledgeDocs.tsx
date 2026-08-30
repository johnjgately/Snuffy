import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, SectionHeader, Badge, Button, Select, EmptyState } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { supabase, getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { KnowledgeDoc, KnowledgeBase } from '@/types';
import {
  FileText, Upload, Loader2, ShieldCheck, AlertTriangle, Check, X,
  RefreshCw, FileSearch, Trash2, Clock,
} from 'lucide-react';

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-rag`;

const CLASSIFICATIONS = ['Public', 'Internal', 'Sensitive', 'Confidential', 'Restricted'];

const SUPPORTED_TYPES = [
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.md', '.odt',
  '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.tsv',
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.heic', '.webp',
  '.json', '.jsonl', '.xml', '.yaml', '.yml',
  '.html', '.htm', '.eml', '.msg',
];

function getFileExt(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusTone = (status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' => {
  const map: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'accent'> = {
    uploaded: 'neutral', parsing: 'accent', ocr: 'accent', extracting: 'accent',
    chunking: 'accent', embedding: 'accent', indexing: 'accent', ready: 'success', failed: 'danger',
  };
  return map[status] ?? 'neutral';
};

export function AIKnowledgeDocs() {
  const { privacyMode, log } = useApp();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedKb, setSelectedKb] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState('Internal');
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const internetDisabled = privacyMode === 'local';

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const fetchBases = useCallback(async () => {
    const { data } = await supabase.from('knowledge_bases').select('*').order('name');
    if (data) setBases(data.map((kb: Record<string, unknown>) => ({
      id: kb.id as string, name: kb.name as string,
      description: (kb.description as string) ?? '', classification: kb.classification as string,
      documentCount: 0, createdAt: kb.created_at as string,
    })));
  }, []);

  const fetchDocs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped: KnowledgeDoc[] = data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          knowledgeBaseId: r.knowledge_base_id as string,
          filename: r.filename as string,
          fileType: r.file_type as string,
          fileSize: r.file_size as number,
          classification: r.classification as string,
          version: r.version as number,
          status: r.status as KnowledgeDoc['status'],
          processingStage: (r.processing_stage as string) ?? null,
          processingError: (r.processing_error as string) ?? null,
          ocrStatus: (r.ocr_status as string) ?? 'not_required',
          ocrConfidence: (r.ocr_confidence as number) ?? null,
          embeddingStatus: (r.embedding_status as string) ?? 'pending',
          chunkCount: r.chunk_count as number,
          pageCount: (r.page_count as number) ?? null,
          uploadedBy: (r.uploaded_by as string) ?? null,
          approved: r.approved as boolean,
          approvedBy: (r.approved_by as string) ?? null,
          approvedAt: (r.approved_at as string) ?? null,
          fileHash: (r.file_hash as string) ?? null,
          storagePath: (r.storage_path as string) ?? null,
          createdAt: r.created_at as string,
        }));
        setDocs(mapped);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBases();
    fetchDocs();
    // Poll for status updates if any docs are processing
    const interval = setInterval(() => {
      if (docs.some((d) => !['ready', 'failed'].includes(d.status))) {
        fetchDocs();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchBases, fetchDocs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedKb) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const ext = getFileExt(file.name);
      if (!SUPPORTED_TYPES.includes(`.${ext}`)) {
        continue;
      }
      try {
        // Compute hash
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

        // Check for duplicates
        const { data: existing } = await supabase
          .from('knowledge_documents')
          .select('id, filename, version')
          .eq('file_hash', hashHex)
          .maybeSingle();

        if (existing) {
          continue;
        }

        // Upload to storage
        const storagePath = `${selectedKb}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('knowledge-files')
          .upload(storagePath, file);

        if (uploadError) continue;

        // Create document record
        const { data: docRecord, error: insertError } = await supabase
          .from('knowledge_documents')
          .insert({
            knowledge_base_id: selectedKb,
            filename: file.name,
            file_type: ext,
            file_size: file.size,
            mime_type: file.type || 'application/octet-stream',
            storage_path: storagePath,
            file_hash: hashHex,
            classification: selectedClass,
            status: 'uploaded',
            uploaded_by: 'Administrator',
          })
          .select('id')
          .single();

        if (insertError || !docRecord) continue;

        log({ action: 'Uploaded knowledge document', target: file.name, section: 'AI Training', severity: 'info' });

        // Trigger processing
        fetch(functionUrl, {
          method: 'POST',
          headers: functionHeaders,
          body: JSON.stringify({ action: 'process', documentId: docRecord.id }),
        }).then(() => fetchDocs());
      } catch { /* ignore */ }
    }
    setUploading(false);
    fetchDocs();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedKb, selectedClass, log, fetchDocs]);

  const approveDoc = async (doc: KnowledgeDoc) => {
    await supabase.from('knowledge_documents').update({
      approved: true,
      approved_by: 'Administrator',
      approved_at: new Date().toISOString(),
    }).eq('id', doc.id);
    log({ action: 'Approved knowledge document', target: doc.filename, section: 'AI Training', severity: 'info' });
    fetchDocs();
  };

  const reprocessDoc = async (doc: KnowledgeDoc) => {
    await supabase.from('knowledge_documents').update({
      status: 'uploaded', processing_stage: null, processing_error: null,
    }).eq('id', doc.id);
    fetch(functionUrl, {
      method: 'POST', headers: functionHeaders,
      body: JSON.stringify({ action: 'process', documentId: doc.id }),
    }).then(() => fetchDocs());
  };

  const deleteDoc = async (doc: KnowledgeDoc) => {
    if (doc.storagePath) {
      await supabase.storage.from('knowledge-files').remove([doc.storagePath]);
    }
    await supabase.from('knowledge_documents').delete().eq('id', doc.id);
    log({ action: 'Deleted knowledge document', target: doc.filename, section: 'AI Training', severity: 'warning' });
    fetchDocs();
  };

  const kbName = (kbId: string) => bases.find((kb) => kb.id === kbId)?.name ?? 'Unknown';

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <SectionHeader
        title="Knowledge Documents"
        description="Upload files to process, extract text, generate embeddings, and index them for AI retrieval. Every document goes through a multi-stage pipeline."
      />

      {internetDisabled && (
        <div className="mb-4 p-3 rounded-lg bg-success-soft/20 border border-success/30 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
          <p className="text-xs text-success font-medium">PRIVATE AI MODE — All processing is local. No content leaves your infrastructure.</p>
        </div>
      )}

      {/* Upload area */}
      <Card className="p-4 mb-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label-mono">Knowledge Base</label>
              <Select value={selectedKb} onChange={(e) => setSelectedKb(e.target.value)} className="mt-1">
                <option value="">Select a knowledge base…</option>
                {bases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="label-mono">Classification</label>
              <Select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="mt-1 w-auto">
                {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div
            role="button"
            tabIndex={selectedKb ? 0 : -1}
            onClick={() => selectedKb && fileInputRef.current?.click()}
            onKeyDown={(e) => { if (selectedKb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fileInputRef.current?.click(); } }}
            aria-label={selectedKb ? 'Upload files to selected knowledge base' : 'Select a knowledge base first'}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
              selectedKb ? 'border-bg-border hover:border-accent/40 hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent/40' : 'border-bg-border opacity-50 cursor-not-allowed'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={SUPPORTED_TYPES.join(',')}
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                <p className="text-sm text-ink-secondary">Uploading and processing…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-ink-faint" aria-hidden="true" />
                <p className="text-sm text-ink-secondary">
                  {selectedKb ? 'Click to upload files' : 'Select a knowledge base first'}
                </p>
                <p className="text-xs text-ink-muted">
                  Supports: PDF, Word, PowerPoint, Excel, CSV, images, JSON, XML, YAML, HTML, email
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No documents uploaded yet"
          description="Select a knowledge base and upload files to start building your local knowledge index."
        />
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-bg-hover border border-bg-border flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-ink-primary truncate">{doc.filename}</p>
                    <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                    <Badge tone="muted">{doc.classification}</Badge>
                    {doc.approved && <Badge tone="success"><Check className="h-2.5 w-2.5" /> Approved</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted flex-wrap">
                    <span>{kbName(doc.knowledgeBaseId)}</span>
                    <span>{formatSize(doc.fileSize)}</span>
                    <span>{doc.chunkCount} chunks</span>
                    {doc.pageCount && <span>{doc.pageCount} pages</span>}
                    <span className="font-mono">{doc.createdAt.slice(11, 19)}</span>
                  </div>
                  {doc.processingStage && !['ready', 'failed'].includes(doc.status) && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-accent">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {doc.processingStage}
                    </div>
                  )}
                  {doc.processingError && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-danger">
                      <AlertTriangle className="h-3 w-3" />
                      {doc.processingError}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!doc.approved && doc.status === 'ready' && (
                    <Button size="sm" variant="outline" onClick={() => approveDoc(doc)} aria-label="Approve document">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {['failed', 'ready'].includes(doc.status) && (
                    <Button size="sm" variant="ghost" onClick={() => reprocessDoc(doc)} aria-label="Reprocess">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <button
                    onClick={() => deleteDoc(doc)}
                    className="p-1.5 text-ink-faint hover:text-danger transition-colors rounded"
                    aria-label="Delete document"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
