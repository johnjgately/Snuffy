import { useState, useEffect, useCallback } from 'react';
import { Button, Badge } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { getAuthHeaders } from '@/lib/supabase';
import {
  OctagonAlert, Loader2, ShieldAlert, ShieldCheck, Activity, History,
  AlertTriangle, CheckCircle2, Clock, User, RotateCcw, Power,
} from 'lucide-react';

interface Switch {
  id: string;
  service: string;
  label: string;
  is_stopped: boolean;
  stopped_by: string | null;
  stopped_at: string | null;
  reason: string | null;
  restored_by: string | null;
  restored_at: string | null;
  restored_reason: string | null;
  updated_at: string;
}

interface HistoryEntry {
  id: string;
  service: string;
  action: 'activate' | 'restore';
  actor_user_id: string;
  reason: string;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

const serviceIcons: Record<string, typeof Activity> = {
  ai_requests: Activity,
  web_search: Activity,
  automations: Activity,
  document_uploads: Activity,
  rag_indexing: Activity,
  voice_capture: Activity,
  local_ai_connectors: Activity,
  provider_api_keys: Activity,
  new_sessions: Activity,
  active_sessions: Activity,
  active_requests: Activity,
};

export function EmergencyStop() {
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Switch | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const adminApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;

  const load = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=emergency-stop`, { headers });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setSwitches(data.switches ?? []);
      setHistory(data.history ?? []);
    } catch {
      setError('Could not load emergency stop status.');
    }
    setLoading(false);
  }, [adminApiUrl]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async () => {
    if (!toggleTarget || !reason.trim()) return;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${adminApiUrl}?resource=emergency-stop-toggle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          service: toggleTarget.service,
          activate: !toggleTarget.is_stopped,
          reason: reason.trim(),
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setToggleTarget(null);
      setReason('');
      await load();
    } catch {
      setError('Could not toggle emergency stop.');
    }
    setSubmitting(false);
  };

  const stoppedCount = switches.filter((s) => s.is_stopped).length;

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
            <OctagonAlert className="h-5 w-5 text-danger" />
            <h1 className="text-xl font-semibold">Emergency Stop</h1>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Independently control platform services. Every activation and restoration requires a reason and creates an audit event.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stoppedCount > 0 ? (
            <Badge tone="danger">{stoppedCount} service{stoppedCount > 1 ? 's' : ''} stopped</Badge>
          ) : (
            <Badge tone="success">All services running</Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-soft/20 border border-danger/30">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {stoppedCount > 0 && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-5 w-5 text-danger" />
            <h2 className="text-sm font-semibold text-danger">Emergency Stop Active</h2>
          </div>
          <p className="text-sm text-ink-secondary">
            {stoppedCount} service{stoppedCount > 1 ? 's are' : ' is'} currently stopped. New requests for stopped services will be denied with a maintenance message.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {switches.map((sw) => {
          const Icon = serviceIcons[sw.service] ?? Activity;
          return (
            <div
              key={sw.id}
              className={`p-4 rounded-xl border transition-colors ${
                sw.is_stopped
                  ? 'bg-danger/5 border-danger/30'
                  : 'bg-bg-elevated border-bg-border'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${sw.is_stopped ? 'bg-danger/15' : 'bg-bg-base'}`}>
                    <Icon className={`h-4 w-4 ${sw.is_stopped ? 'text-danger' : 'text-ink-secondary'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{sw.label}</p>
                    <p className="text-xs text-ink-muted font-mono">{sw.service}</p>
                  </div>
                </div>
                {sw.is_stopped ? (
                  <ShieldAlert className="h-4 w-4 text-danger" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-success" />
                )}
              </div>

              <div className="space-y-1 mb-3">
                {sw.is_stopped ? (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock className="h-3 w-3" />
                      <span>Stopped {new Date(sw.stopped_at ?? '').toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <User className="h-3 w-3" />
                      <span>By admin</span>
                    </div>
                    {sw.reason && (
                      <p className="text-xs text-ink-secondary italic mt-1">"{sw.reason}"</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-success">Running normally</p>
                )}
              </div>

              <Button
                variant={sw.is_stopped ? 'primary' : 'danger'}
                size="sm"
                className="w-full"
                onClick={() => { setToggleTarget(sw); setReason(''); }}
              >
                {sw.is_stopped ? (
                  <><RotateCcw className="h-3.5 w-3.5" /> Restore service</>
                ) : (
                  <><Power className="h-3.5 w-3.5" /> Stop service</>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="panel-base rounded-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-border">
          <History className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-semibold">Activation & Restoration History</h2>
        </div>
        <div className="divide-y divide-bg-border">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted text-center">No emergency stop events recorded.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`p-1.5 rounded-lg ${h.action === 'activate' ? 'bg-danger/15' : 'bg-success/15'}`}>
                  {h.action === 'activate' ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-danger" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{h.service}</span>
                    {' '}
                    <span className={h.action === 'activate' ? 'text-danger' : 'text-success'}>
                      {h.action === 'activate' ? 'stopped' : 'restored'}
                    </span>
                  </p>
                  <p className="text-xs text-ink-muted">"{h.reason}"</p>
                </div>
                <span className="text-xs text-ink-faint shrink-0">
                  {new Date(h.occurred_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        open={toggleTarget !== null}
        onClose={() => { setToggleTarget(null); setReason(''); }}
        title={toggleTarget?.is_stopped ? `Restore ${toggleTarget?.label}` : `Stop ${toggleTarget?.label}`}
        titleId="emergency-stop-toggle-title"
        maxWidth="max-w-md"
      >
        <div className="p-5 space-y-4">
          <div className={`p-3 rounded-lg ${toggleTarget?.is_stopped ? 'bg-success/10 border border-success/30' : 'bg-danger/10 border border-danger/30'}`}>
            <p className="text-sm">
              {toggleTarget?.is_stopped
                ? 'Restoring this service will allow new requests. A health check should be performed before re-enabling.'
                : 'Stopping this service will deny all new requests with a maintenance message. Active long-running jobs will be cancelled at the next safe checkpoint.'}
            </p>
          </div>
          <label className="block">
            <span className="label-mono">Reason (required)</span>
            <textarea
              className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
              rows={3}
              placeholder="Explain why this service is being stopped or restored..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setToggleTarget(null); setReason(''); }}>Cancel</Button>
            <Button
              variant={toggleTarget?.is_stopped ? 'primary' : 'danger'}
              size="sm"
              onClick={handleToggle}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                toggleTarget?.is_stopped ? <><RotateCcw className="h-3.5 w-3.5" /> Confirm restore</> : <><Power className="h-3.5 w-3.5" /> Confirm stop</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
