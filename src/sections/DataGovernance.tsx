import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Input } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { getAuthHeaders } from '@/lib/supabase';
import {
  Scale, Loader2, ShieldCheck, Lock, Archive, FileDown, Clock,
  AlertTriangle, AlertCircle, Gavel, FileText, Database,
} from 'lucide-react';

interface Classification {
  id: string;
  level: string;
  label: string;
  description: string | null;
  retention_days: number | null;
}

interface LegalHold {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  placed_by: string | null;
  placed_at: string;
  released_at: string | null;
  release_reason: string | null;
}

interface ExportRequest {
  id: string;
  requested_by: string;
  scope: string;
  entity_type: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  download_url_expires_at: string | null;
}

interface RetentionPolicy {
  id: string;
  entity_type: string;
  organization_id: string | null;
  market_id: string | null;
  retention_days: number;
}

export function DataGovernance() {
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [exports, setExports] = useState<ExportRequest[]>([]);
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHold, setShowHold] = useState(false);
  const [holdEntityType, setHoldEntityType] = useState('documents');
  const [holdEntityId, setHoldEntityId] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [saving, setSaving] = useState(false);

  const adminApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const [cls, hlds, exps, pols] = await Promise.all([
        fetch(`${adminApiUrl}?resource=data-classifications`, { headers }).then((r) => r.json()),
        fetch(`${adminApiUrl}?resource=legal-holds`, { headers }).then((r) => r.json()),
        fetch(`${adminApiUrl}?resource=export-requests`, { headers }).then((r) => r.json()),
        fetch(`${adminApiUrl}?resource=retention-policies`, { headers }).then((r) => r.json()),
      ]);
      setClassifications(cls.classifications ?? []);
      setHolds(hlds.holds ?? []);
      setExports(exps.exports ?? []);
      setPolicies(pols.policies ?? []);
    } catch {
      setError('Could not load governance data.');
    }
    setLoading(false);
  }, [adminApiUrl]);

  useEffect(() => { load(); }, [load]);

  const handlePlaceHold = async () => {
    if (!holdEntityId.trim() || !holdReason.trim()) {
      setError('Entity ID and reason are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=legal-hold-place`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entity_type: holdEntityType,
          entity_id: holdEntityId.trim(),
          reason: holdReason.trim(),
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setShowHold(false);
      setHoldEntityId('');
      setHoldReason('');
      await load();
    } catch {
      setError('Could not place legal hold.');
    }
    setSaving(false);
  };

  const handleReleaseHold = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=legal-hold-release`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, reason: 'Released by administrator' }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      await load();
    } catch {
      setError('Could not release legal hold.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold">Data Governance</h1>
        </div>
        <p className="text-sm text-ink-muted mt-1">
          Data classifications, retention policies, legal holds, and export management. Ensures compliance with data governance requirements.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-soft/20 border border-danger/30">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Data Classifications */}
      <div className="panel-base rounded-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
          <Lock className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-semibold">Data Classifications</h2>
        </div>
        <div className="divide-y divide-bg-border">
          {classifications.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.level === 'restricted' ? 'danger' : c.level === 'confidential' ? 'warning' : c.level === 'internal' ? 'accent' : 'success'}>
                    {c.label}
                  </Badge>
                </div>
                {c.description && <p className="text-xs text-ink-muted mt-1">{c.description}</p>}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <Clock className="h-3 w-3" />
                <span>{c.retention_days ? `${c.retention_days} days retention` : 'No retention limit'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal Holds */}
      <div className="panel-base rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-danger" />
            <h2 className="text-sm font-semibold">Legal Holds</h2>
          </div>
          <Button variant="danger" size="sm" onClick={() => setShowHold(true)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Place Hold
          </Button>
        </div>
        <div className="divide-y divide-bg-border">
          {holds.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted text-center">No active legal holds.</p>
          ) : (
            holds.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={h.released_at ? 'success' : 'danger'}>
                      {h.released_at ? 'Released' : 'Active'}
                    </Badge>
                    <span className="text-sm font-medium">{h.entity_type}</span>
                    <span className="text-xs text-ink-muted font-mono">{h.entity_id.slice(0, 8)}…</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-1">"{h.reason}" — {new Date(h.placed_at).toLocaleDateString()}</p>
                </div>
                {!h.released_at && (
                  <Button variant="ghost" size="sm" onClick={() => handleReleaseHold(h.id)}>
                    Release
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Retention Policies */}
      <div className="panel-base rounded-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
          <Archive className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-semibold">Retention Policies</h2>
        </div>
        <div className="divide-y divide-bg-border">
          {policies.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted text-center">No custom retention policies configured. Default classifications apply.</p>
          ) : (
            policies.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-ink-muted" />
                  <span className="text-sm font-medium">{p.entity_type}</span>
                  {p.organization_id && <Badge tone="accent">Org-specific</Badge>}
                </div>
                <span className="text-xs text-ink-muted">{p.retention_days} days</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Export Requests */}
      <div className="panel-base rounded-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
          <FileDown className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-semibold">Export Requests</h2>
        </div>
        <div className="divide-y divide-bg-border">
          {exports.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted text-center">No export requests recorded.</p>
          ) : (
            exports.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === 'completed' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'}>
                      {e.status}
                    </Badge>
                    <span className="text-sm">{e.scope}</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                </div>
                {e.download_url_expires_at && new Date(e.download_url_expires_at) > new Date() && (
                  <span className="text-xs text-success">Link active</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        open={showHold}
        onClose={() => setShowHold(false)}
        title="Place Legal Hold"
        titleId="legal-hold-title"
        maxWidth="max-w-md"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-ink-secondary">
              Held data cannot be deleted or purged by normal retention processes. The hold must be explicitly released.
            </p>
          </div>
          <label className="block">
            <span className="label-mono">Entity type</span>
            <select className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm" value={holdEntityType} onChange={(e) => setHoldEntityType(e.target.value)}>
              <option value="documents">Documents</option>
              <option value="knowledge_documents">Knowledge Documents</option>
              <option value="automations">Automations</option>
              <option value="audit_logs">Audit Logs</option>
            </select>
          </label>
          <label className="block">
            <span className="label-mono">Entity ID</span>
            <Input className="mt-1" placeholder="UUID of the record" value={holdEntityId} onChange={(e) => setHoldEntityId(e.target.value)} />
          </label>
          <label className="block">
            <span className="label-mono">Reason</span>
            <textarea className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm resize-none" rows={3} placeholder="Legal or compliance reason for the hold" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowHold(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handlePlaceHold} disabled={saving || !holdEntityId.trim() || !holdReason.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />} Place Hold
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
