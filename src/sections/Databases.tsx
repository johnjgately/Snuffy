import { useState } from 'react';
import { Card, SectionHeader, Badge, Button, StatusDot, Select } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoDatabases } from '@/data/demo';
import { Database, Plus, ShieldCheck, RefreshCw, Lock, Table2, Activity } from 'lucide-react';

const statusTone = { connected: 'success', disconnected: 'muted', error: 'danger' } as const;
const accessTone = { 'read-only': 'success', 'read-write': 'warning', admin: 'danger' } as const;

export function Databases() {
  const [showAdd, setShowAdd] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Database Connections"
        description="Connect to multiple databases with configurable access levels. Read-only is the default. Sensitive operations require approval."
        actions={<Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add Connection</Button>}
      />

      {/* Access policy banner */}
      <Card className="mb-4 p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-success-soft/30 border border-success/30 flex items-center justify-center"><ShieldCheck className="h-4.5 w-4.5 text-success" aria-hidden="true" /></div>
        <div className="flex-1">
          <p className="text-sm font-medium">Access policy: read-only by default</p>
          <p className="text-xs text-ink-muted">Any write, update, or deletion requires explicit user approval before execution.</p>
        </div>
        <Badge tone="success">{demoDatabases.filter((d) => d.access === 'read-only').length} read-only</Badge>
        <Badge tone="warning">{demoDatabases.filter((d) => d.access === 'read-write').length} read-write</Badge>
        <Badge tone="danger">{demoDatabases.filter((d) => d.access === 'admin').length} admin</Badge>
      </Card>

      {showAdd && (
        <Card className="mb-4 p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-3">New Database Connection</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block"><span className="label-mono">Type</span><Select className="mt-1"><option>PostgreSQL</option><option>MySQL</option><option>SQLite</option><option>MongoDB</option><option>MS SQL Server</option><option>Supabase</option><option>Firebase</option><option>REST API</option></Select></label>
            <label className="block"><span className="label-mono">Name</span><input className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm" placeholder="My Database" /></label>
            <label className="block"><span className="label-mono">Host</span><input className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm" placeholder="host:port" /></label>
            <label className="block"><span className="label-mono">Access level</span><Select className="mt-1"><option>read-only (default)</option><option>read-write</option><option>admin</option></Select></label>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={() => setShowAdd(false)}>Test & save</Button></div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {demoDatabases.map((db) => (
          <Card key={db.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center"><Database className="h-4.5 w-4.5 text-accent" aria-hidden="true" /></div>
                <div>
                  <p className="text-sm font-medium">{db.name}</p>
                  <p className="text-xs text-ink-muted font-mono">{db.type}</p>
                </div>
              </div>
              <StatusDot tone={statusTone[db.status]} label={db.status} />
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span className="text-ink-muted">Host</span><span className="font-mono text-ink-secondary truncate max-w-[160px]">{db.host}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-muted">Tables</span><span className="text-ink-secondary">{db.tables}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-muted">Last checked</span><span className="text-ink-secondary">{db.lastChecked}</span></div>
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-bg-border">
              <Badge tone={accessTone[db.access]}><Lock className="h-2.5 w-2.5" aria-hidden="true" /> {db.access}</Badge>
              <Badge tone={statusTone[db.status] === 'success' ? 'success' : statusTone[db.status] === 'danger' ? 'danger' : 'muted'}>{db.status}</Badge>
            </div>

            <div className="flex gap-1.5 mt-3">
              <Button size="sm" variant="outline" className="flex-1"><Table2 className="h-3.5 w-3.5" aria-hidden="true" /> Query</Button>
              <Button size="sm" variant="ghost" aria-label="Refresh connection"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /></Button>
              {db.access !== 'read-only' && (
                <Button size="sm" variant="ghost" aria-label="Connection actions" onClick={() => setPendingAction(db.id)}><Activity className="h-3.5 w-3.5" aria-hidden="true" /></Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Approval modal */}
      <Modal open={pendingAction !== null} onClose={() => setPendingAction(null)} title="Approval required" titleId="db-approval-title">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">This connection has write access. Any update, deletion, or schema change must be reviewed and approved before execution.</p>
          <div className="mt-3 p-3 rounded-lg bg-bg-base border border-bg-border text-xs font-mono text-ink-secondary">
            Proposed: SELECT * FROM deployments WHERE status = 'active';
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" size="sm" onClick={() => setPendingAction(null)}>Cancel</Button><Button variant="primary" size="sm" onClick={() => setPendingAction(null)}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Approve</Button></div>
        </div>
      </Modal>
    </div>
  );
}
