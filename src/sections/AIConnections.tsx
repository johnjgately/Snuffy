import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, StatusDot, Toggle, Input, Select } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoAIConnections } from '@/data/demo';
import { useApp } from '@/state/AppContext';
import { supabase, getAuthHeaders } from '@/lib/supabase';
import { cn, formatNumber, formatCost } from '@/lib/utils';
import type { AIConnection } from '@/types';
import { Plus, ShieldCheck, Key, Zap, Cloud, HardDrive, AlertTriangle, TrendingUp, DollarSign, Trash2, Loader2, Pencil } from 'lucide-react';

const statusTone = { healthy: 'success', degraded: 'warning', offline: 'danger' } as const;

interface ConnForm {
  type: string;
  name: string;
  endpoint: string;
  apiKey: string;
  models: string;
}

const typeOptions = [
  { label: 'Cloud (OpenAI)', kind: 'cloud' as const, provider: 'OpenAI', defaultEndpoint: 'https://api.openai.com', defaultModel: 'gpt-4o-mini' },
  { label: 'Cloud (Anthropic)', kind: 'cloud' as const, provider: 'Anthropic', defaultEndpoint: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022' },
  { label: 'Cloud (Google)', kind: 'cloud' as const, provider: 'Google', defaultEndpoint: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash' },
  { label: 'Local (Ollama)', kind: 'local' as const, provider: 'Ollama', defaultEndpoint: 'http://localhost:11434', defaultModel: 'llama3.1:8b' },
  { label: 'Local (LM Studio)', kind: 'local' as const, provider: 'LM Studio', defaultEndpoint: 'http://localhost:1234', defaultModel: 'local-model' },
  { label: 'Local (vLLM)', kind: 'local' as const, provider: 'vLLM', defaultEndpoint: 'http://localhost:8000', defaultModel: 'meta-llama/Llama-3.1-8B-Instruct' },
  { label: 'OpenAI-compatible', kind: 'cloud' as const, provider: 'OpenAI-compatible', defaultEndpoint: 'https://api.example.com', defaultModel: 'gpt-4o-mini' },
];

function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `${key.slice(0, 2)}••••${key.slice(-2)}`;
}

function findTypeLabel(provider: string): string {
  const opt = typeOptions.find((o) => o.provider === provider);
  return opt?.label ?? typeOptions[0].label;
}

const emptyForm: ConnForm = { type: typeOptions[0].label, name: '', endpoint: '', apiKey: '', models: '' };

export function AIConnections() {
  const { privacyMode } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [connections, setConnections] = useState<AIConnection[]>(demoAIConnections);
  const [spendingLimit, setSpendingLimit] = useState(200);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [newConn, setNewConn] = useState<ConnForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ConnForm>(emptyForm);

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const loadConnections = useCallback(async () => {
    const { data, error } = await supabase
      .from('ai_connections')
      .select('id, name, kind, provider, endpoint, models, enabled, status, usage_tokens, usage_cost, key_masked, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setError('Could not load saved connections.');
      return;
    }
    const mapped: AIConnection[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as 'cloud' | 'local',
      provider: r.provider as string,
      endpoint: r.endpoint as string,
      models: (r.models as string[]) ?? [],
      enabled: r.enabled as boolean,
      status: r.status as 'healthy' | 'degraded' | 'offline',
      usageTokens: r.usage_tokens as number,
      usageCost: Number(r.usage_cost),
      keyMasked: (r.key_masked as string) ?? undefined,
    }));
    setConnections([...mapped, ...demoAIConnections]);
    setError(null);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadConnections();
      setLoading(false);
    })();
  }, [loadConnections]);

  const totalCost = connections.reduce((s, c) => s + c.usageCost, 0);
  const totalTokens = connections.reduce((s, c) => s + c.usageTokens, 0);
  const limitPct = (totalCost / spendingLimit) * 100;

  const toggle = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (!conn) return;
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
    const { error } = await supabase.from('ai_connections').update({ enabled: !conn.enabled }).eq('id', id);
    if (error) {
      setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: conn.enabled } : c)));
      setError('Could not update the connection. Please try again.');
    }
  };

  const testConnection = async (id: string) => {
    setTestingId(id);
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: 'Testing…' } }));
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({ action: 'test', connectionId: id }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: data.error || `Test failed (${resp.status})` } }));
        await supabase.from('ai_connections').update({ status: 'degraded' }).eq('id', id);
        await loadConnections();
      } else {
        setTestResult((prev) => ({ ...prev, [id]: { ok: true, message: 'Connection healthy!' } }));
        await loadConnections();
      }
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: 'Network error — could not reach the server.' } }));
    }
    setTestingId(null);
  };

  const handleAdd = async () => {
    const opt = typeOptions.find((o) => o.label === newConn.type)!;
    if (!newConn.name.trim() || !newConn.endpoint.trim()) {
      setError('Name and endpoint are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const endpoint = newConn.endpoint.trim() || opt.defaultEndpoint;
    const models = newConn.models.trim() ? newConn.models.split(',').map((m) => m.trim()).filter(Boolean) : [opt.defaultModel];
    const row = {
      name: newConn.name.trim(),
      kind: opt.kind,
      provider: opt.provider,
      endpoint,
      models,
      enabled: true,
      status: 'offline' as const,
      usage_tokens: 0,
      usage_cost: 0,
      key_masked: newConn.apiKey ? maskKey(newConn.apiKey) : null,
      api_key: newConn.apiKey || null,
    };
    const { data, error: insertError } = await supabase.from('ai_connections').insert(row).select('id').single();
    setSaving(false);
    if (insertError) {
      setError('Could not save the connection. Please try again.');
      return;
    }
    const newConnection: AIConnection = {
      id: data.id,
      name: row.name,
      kind: row.kind,
      provider: row.provider,
      endpoint: row.endpoint,
      models: row.models,
      enabled: row.enabled,
      status: row.status,
      usageTokens: 0,
      usageCost: 0,
      keyMasked: row.key_masked ?? undefined,
    };
    setConnections((prev) => [newConnection, ...prev]);
    setNewConn(emptyForm);
    setShowAdd(false);
    await testConnection(data.id);
  };

  const openEdit = (conn: AIConnection) => {
    setEditingId(conn.id);
    setEditForm({
      type: findTypeLabel(conn.provider),
      name: conn.name,
      endpoint: conn.endpoint,
      apiKey: '',
      models: conn.models.join(', '),
    });
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const opt = typeOptions.find((o) => o.label === editForm.type)!;
    if (!editForm.name.trim() || !editForm.endpoint.trim()) {
      setError('Name and endpoint are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const models = editForm.models.trim() ? editForm.models.split(',').map((m) => m.trim()).filter(Boolean) : [opt.defaultModel];
    const update: Record<string, unknown> = {
      name: editForm.name.trim(),
      kind: opt.kind,
      provider: opt.provider,
      endpoint: editForm.endpoint.trim(),
      models,
    };
    if (editForm.apiKey.trim()) {
      update.api_key = editForm.apiKey.trim();
      update.key_masked = maskKey(editForm.apiKey.trim());
    }
    const { error: updateError } = await supabase.from('ai_connections').update(update).eq('id', editingId);
    setSaving(false);
    if (updateError) {
      setError('Could not update the connection. Please try again.');
      return;
    }
    setEditingId(null);
    setEditForm(emptyForm);
    await loadConnections();
    await testConnection(editingId);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('ai_connections').delete().eq('id', id);
    if (error) {
      setError('Could not delete the connection. Please try again.');
      await loadConnections();
    }
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="AI & Local Server Connections"
        description="Manage cloud AI providers and local/self-hosted servers. API keys are stored securely and never exposed in the browser."
        actions={<Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add Connection</Button>}
      />

      {error && (
        <Card className="mb-4 p-3 border-danger/40 flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-danger hover:text-danger/70" aria-label="Dismiss error"><span className="text-xs">Dismiss</span></button>
        </Card>
      )}

      {/* Usage dashboard */}
      <div className="grid lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between"><div className="h-8 w-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-accent" aria-hidden="true" /></div><Badge tone="accent">{connections.filter((c) => c.enabled).length} active</Badge></div>
          <p className="text-2xl font-semibold mt-3">{formatNumber(totalTokens)}</p>
          <p className="label-mono mt-0.5">Total tokens</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><div className="h-8 w-8 rounded-lg bg-success-soft/30 border border-success/30 flex items-center justify-center"><DollarSign className="h-4 w-4 text-success" aria-hidden="true" /></div><Badge tone={limitPct > 80 ? 'danger' : 'success'}>{limitPct.toFixed(0)}% of limit</Badge></div>
          <p className="text-2xl font-semibold mt-3">{formatCost(totalCost)}</p>
          <p className="label-mono mt-0.5">Spending</p>
          <div className="h-1 rounded-full bg-bg-base mt-2 overflow-hidden"><div className={cn('h-full rounded-full', limitPct > 80 ? 'bg-danger' : 'bg-success')} style={{ width: `${Math.min(100, limitPct)}%` }} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><div className="h-8 w-8 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center"><ShieldCheck className="h-4 w-4 text-ink-secondary" aria-hidden="true" /></div></div>
          <p className="text-2xl font-semibold mt-3">{formatCost(spendingLimit)}</p>
          <p className="label-mono mt-0.5">Monthly limit</p>
          <div className="flex items-center gap-1 mt-2"><Input type="number" value={spendingLimit} onChange={(e) => setSpendingLimit(Number(e.target.value))} className="h-7 text-xs" aria-label="Monthly spending limit in USD" /><span className="text-xs text-ink-muted">USD</span></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><div className="h-8 w-8 rounded-lg bg-warning-soft/30 border border-warning/30 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /></div></div>
          <p className="text-2xl font-semibold mt-3">$50</p>
          <p className="label-mono mt-0.5">Alert threshold</p>
          <p className="text-xs text-ink-muted mt-1">Notify at 75% of limit</p>
        </Card>
      </div>

      {showAdd && (
        <Card className="mb-4 p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-3">Add AI Connection</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block"><span className="label-mono">Type</span><Select className="mt-1" value={newConn.type} onChange={(e) => { const opt = typeOptions.find((o) => o.label === e.target.value)!; setNewConn((p) => ({ ...p, type: e.target.value, endpoint: p.endpoint || opt.defaultEndpoint })); }}>{typeOptions.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Name</span><Input className="mt-1" placeholder="My AI Connection" value={newConn.name} onChange={(e) => setNewConn((p) => ({ ...p, name: e.target.value }))} /></label>
            <label className="block"><span className="label-mono">Endpoint</span><Input className="mt-1" placeholder="http://host:port" value={newConn.endpoint} onChange={(e) => setNewConn((p) => ({ ...p, endpoint: e.target.value }))} /></label>
            <label className="block"><span className="label-mono">API key</span><Input type="password" className="mt-1" placeholder="Stored securely, never shown" value={newConn.apiKey} onChange={(e) => setNewConn((p) => ({ ...p, apiKey: e.target.value }))} /></label>
          </div>
          <label className="block mt-3"><span className="label-mono">Models (comma-separated)</span><Input className="mt-1" placeholder="gemini-2.0-flash, gemini-2.5-pro" value={newConn.models} onChange={(e) => setNewConn((p) => ({ ...p, models: e.target.value }))} /></label>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setNewConn(emptyForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Test & save'}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-12 text-center"><p className="text-sm text-ink-muted">Loading connections…</p></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {connections.map((c) => {
            const Icon = c.kind === 'cloud' ? Cloud : HardDrive;
            const blockedByPrivacy = privacyMode === 'local' && c.kind === 'cloud' && c.enabled;
            const isCustom = !demoAIConnections.some((d) => d.id === c.id);
            const result = testResult[c.id];
            return (
              <Card key={c.id} className={cn('p-4', !c.enabled && 'opacity-60')}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center"><Icon className={cn('h-4.5 w-4.5', c.kind === 'cloud' ? 'text-accent' : 'text-success')} aria-hidden="true" /></div>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-ink-muted font-mono">{c.provider}</p>
                    </div>
                  </div>
                  <Toggle checked={c.enabled} onChange={() => toggle(c.id)} aria-label={`Toggle ${c.name}`} />
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between"><span className="text-ink-muted">Endpoint</span><span className="font-mono text-ink-secondary truncate max-w-[150px]">{c.endpoint}</span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-muted">API key</span>
                    <button onClick={() => setShowKey(showKey === c.id ? null : c.id)} aria-label="Reveal API key" className="flex items-center gap-1 text-ink-secondary hover:text-ink-primary"><Key className="h-3 w-3" aria-hidden="true" /><span className="font-mono">{c.keyMasked && showKey === c.id ? c.keyMasked : '••••••••'}</span></button>
                  </div>
                  <div className="flex items-center justify-between"><span className="text-ink-muted">Usage</span><span className="font-mono text-ink-secondary">{formatNumber(c.usageTokens)} tok · {formatCost(c.usageCost)}</span></div>
                </div>

                {c.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.models.slice(0, 3).map((m) => <Badge key={m} tone="muted">{m}</Badge>)}
                  </div>
                )}

                {result && (
                  <div className={cn('mt-2 p-2 rounded-lg text-xs animate-fade-in', result.ok ? 'bg-success-soft/20 text-success' : 'bg-danger-soft/20 text-danger')}>
                    {result.message}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-bg-border">
                  <Badge tone={statusTone[c.status]}><StatusDot tone={statusTone[c.status] === 'success' ? 'success' : statusTone[c.status] === 'warning' ? 'warning' : 'danger'} label={c.status} /> {c.status}</Badge>
                  {blockedByPrivacy && <Badge tone="warning"><ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" /> blocked by local mode</Badge>}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" aria-label="Test connection" onClick={() => testConnection(c.id)} disabled={testingId === c.id}>
                      {testingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}
                    </Button>
                    {isCustom && <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>}
                    {isCustom && <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setDeletingId(c.id)}><Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" /></Button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal open={editingId !== null} onClose={() => { setEditingId(null); setEditForm(emptyForm); }} title="Edit Connection" titleId="edit-conn-title" maxWidth="max-w-lg">
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label-mono">Type</span><Select className="mt-1" value={editForm.type} onChange={(e) => { const opt = typeOptions.find((o) => o.label === e.target.value)!; setEditForm((p) => ({ ...p, type: e.target.value, endpoint: p.endpoint || opt.defaultEndpoint })); }}>{typeOptions.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Name</span><Input className="mt-1" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></label>
            <label className="block"><span className="label-mono">Endpoint</span><Input className="mt-1" value={editForm.endpoint} onChange={(e) => setEditForm((p) => ({ ...p, endpoint: e.target.value }))} /></label>
            <label className="block"><span className="label-mono">API key</span><Input type="password" className="mt-1" placeholder="Leave blank to keep existing key" value={editForm.apiKey} onChange={(e) => setEditForm((p) => ({ ...p, apiKey: e.target.value }))} /></label>
          </div>
          <label className="block"><span className="label-mono">Models (comma-separated)</span><Input className="mt-1" placeholder="gemini-2.0-flash, gemini-2.5-pro" value={editForm.models} onChange={(e) => setEditForm((p) => ({ ...p, models: e.target.value }))} /></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditForm(emptyForm); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleEditSave} disabled={saving}>{saving ? 'Saving…' : 'Save & test'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)} title="Delete connection?" titleId="delete-conn-title" maxWidth="max-w-sm">
        <div className="p-5">
          <p className="text-sm text-ink-secondary mb-4">This will permanently remove the connection. This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => deletingId && handleDelete(deletingId)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
