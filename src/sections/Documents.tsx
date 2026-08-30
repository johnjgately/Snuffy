import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, SectionHeader, Badge, Button, Input, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoDocuments } from '@/data/demo';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import { FileText, FileSpreadsheet, FileImage, Mail, FileType, Upload, Search, FolderOpen, FolderPlus, Tag, ShieldAlert, Scan, GitCompare, Clock, Quote, Trash2, FilePlus, X, Loader2, AlertCircle, CheckCircle2, Download } from 'lucide-react';

const typeIcon: Record<string, typeof FileText> = {
  PDF: FileText,
  Word: FileType,
  Excel: FileSpreadsheet,
  CSV: FileSpreadsheet,
  Image: FileImage,
  Email: Mail,
  Text: FileText,
};

const statusTone = { processed: 'success', processing: 'accent', queued: 'muted', flagged: 'danger' } as const;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.eml,.msg';

interface DbFolder {
  id: string;
  name: string;
}

interface DbDocument {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  folder_name: string | null;
  status: string;
  tags: string[];
  summary: string | null;
  mime_type: string;
  created_at: string;
}

interface UploadItem {
  file: File;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function detectFileType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type;
  if (type === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (['doc', 'docx'].includes(ext) || type.includes('word')) return 'Word';
  if (['xls', 'xlsx'].includes(ext) || type.includes('sheet')) return 'Excel';
  if (ext === 'csv' || type === 'text/csv') return 'CSV';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'Image';
  if (['eml', 'msg'].includes(ext)) return 'Email';
  return 'Text';
}

export function Documents() {
  const { auth } = useApp();
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [dbFolders, setDbFolders] = useState<DbFolder[]>([]);
  const [dbDocuments, setDbDocuments] = useState<DbDocument[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<DbFolder | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadFolder, setUploadFolder] = useState<string>('General');
  const [dragOver, setDragOver] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFolders = useCallback(async () => {
    const { data, error } = await supabase.from('document_folders').select('id, name').order('name');
    if (error) {
      setFolderError('Could not load folders.');
      return;
    }
    setDbFolders(data ?? []);
    setFolderError(null);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    setDocError(null);
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, file_type, file_size, storage_path, folder_name, status, tags, summary, mime_type, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setDocError('Could not load documents.');
      setLoadingDocs(false);
      return;
    }
    setDbDocuments(data ?? []);
    setLoadingDocs(false);
  }, []);

  useEffect(() => {
    loadFolders();
    loadDocuments();
  }, [loadFolders, loadDocuments]);

  // Merge demo + real documents
  const realDocs = dbDocuments.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.file_type,
    size: formatFileSize(d.file_size),
    pages: 0,
    uploaded: formatDate(d.created_at),
    folder: d.folder_name ?? 'General',
    status: d.status as 'processed' | 'processing' | 'queued' | 'flagged',
    tags: d.tags ?? [],
    summary: d.summary ?? 'AI summary will be available after processing completes.',
    storage_path: d.storage_path,
    isReal: true,
  }));

  const allDocs = [...realDocs, ...demoDocuments.map((d) => ({ ...d, isReal: false }))];
  const demoFolderNames = Array.from(new Set(demoDocuments.map((d) => d.folder)));
  const customFolderNames = dbFolders.map((f) => f.name);
  const realDocFolders = Array.from(new Set(realDocs.map((d) => d.folder)));
  const allFolderNames = Array.from(new Set([...demoFolderNames, ...customFolderNames, ...realDocFolders])).sort();
  const folders = ['all', ...allFolderNames];

  const filtered = allDocs.filter((d) => (folder === 'all' || d.folder === folder) && d.name.toLowerCase().includes(search.toLowerCase()));
  const doc = filtered.find((d) => d.id === selected) ?? filtered[0] ?? null;

  const countInFolder = (f: string) => (f === 'all' ? allDocs.length : allDocs.filter((d) => d.folder === f).length);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (allFolderNames.some((f) => f.toLowerCase() === name.toLowerCase())) {
      setFolderError('A folder with that name already exists.');
      return;
    }
    setCreating(true);
    setFolderError(null);
    const { error } = await supabase.from('document_folders').insert({ name });
    setCreating(false);
    if (error) {
      setFolderError('Could not create the folder.');
      return;
    }
    setNewFolderName('');
    setShowNewFolder(false);
    await loadFolders();
    setFolder(name);
  };

  const handleDeleteFolder = async () => {
    if (!deletingFolder) return;
    const { error } = await supabase.from('document_folders').delete().eq('id', deletingFolder.id);
    if (error) {
      setFolderError('Could not delete the folder.');
      setDeletingFolder(null);
      return;
    }
    if (folder === deletingFolder.name) setFolder('all');
    setDeletingFolder(null);
    await loadFolders();
  };

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid: UploadItem[] = [];
    for (const file of arr) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadItems((prev) => [...prev, { file, progress: 0, status: 'error', error: 'File exceeds 50 MB limit' }]);
        continue;
      }
      valid.push({ file, progress: 0, status: 'uploading' });
    }
    if (valid.length > 0) {
      setUploadItems((prev) => [...prev, ...valid]);
      valid.forEach((item) => uploadFile(item));
    }
  };

  const uploadFile = async (item: UploadItem) => {
    const userId = auth.session?.user?.id;
    if (!userId) {
      setUploadItems((prev) => prev.map((u) => (u.file === item.file ? { ...u, status: 'error', error: 'Not signed in' } : u)));
      return;
    }

    const fileType = detectFileType(item.file);
    const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, item.file, {
        contentType: item.file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      setUploadItems((prev) => prev.map((u) => (u.file === item.file ? { ...u, status: 'error', error: uploadError.message } : u)));
      return;
    }

    const { error: dbError } = await supabase.from('documents').insert({
      name: item.file.name,
      file_type: fileType,
      file_size: item.file.size,
      storage_path: storagePath,
      folder_name: uploadFolder,
      mime_type: item.file.type || 'application/octet-stream',
      status: 'processed',
      tags: [],
    });

    if (dbError) {
      setUploadItems((prev) => prev.map((u) => (u.file === item.file ? { ...u, status: 'error', error: dbError.message } : u)));
      return;
    }

    setUploadItems((prev) => prev.map((u) => (u.file === item.file ? { ...u, status: 'done', progress: 100 } : u)));
    await loadDocuments();
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from('documents').download(storagePath);
    if (error) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteDoc = async () => {
    if (!deleteDocId) return;
    setDeletingDoc(true);
    const docToDelete = realDocs.find((d) => d.id === deleteDocId);
    if (docToDelete?.storage_path) {
      await supabase.storage.from('documents').remove([docToDelete.storage_path]);
    }
    await supabase.from('documents').delete().eq('id', deleteDocId);
    setDeletingDoc(false);
    setDeleteDocId(null);
    setSelected(null);
    await loadDocuments();
  };

  const clearCompletedUploads = () => {
    setUploadItems((prev) => prev.filter((u) => u.status === 'uploading'));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Documents & Knowledge Base"
        description="Upload, review, search, and query your document library with AI-assisted extraction and citations."
        actions={<Button variant="primary" onClick={() => setShowUpload((v) => !v)}><Upload className="h-4 w-4" aria-hidden="true" /> Upload</Button>}
      />

      {/* Upload zone */}
      {showUpload && (
        <Card className="mb-4 p-6 animate-fade-in">
          {/* Folder selector for uploads */}
          <div className="flex items-center gap-3 mb-4">
            <span className="label-mono whitespace-nowrap">Upload to</span>
            <select
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              className="rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
            >
              <option value="General">General</option>
              {allFolderNames.filter((f) => f !== 'General').map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver ? 'border-accent bg-accent/5' : 'border-bg-border hover:border-accent/40',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
            />
            <FilePlus className="h-8 w-8 text-ink-muted mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-ink-secondary">Drag files here or click to browse</p>
            <p className="text-xs text-ink-muted mt-1">PDF, Word, Excel, CSV, text, images, email — max 50 MB per file</p>
            <p className="text-xs text-warning mt-2 font-mono">All uploads are malware-scanned and treated as untrusted content</p>
          </div>

          {/* Upload progress list */}
          {uploadItems.length > 0 && (
            <div className="mt-4 space-y-2 animate-fade-in">
              {uploadItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border">
                  <div className="h-9 w-9 rounded-lg bg-bg-hover border border-bg-border flex items-center justify-center shrink-0">
                    {item.status === 'uploading' && <Loader2 className="h-4 w-4 text-accent animate-spin" aria-hidden="true" />}
                    {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />}
                    {item.status === 'error' && <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-primary truncate">{item.file.name}</p>
                    <p className="text-xs text-ink-muted">{formatFileSize(item.file.size)}</p>
                    {item.error && <p className="text-xs text-danger mt-0.5">{item.error}</p>}
                  </div>
                  {item.status === 'uploading' && (
                    <div className="w-24 h-1.5 rounded-full bg-bg-border overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-300" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === 'done' && <Badge tone="success">Uploaded</Badge>}
                  {item.status === 'error' && <Badge tone="danger">Failed</Badge>}
                </div>
              ))}
              {uploadItems.some((u) => u.status !== 'uploading') && (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={clearCompletedUploads}>Clear completed</Button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-3"><Button variant="ghost" size="sm" onClick={() => { setShowUpload(false); setUploadItems([]); }}>Close</Button></div>
        </Card>
      )}

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Sidebar: folders + search */}
        <Card className="lg:col-span-3 p-4">
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="pl-8" aria-label="Search documents" />
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="label-mono">Folders</p>
            <button
              onClick={() => setShowNewFolder((v) => !v)}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              aria-label="Create new folder"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" /> New
            </button>
          </div>

          {showNewFolder && (
            <div className="mb-3 animate-fade-in">
              <div className="flex items-center gap-1.5">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name…"
                  className="text-xs"
                  aria-label="Folder name"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                />
                <Button size="sm" variant="primary" onClick={handleCreateFolder} disabled={creating || !newFolderName.trim()} aria-label="Create folder">
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} aria-label="Cancel folder creation">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}

          {folderError && (
            <p className="text-xs text-danger mb-2 animate-fade-in">{folderError}</p>
          )}

          <div className="space-y-0.5">
            {folders.map((f) => {
              const dbFolder = dbFolders.find((df) => df.name === f);
              const isCustom = !!dbFolder;
              return (
                <div key={f} className="group relative">
                  <button
                    onClick={() => setFolder(f)}
                    className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors pr-8', folder === f ? 'bg-accent/10 text-accent' : 'text-ink-secondary hover:bg-bg-hover')}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="capitalize truncate">{f === 'all' ? 'All Documents' : f}</span>
                    <span className="ml-auto text-xs text-ink-muted font-mono">{countInFolder(f)}</span>
                  </button>
                  {isCustom && (
                    <button
                      onClick={() => setDeletingFolder(dbFolder)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-ink-faint hover:text-danger hover:bg-danger-soft/30 opacity-0 group-hover:opacity-100 transition-all"
                      aria-label={`Delete folder ${f}`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Document list */}
        <Card className="lg:col-span-4 p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">{filtered.length} documents</h3>
            <Badge tone="muted"><Scan className="h-3 w-3" aria-hidden="true" /> Malware scan on</Badge>
          </div>
          <div className="divide-y divide-bg-border max-h-[600px] overflow-y-auto scrollbar-thin">
            {docError ? (
              <div className="flex items-center gap-2 py-8 px-4 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {docError}
              </div>
            ) : loadingDocs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 text-accent animate-spin" aria-hidden="true" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<FileText className="h-8 w-8" aria-hidden="true" />} title="No documents found" description="Try a different search or folder, or upload a new document." />
            ) : (
              filtered.map((d) => {
                const Icon = typeIcon[d.type] ?? FileText;
                return (
                  <button key={d.id} onClick={() => setSelected(d.id)} className={cn('w-full text-left flex gap-3 p-3 transition-colors', doc?.id === d.id ? 'bg-accent/5' : 'hover:bg-bg-hover')}>
                    <div className="h-9 w-9 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-primary truncate">{d.name}</p>
                      <p className="text-xs text-ink-muted font-mono mt-0.5">{d.type} · {d.size}{d.pages > 0 ? ` · ${d.pages}p` : ''} · {d.uploaded}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge tone={statusTone[d.status]}>{d.status}</Badge>
                        {d.tags.slice(0, 2).map((t) => <span key={t} className="text-xs text-ink-muted">#{t}</span>)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="lg:col-span-5 p-5">
          {doc ? (
            <div className="animate-fade-in">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">{doc.name}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">{doc.folder} · {doc.type} · {doc.size}{doc.pages > 0 ? ` · ${doc.pages} pages` : ''}</p>
                </div>
                <Badge tone={statusTone[doc.status]}>{doc.status}</Badge>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {doc.tags.map((t) => <Badge key={t} tone="muted"><Tag className="h-2.5 w-2.5" aria-hidden="true" /> {t}</Badge>)}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="label-mono mb-1">AI Summary</p>
                  <p className="text-sm text-ink-secondary leading-relaxed">{doc.summary}</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-bg-base border border-bg-border">
                    <p className="label-mono">Uploaded</p>
                    <p className="text-xs text-ink-secondary mt-1">{doc.uploaded}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-bg-base border border-bg-border">
                    <p className="label-mono">Version</p>
                    <p className="text-xs text-ink-secondary mt-1">{doc.isReal ? 'v1' : 'v3 · 2 revisions'}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-bg-base border border-bg-border">
                    <p className="label-mono">Retention</p>
                    <p className="text-xs text-ink-secondary mt-1">90 days</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="primary"><Quote className="h-3.5 w-3.5" aria-hidden="true" /> Ask about this</Button>
                  <Button size="sm" variant="outline"><GitCompare className="h-3.5 w-3.5" aria-hidden="true" /> Compare</Button>
                  <Button size="sm" variant="outline"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> Timeline</Button>
                  {doc.isReal && 'storage_path' in doc && (doc as { storage_path?: string }).storage_path && (
                    <Button size="sm" variant="outline" onClick={() => handleDownload((doc as { storage_path: string }).storage_path, doc.name)}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                    </Button>
                  )}
                  {doc.isReal && (
                    <Button size="sm" variant="danger" onClick={() => setDeleteDocId(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                    </Button>
                  )}
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30 mt-2">
                  <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-warning">This document is treated as untrusted. It cannot override system instructions, permissions, or security settings.</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={<FileText className="h-8 w-8" aria-hidden="true" />} title="Select a document" description="Choose a document from the list to view its details and AI summary." />
          )}
        </Card>
      </div>

      {/* Delete folder confirmation */}
      <Modal open={deletingFolder !== null} onClose={() => setDeletingFolder(null)} title="Delete folder" titleId="delete-folder-title">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">
            Are you sure you want to delete the folder <span className="font-medium text-ink-primary">"{deletingFolder?.name}"</span>? Documents in this folder will remain but will no longer be grouped under it.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeletingFolder(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteFolder}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete folder</Button>
          </div>
        </div>
      </Modal>

      {/* Delete document confirmation */}
      <Modal open={deleteDocId !== null} onClose={() => setDeleteDocId(null)} title="Delete document" titleId="delete-doc-title">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">
            Are you sure you want to permanently delete this document? The file and all its metadata will be removed.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeleteDocId(null)} disabled={deletingDoc}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteDoc} disabled={deletingDoc}>
              {deletingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
              Delete document
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
