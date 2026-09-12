import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/supabase';
import { HardDrive, Lock, Unlock, ShieldCheck, AlertTriangle, FileText, Clock, Eye, Download, RefreshCw, Filter } from 'lucide-react';

interface BucketInfo {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
  updated_at: string;
}

interface FileMeta {
  id: string;
  bucket_id: string;
  storage_path: string;
  owner_user_id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  upload_date: string;
  retention_days: number;
  retention_expires_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
}

interface StorageSettings {
  allowed_mime_types: string[];
  max_file_size_mb: number;
  default_retention_days: number;
}

const adminApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const days = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 7;
}

export function StorageReview() {
  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterBucket, setFilterBucket] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterRetention, setFilterRetention] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=storage-review`, { method: 'GET', headers });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || `Request failed (${resp.status})`);
      setBuckets(data.buckets ?? []);
      setFiles(data.files ?? []);
      setSettings(data.settings ?? null);
    } catch {
      setError('Could not load storage data. You may need administrator access.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredFiles = files.filter((f) => {
    if (filterBucket && f.bucket_id !== filterBucket) return false;
    if (filterOwner && !f.owner_user_id.includes(filterOwner)) return false;
    if (filterRetention === 'expired' && !isExpired(f.retention_expires_at)) return false;
    if (filterRetention === 'expiring' && !isExpiringSoon(f.retention_expires_at)) return false;
    if (filterRetention === 'active' && (isExpired(f.retention_expires_at) || isExpiringSoon(f.retention_expires_at))) return false;
    return true;
  });

  const bucketNames = Array.from(new Set(files.map((f) => f.bucket_id)));
  const totalSize = files.reduce((sum, f) => sum + f.file_size, 0);
  const expiredCount = files.filter((f) => isExpired(f.retention_expires_at)).length;
  const expiringCount = files.filter((f) => isExpiringSoon(f.retention_expires_at)).length;
  const publicBuckets = buckets.filter((b) => b.public);

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Storage Review"
        description="Admin-only audit of all storage buckets, file ownership, access posture, and retention status."
        actions={
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      {error && (
        <Card className="p-4 mb-4 border-danger/30">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {publicBuckets.length > 0 && (
        <Card className="p-4 mb-4 border-danger/30 bg-danger-soft/10">
          <div className="flex items-start gap-3">
            <Unlock className="h-5 w-5 text-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-danger">Public bucket detected</p>
              <p className="text-xs text-ink-secondary mt-1">
                {publicBuckets.map((b) => b.name).join(', ')} — these buckets allow anonymous public read access. Make them private immediately.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><HardDrive className="h-4 w-4 text-accent" aria-hidden="true" /><p className="label-mono">Buckets</p></div>
          <p className="text-2xl font-semibold">{buckets.length}</p>
          <p className="text-xs text-ink-muted mt-0.5">{publicBuckets.length} public, {buckets.length - publicBuckets.length} private</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-accent" aria-hidden="true" /><p className="label-mono">Files</p></div>
          <p className="text-2xl font-semibold">{files.length}</p>
          <p className="text-xs text-ink-muted mt-0.5">{formatFileSize(totalSize)} total</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-warning" aria-hidden="true" /><p className="label-mono">Expiring</p></div>
          <p className="text-2xl font-semibold text-warning">{expiringCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Within 7 days</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" /><p className="label-mono">Expired</p></div>
          <p className="text-2xl font-semibold text-danger">{expiredCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Past retention</p>
        </Card>
      </div>

      {/* Bucket posture table */}
      <Card className="mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /> Bucket Access Posture</h3>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th scope="col" className="text-left label-mono px-4 py-3">Bucket Name</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Access</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">Created</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">File Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {buckets.map((b) => {
                const fileCount = files.filter((f) => f.bucket_id === b.id).length;
                return (
                  <tr key={b.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-ink-primary">{b.name}</td>
                    <td className="px-4 py-3">
                      {b.public ? (
                        <Badge tone="danger"><Unlock className="h-3 w-3" aria-hidden="true" /> Public</Badge>
                      ) : (
                        <Badge tone="success"><Lock className="h-3 w-3" aria-hidden="true" /> Private</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted hidden md:table-cell">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary hidden md:table-cell">{fileCount}</td>
                  </tr>
                );
              })}
              {buckets.length === 0 && !loading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">No buckets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Storage settings */}
      {settings && (
        <Card className="mb-6 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /> Storage Policies</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="label-mono mb-1">Max File Size</p>
              <p className="text-sm text-ink-primary">{settings.max_file_size_mb} MB</p>
            </div>
            <div>
              <p className="label-mono mb-1">Default Retention</p>
              <p className="text-sm text-ink-primary">{settings.default_retention_days} days</p>
            </div>
            <div>
              <p className="label-mono mb-1">Allowed MIME Types</p>
              <p className="text-xs text-ink-secondary">{settings.allowed_mime_types.length} types allowed</p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={filterBucket} onChange={(e) => setFilterBucket(e.target.value)} className="w-auto min-w-[160px]">
            <option value="">All buckets</option>
            {bucketNames.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <input
            type="text"
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            placeholder="Owner user ID…"
            className="rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm text-ink-primary placeholder:text-ink-faint focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors w-auto min-w-[200px]"
          />
          <Select value={filterRetention} onChange={(e) => setFilterRetention(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All retention</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
          </Select>
          <Badge tone="muted"><Filter className="h-3 w-3" aria-hidden="true" /> {filteredFiles.length} files</Badge>
          <Button variant="ghost" size="sm" onClick={() => { setFilterBucket(''); setFilterOwner(''); setFilterRetention(''); }}>Clear</Button>
        </div>
      </Card>

      {/* File metadata table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border">
          <h3 className="text-sm font-semibold">File Inventory & Retention</h3>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th scope="col" className="text-left label-mono px-4 py-3">Filename</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">Bucket</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Owner</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">Size</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">Uploaded</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Retention</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">Accesses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filteredFiles.map((f) => {
                const expired = isExpired(f.retention_expires_at);
                const expiring = isExpiringSoon(f.retention_expires_at);
                return (
                  <tr key={f.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 text-xs text-ink-primary truncate max-w-[200px]">{f.original_filename}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted hidden md:table-cell">{f.bucket_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">{f.owner_user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary hidden lg:table-cell">{formatFileSize(f.file_size)}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted hidden lg:table-cell">{formatDate(f.upload_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-ink-secondary">{formatDate(f.retention_expires_at)}</span>
                        {expired ? <Badge tone="danger">Expired</Badge>
                          : expiring ? <Badge tone="warning">Expiring</Badge>
                          : <Badge tone="success">Active</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted hidden lg:table-cell">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" aria-hidden="true" /> {f.access_count}</span>
                      {f.last_accessed_at && <span className="text-[10px] text-ink-faint block mt-0.5">{formatDateTime(f.last_accessed_at)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredFiles.length === 0 && !loading && (
          <div className="py-12 text-center"><HardDrive className="h-8 w-8 text-ink-faint mx-auto mb-2" aria-hidden="true" /><p className="text-sm text-ink-muted">No files match your filters.</p></div>
        )}
        {loading && (
          <div className="py-12 text-center"><RefreshCw className="h-6 w-6 text-ink-faint mx-auto mb-2 animate-spin" aria-hidden="true" /><p className="text-sm text-ink-muted">Loading storage data…</p></div>
        )}
      </Card>
    </div>
  );
}
