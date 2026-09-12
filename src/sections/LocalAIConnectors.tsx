import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Input } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { getAuthHeaders } from '@/lib/supabase';
import {
  Network, Loader2, Plus, CheckCircle2, XCircle, AlertTriangle,
  ShieldCheck, Activity, Clock, User, Trash2, AlertCircle,
} from 'lucide-react';

interface Connector {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  market_id: string | null;
  allowlisted_endpoints: Array<{ endpoint: string; method: string; max_request_size: number; max_response_size: number; timeout_ms: number }>;
  health_status: 'unknown' | 'healthy' | 'unhealthy' | 'degraded';
  health_checked_at: string | null;
  health_error: string | null;
  owner_user_id: string | null;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  review_date: string | null;
}

export function LocalAIConnectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);

  const adminApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=connectors`, { headers });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setConnectors(data.connectors ?? []);
    } catch {
      setError('Could not load connectors.');
    }
    setLoading(false);
  }, [adminApiUrl]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!name.trim() || !endpoint.trim()) {
      setError('Name and at least one endpoint are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=connector-create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          endpoints: [{
            endpoint: endpoint.trim(),
            method: 'POST',
            max_request_size: 10485760,
            max_response_size: 10485760,
            timeout_ms: 30000,
          }],
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setShowAdd(false);
      setName('');
      setDescription('');
      setEndpoint('');
      await load();
    } catch {
      setError('Could not create connector.');
    }
    setSaving(false);
  };

  const handleApprove = async (c: Connector) => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=connector-approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: c.id }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      await load();
    } catch {
      setError('Could not approve connector.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=connector-delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setDeleteTarget(null);
      await load();
    } catch {
      setError('Could not delete connector.');
    }
  };

  const healthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'unhealthy': return <XCircle className="h-4 w-4 text-danger" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-warning" />;
      default: return <Activity className="h-4 w-4 text-ink-faint" />;
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
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-accent" />
            <h1 className="text-xl font-semibold">Local AI Connectors</h1>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Administrator-managed trusted gateways for local AI endpoints. Users cannot enter arbitrary URLs. All requests route through registered, approved connectors.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Register Connector
        </Button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
        <ShieldCheck className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary">
          SSRF protection: Users cannot enter localhost, RFC1918 private IPs, link-local, metadata-service, or loopback addresses. All local AI access is routed through these approved connectors with allowlisted endpoints only.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-soft/20 border border-danger/30">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.length === 0 ? (
          <div className="col-span-2 p-8 text-center panel-base rounded-xl">
            <Network className="h-8 w-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No connectors registered. Register a trusted gateway to enable local AI access.</p>
          </div>
        ) : (
          connectors.map((c) => (
            <div key={c.id} className="panel-base rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {healthIcon(c.health_status)}
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.description && <p className="text-xs text-ink-muted">{c.description}</p>}
                  </div>
                </div>
                {c.approved ? (
                  <Badge tone="success">Approved</Badge>
                ) : (
                  <Badge tone="warning">Pending Approval</Badge>
                )}
              </div>

              <div className="space-y-1">
                {c.allowlisted_endpoints?.map((ep, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="font-mono px-1.5 py-0.5 rounded bg-bg-base border border-bg-border">{ep.method}</span>
                    <span className="font-mono truncate">{ep.endpoint}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-ink-muted">
                {c.health_checked_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(c.health_checked_at).toLocaleDateString()}
                  </span>
                )}
                {c.review_date && (
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" /> Review: {new Date(c.review_date).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-bg-border">
                {!c.approved && (
                  <Button variant="primary" size="sm" onClick={() => handleApprove(c)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Register Local AI Connector"
        titleId="connector-add-title"
        maxWidth="max-w-lg"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">
            Register a trusted gateway connector for a local AI endpoint. Only platform administrators can register and approve connectors.
          </p>
          <label className="block">
            <span className="label-mono">Connector name</span>
            <Input className="mt-1" placeholder="e.g. On-prem LLM Gateway" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="label-mono">Description (optional)</span>
            <Input className="mt-1" placeholder="Purpose and scope of this connector" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block">
            <span className="label-mono">Allowlisted endpoint URL</span>
            <Input className="mt-1" placeholder="https://gateway.internal.example.com/v1/chat" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </label>
          <p className="text-xs text-ink-muted">
            The endpoint must be an explicit URL. Localhost, RFC1918, link-local, and metadata-service addresses are rejected. Requests are validated for method, size, timeout, and allowed model path.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !name.trim() || !endpoint.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Register
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete connector"
        titleId="connector-delete-title"
        maxWidth="max-w-sm"
      >
        <div className="p-5">
          <p className="text-sm text-ink-secondary">
            Are you sure you want to delete the <span className="font-medium text-ink-primary">{deleteTarget?.name}</span> connector? All requests routed through this connector will be denied immediately.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete connector
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
