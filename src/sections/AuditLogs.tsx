import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/supabase';
import { ScrollText, Search, Download, ShieldCheck, Lock, FileArchive, Filter, RefreshCw, AlertTriangle } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  record_owner_user_id: string | null;
  file_path: string | null;
  outcome: 'success' | 'denied' | 'failed';
  request_id: string | null;
  source_ip: string | null;
  metadata: Record<string, unknown>;
}

const outcomeTone: Record<string, 'success' | 'warning' | 'danger'> = {
  success: 'success',
  denied: 'danger',
  failed: 'warning',
};
const outcomeDot: Record<string, string> = {
  success: 'bg-success',
  denied: 'bg-danger',
  failed: 'bg-warning',
};

const adminApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [filterEntityId, setFilterEntityId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ resource: 'audit-logs' });
      if (filterAction) params.set('action', filterAction);
      if (filterEntityType) params.set('entity_type', filterEntityType);
      if (filterOutcome) params.set('outcome', filterOutcome);
      if (filterActor) params.set('actor', filterActor);
      if (filterEntityId) params.set('entity_id', filterEntityId);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      params.set('limit', '500');

      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?${params}`, { method: 'GET', headers });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || `Request failed (${resp.status})`);
      setLogs(data.logs ?? []);
    } catch {
      setError('Could not load audit logs. You may need administrator access.');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEntityType, filterOutcome, filterActor, filterEntityId, fromDate, toDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.actor_display_name ?? '').toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q) ||
      (e.entity_type ?? '').toLowerCase().includes(q) ||
      (e.entity_id ?? '').toLowerCase().includes(q) ||
      (e.file_path ?? '').toLowerCase().includes(q)
    );
  });

  const entityTypes = Array.from(new Set(logs.map((e) => e.entity_type).filter(Boolean))) as string[];
  const actions = Array.from(new Set(logs.map((e) => e.action))) as string[];

  const exportReport = () => {
    setExporting(true);
    try {
      const headers = ['Timestamp', 'Actor', 'Actor ID', 'Action', 'Entity Type', 'Entity ID', 'Outcome', 'File Path', 'Source IP', 'Request ID', 'Metadata'];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = filtered.map((e) => [
        e.occurred_at,
        e.actor_display_name ?? '',
        e.actor_user_id ?? '',
        e.action,
        e.entity_type ?? '',
        e.entity_id ?? '',
        e.outcome,
        e.file_path ?? '',
        e.source_ip ?? '',
        e.request_id ?? '',
        JSON.stringify(e.metadata ?? {}),
      ].map(escape).join(','));
      const csv = [headers.map(escape).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Activity & Audit Logs"
        description="Immutable, server-side audit trail of every action across the system. Records are append-only and cannot be edited or deleted."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Button variant="primary" onClick={exportReport} disabled={exporting || filtered.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      {/* Compliance banner */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 flex items-center gap-3"><Lock className="h-5 w-5 text-success" aria-hidden="true" /><div><p className="text-sm font-medium">Immutable</p><p className="text-xs text-ink-muted">Append-only, no edits or deletes</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-sm font-medium">Server-side</p><p className="text-xs text-ink-muted">Written by database triggers & API</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><FileArchive className="h-5 w-5 text-warning" aria-hidden="true" /><div><p className="text-sm font-medium">Admin-only</p><p className="text-xs text-ink-muted">Access restricted to administrators</p></div></Card>
      </div>

      {error && (
        <Card className="p-4 mb-4 border-danger/30">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, action, entity…" className="pl-8" />
          </div>
          <Select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All entity types</option>
            {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)} className="w-auto min-w-[120px]">
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto min-w-[140px]" aria-label="From date" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto min-w-[140px]" aria-label="To date" />
          <Badge tone="muted"><Filter className="h-3 w-3" aria-hidden="true" /> {filtered.length} entries</Badge>
        </div>
        {/* Advanced filters */}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-bg-border">
          <Input value={filterActor} onChange={(e) => setFilterActor(e.target.value)} placeholder="Actor user ID…" className="w-auto min-w-[200px] text-xs" />
          <Input value={filterEntityId} onChange={(e) => setFilterEntityId(e.target.value)} placeholder="Entity ID…" className="w-auto min-w-[200px] text-xs" />
          <Button variant="ghost" size="sm" onClick={() => { setFilterAction(''); setFilterEntityType(''); setFilterOutcome(''); setFilterActor(''); setFilterEntityId(''); setFromDate(''); setToDate(''); setSearch(''); }}>
            Clear filters
          </Button>
        </div>
      </Card>

      {/* Log table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th scope="col" className="text-left label-mono px-4 py-3">Timestamp</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Actor</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Action</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">Entity</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">File Path</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">Source IP</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted whitespace-nowrap">{formatTime(e.occurred_at)}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {e.actor_display_name ?? (e.actor_user_id ? e.actor_user_id.slice(0, 8) + '…' : 'System')}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-primary font-mono">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary hidden md:table-cell">
                    {e.entity_type ? (
                      <span className="flex flex-col gap-0.5">
                        <span>{e.entity_type}</span>
                        {e.entity_id && <span className="font-mono text-ink-faint text-[10px]">{e.entity_id.slice(0, 8)}…</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint hidden lg:table-cell max-w-[200px] truncate">{e.file_path ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint hidden lg:table-cell">{e.source_ip ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 rounded-full', outcomeDot[e.outcome])} />
                      <Badge tone={outcomeTone[e.outcome]}>{e.outcome}</Badge>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="py-12 text-center"><ScrollText className="h-8 w-8 text-ink-faint mx-auto mb-2" aria-hidden="true" /><p className="text-sm text-ink-muted">No audit entries match your filters.</p></div>
        )}
        {loading && (
          <div className="py-12 text-center"><RefreshCw className="h-6 w-6 text-ink-faint mx-auto mb-2 animate-spin" aria-hidden="true" /><p className="text-sm text-ink-muted">Loading audit logs…</p></div>
        )}
      </Card>
    </div>
  );
}
