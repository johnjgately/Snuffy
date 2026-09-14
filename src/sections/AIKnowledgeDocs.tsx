import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, SectionHeader, Badge, Button, Select, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useApp } from '@/state/AppContext';
import { supabase, getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { KnowledgeDoc, KnowledgeBase } from '@/types';
import {
  FileText, Upload, Loader2, ShieldCheck, AlertTriangle, Check, X,
  RefreshCw, FileSearch, Trash2, Clock,
  Shield, ShieldAlert, FileCheck2, FileX2, CheckCircle2,
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

// Quarantine reasons map to a human-readable label and badge tone.
const QUARANTINE_REASONS: Record<string, { label: string; tone: 'warning' | 'danger' }> = {
  malware_scan_pending: { label: 'Malware scan pending', tone: 'warning' },
  malware_detected: { label: 'Malware detected', tone: 'danger' },
  prompt_injection_detected: { label: 'Prompt injection detected', tone: 'danger' },
  classification_pending: { label: 'Classification pending', tone: 'warning' },
};

// A doc is considered quarantined if any scan record is not clean/passed.
type ScanRecord = {
  id: string;
  scan_type: string;
  scan_status: string;
  scan_result: string | null;
  findings: unknown;
  created_at: string;
};

type DocFilter = 'all' | 'quarantined';

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

  // Quarantine + detail modal state
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [quarantineReasons, setQuarantineReasons] = useState<Record<string, string>>({});
  const [detailDoc, setDetailDoc] = useState<KnowledgeDoc | null>(null);
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [rescanning, setRescanning] = useState(false);

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

        // Fetch latest scan records to determine quarantine status per doc.
        const reasons: Record<string, string> = {};
        await Promise.all(mapped.map(async (doc) => {
          const { data: scans } = await supabase
            .from('document_scan_records')
            .select('id, scan_type, scan_status, scan_result, findings, created_at')
            .eq('document_id', doc.id)
            .order('created_at', { ascending: false });
          if (scans && scans.length > 0) {
            // Determine quarantine reason from the most severe recent scan.
            for (const s of scans as ScanRecord[]) {
              if (s.scan_status === 'failed' || s.scan_status === 'threat_found' || s.scan_status === 'flagged') {
                if (s.scan_type === 'malware') {
                  reasons[doc.id] = 'malware_detected';
                  break;
                }
                if (s.scan_type === 'prompt_injection') {
                  reasons[doc.id] = 'prompt_injection_detected';
                  break;
                }
              }
              if (s.scan_status === 'pending' || s.scan_status === 'running') {
                if (s.scan_type === 'malware') {
                  reasons[doc.id] = 'malware_scan_pending';
                  break;
                }
                if (s.scan_type === 'classification') {
                  reasons[doc.id] = 'classification_pending';
                  break;
                }
              }
            }
          } else if (!doc.approved && doc.status === 'ready') {
            // No scan records yet but not approved → classification pending.
            reasons[doc.id] = 'classification_pending';
          }
        }));
        setQuarantineReasons(reasons);
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
            original_filename: file.name,
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

  const rejectDoc = async (doc: KnowledgeDoc) => {
    // Reject = delete from the knowledge base entirely.
    if (doc.storagePath) {
      await supabase.storage.from('knowledge-files').remove([doc.storagePath]);
    }
    await supabase.from('knowledge_documents').delete().eq('id', doc.id);
    log({ action: 'Rejected knowledge document', target: doc.filename, section: 'AI Training', severity: 'warning' });
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

  const rescanDoc = async (doc: KnowledgeDoc) => {
    setRescanning(true);
    try {
      await fetch(functionUrl, {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({ action: 'rescan', documentId: doc.id }),
      });
      log({ action: 'Triggered rescan for knowledge document', target: doc.filename, section: 'AI Training', severity: 'info' });
      await fetchDocs();
      if (detailDoc?.id === doc.id) {
        await loadScanRecords(doc.id);
      }
    } finally {
      setRescanning(false);
    }
  };

  const deleteDoc = async (doc: KnowledgeDoc) => {
    if (doc.storagePath) {
      await supabase.storage.from('knowledge-files').remove([doc.storagePath]);
    }
    await supabase.from('knowledge_documents').delete().eq('id', doc.id);
    log({ action: 'Deleted knowledge document', target: doc.filename, section: 'AI Training', severity: 'warning' });
    fetchDocs();
  };

  const loadScanRecords = useCallback(async (docId: string) => {
    setLoadingScans(true);
    try {
      const { data } = await supabase
        .from('document_scan_records')
        .select('id, scan_type, scan_status, scan_result, findings, created_at')
        .eq('document_id', docId)
        .order('created_at', { ascending: true });
      setScanRecords((data as ScanRecord[]) ?? []);
    } finally {
      setLoadingScans(false);
    }
  }, []);

  const openDetail = useCallback((doc: KnowledgeDoc) => {
    setDetailDoc(doc);
    setScanRecords([]);
    loadScanRecords(doc.id);
  }, [loadScanRecords]);

  const closeDetail = useCallback(() => {
    setDetailDoc(null);
    setScanRecords([]);
  }, []);

  const kbName = (kbId: string) => bases.find((kb) => kb.id === kbId)?.name ?? 'Unknown';

  const quarantinedCount = Object.keys(quarantineReasons).length;
  const visibleDocs = docFilter === 'quarantined'
    ? docs.filter((d) => quarantineReasons[d.id])
    : docs;

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

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setDocFilter('all')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            docFilter === 'all'
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-bg-border bg-bg-base text-ink-secondary hover:text-ink-primary'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          All
          <span className="ml-1 text-ink-muted">{docs.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setDocFilter('quarantined')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            docFilter === 'quarantined'
              ? 'border-warning/40 bg-warning-soft/20 text-warning'
              : 'border-bg-border bg-bg-base text-ink-secondary hover:text-ink-primary'
          )}
          aria-label={`Quarantined documents, ${quarantinedCount} items`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Quarantine
          <span
            className={cn(
              'ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              quarantinedCount > 0 ? 'bg-warning-soft/40 text-warning' : 'bg-bg-hover text-ink-muted'
            )}
          >
            {quarantinedCount}
          </span>
        </button>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
        </div>
      ) : visibleDocs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={docFilter === 'quarantined' ? 'No quarantined documents' : 'No documents uploaded yet'}
          description={docFilter === 'quarantined'
            ? 'Documents flagged during scanning will appear here for review and approval.'
            : 'Select a knowledge base and upload files to start building your local knowledge index.'}
        />
      ) : (
        <div className="space-y-2">
          {visibleDocs.map((doc) => {
            const reason = quarantineReasons[doc.id];
            const reasonMeta = reason ? QUARANTINE_REASONS[reason] : null;
            const passedScanning = doc.status === 'ready' && !reason;
            const needsApproval = passedScanning && !doc.approved;
            return (
              <Card key={doc.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-bg-hover border border-bg-border flex items-center justify-center shrink-0">
                    {reasonMeta ? (
                      <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
                    ) : doc.approved ? (
                      <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <FileText className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-ink-primary truncate">{doc.filename}</p>
                      <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                      <Badge tone="muted">{doc.classification}</Badge>
                      {doc.approved && <Badge tone="success"><Check className="h-2.5 w-2.5" /> Approved</Badge>}
                      {reasonMeta && (
                        <Badge tone={reasonMeta.tone} className="cursor-help">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          Quarantined · {reasonMeta.label}
                        </Badge>
                      )}
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
                    {/* Approve: only for docs that passed scanning but need classification approval */}
                    {needsApproval && (
                      <Button size="sm" variant="outline" onClick={() => approveDoc(doc)} aria-label="Approve document">
                        <FileCheck2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Reject: deletes the document from the knowledge base */}
                    {(reasonMeta || needsApproval) && (
                      <Button size="sm" variant="danger" onClick={() => rejectDoc(doc)} aria-label="Reject and delete document">
                        <FileX2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Rescan: trigger a new scan */}
                    {reasonMeta && (
                      <Button size="sm" variant="ghost" onClick={() => rescanDoc(doc)} aria-label="Rescan document">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Detail modal trigger */}
                    <button
                      onClick={() => openDetail(doc)}
                      className="p-1.5 text-ink-faint hover:text-accent transition-colors rounded"
                      aria-label="View scan details"
                    >
                      <Shield className="h-3.5 w-3.5" />
                    </button>
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
            );
          })}
        </div>
      )}

      {/* Detail modal: scan results, classification, approval chain */}
      <Modal
        open={!!detailDoc}
        onClose={closeDetail}
        title="Document Security & Scan Details"
        titleId="doc-scan-detail-title"
        maxWidth="max-w-2xl"
      >
        {detailDoc && (
          <div className="px-5 py-4 space-y-4">
            {/* Header summary */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-bg-hover border border-bg-border flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-ink-secondary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-primary truncate">{detailDoc.filename}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge tone={statusTone(detailDoc.status)}>{detailDoc.status}</Badge>
                  <Badge tone="muted">{detailDoc.classification}</Badge>
                  {detailDoc.approved ? (
                    <Badge tone="success"><CheckCircle2 className="h-2.5 w-2.5" /> Approved</Badge>
                  ) : quarantineReasons[detailDoc.id] ? (
                    <Badge tone={QUARANTINE_REASONS[quarantineReasons[detailDoc.id]]?.tone ?? 'warning'}>
                      <ShieldAlert className="h-2.5 w-2.5" />
                      Quarantined
                    </Badge>
                  ) : (
                    <Badge tone="warning">Awaiting approval</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Scan summary tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ScanSummaryTile
                label="Malware scan"
                records={scanRecords}
                scanType="malware"
              />
              <ScanSummaryTile
                label="Prompt injection scan"
                records={scanRecords}
                scanType="prompt_injection"
              />
            </div>

            {/* Classification */}
            <div className="rounded-lg border border-bg-border bg-bg-base p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileSearch className="h-3.5 w-3.5 text-ink-secondary" />
                <span className="label-mono">Classification</span>
              </div>
              <p className="text-sm text-ink-primary">{detailDoc.classification}</p>
            </div>

            {/* Approval chain */}
            <div className="rounded-lg border border-bg-border bg-bg-base p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-ink-secondary" />
                <span className="label-mono">Approval chain</span>
              </div>
              {detailDoc.approved ? (
                <div className="space-y-1 text-xs text-ink-secondary">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-success" />
                    <span>Approved by <span className="text-ink-primary font-medium">{detailDoc.approvedBy ?? 'Administrator'}</span></span>
                  </div>
                  {detailDoc.approvedAt && (
                    <div className="flex items-center gap-2 text-ink-muted">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(detailDoc.approvedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Not yet approved. Document requires classification approval before it can be served for retrieval.</p>
              )}
            </div>

            {/* Scan records table */}
            <div className="rounded-lg border border-bg-border bg-bg-base p-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-3.5 w-3.5 text-ink-secondary" />
                <span className="label-mono">Scan records</span>
              </div>
              {loadingScans ? (
                <div className="flex items-center gap-2 text-xs text-ink-muted py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading scan records…
                </div>
              ) : scanRecords.length === 0 ? (
                <p className="text-xs text-ink-muted py-2">No scan records found. Run a rescan to populate results.</p>
              ) : (
                <div className="space-y-1.5">
                  {scanRecords.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-bg-border last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <ScanStatusIcon status={s.scan_status} />
                        <span className="text-ink-secondary capitalize">{s.scan_type.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-ink-muted font-mono">{s.scan_status}</span>
                        {s.scan_result && (
                          <Badge tone={scanResultTone(s.scan_status)}>{s.scan_result}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rescanDoc(detailDoc)}
                disabled={rescanning}
                aria-label="Rescan document"
              >
                {rescanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Rescan
              </Button>
              {!detailDoc.approved && (
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => { rejectDoc(detailDoc); closeDetail(); }}
                    aria-label="Reject and delete document"
                  >
                    <FileX2 className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => { approveDoc(detailDoc); closeDetail(); }}
                    aria-label="Approve document"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- helpers for the detail modal ---------- */

function scanResultTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'passed' || status === 'clean') return 'success';
  if (status === 'pending' || status === 'running') return 'warning';
  if (status === 'failed' || status === 'threat_found' || status === 'flagged') return 'danger';
  return 'neutral';
}

function ScanStatusIcon({ status }: { status: string }) {
  if (status === 'passed' || status === 'clean') return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === 'failed' || status === 'threat_found' || status === 'flagged') return <ShieldAlert className="h-3.5 w-3.5 text-danger" />;
  if (status === 'pending' || status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />;
  return <Shield className="h-3.5 w-3.5 text-ink-muted" />;
}

function ScanSummaryTile({
  label,
  records,
  scanType,
}: {
  label: string;
  records: ScanRecord[];
  scanType: string;
}) {
  const latest = records.find((r) => r.scan_type === scanType);
  const status = latest?.scan_status ?? 'none';
  const tone = scanResultTone(status);
  const toneClass: Record<string, string> = {
    success: 'border-success/30 bg-success-soft/10',
    warning: 'border-warning/30 bg-warning-soft/10',
    danger: 'border-danger/30 bg-danger-soft/10',
    neutral: 'border-bg-border bg-bg-base',
  };
  return (
    <div className={cn('rounded-lg border p-3', toneClass[tone])}>
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <ScanStatusIcon status={status} />
      </div>
      <p className="text-sm text-ink-primary mt-1 capitalize">
        {status === 'none' ? 'Not scanned' : status.replace(/_/g, ' ')}
      </p>
      {latest?.scan_result && (
        <p className="text-xs text-ink-muted mt-0.5">{latest.scan_result}</p>
      )}
    </div>
  );
}
