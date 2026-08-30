import { useState } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, Input, Field } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import { ShieldCheck, Lock, Download, Upload, Eye, Trash2, Key, Server, Globe, Database, FileText, Activity, AlertTriangle, History, FileArchive, FlaskConical } from 'lucide-react';

export function SecuritySettings() {
  const { branding, setBranding, demoMode, setDemoMode } = useApp();
  const [showConfirm, setShowConfirm] = useState(false);
  const [retention, setRetention] = useState('90');
  const [encryption, setEncryption] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Security, Privacy & System Settings"
        description="Authentication, encryption, data retention, backups, compliance, and configurable branding."
      />

      {/* Security posture */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Encryption', value: 'AES-256', icon: Lock, tone: 'text-success', sub: 'At rest & in transit' },
          { label: 'MFA enforced', value: mfaRequired ? 'Yes' : 'No', icon: ShieldCheck, tone: mfaRequired ? 'text-success' : 'text-danger', sub: 'All admin roles' },
          { label: 'Session timeout', value: `${sessionTimeout} min`, icon: Activity, tone: 'text-accent', sub: 'Auto-logout' },
          { label: 'Audit retention', value: `${retention} days`, icon: History, tone: 'text-warning', sub: 'Immutable logs' },
        ].map((s) => {
          const Icon = s.icon;
          return <Card key={s.label} className="p-4"><div className="flex items-center justify-between"><Icon className={cn('h-5 w-5', s.tone)} aria-hidden="true" /><Badge tone="success">Active</Badge></div><p className="text-lg font-semibold mt-2">{s.value}</p><p className="label-mono mt-0.5">{s.label}</p><p className="text-xs text-ink-faint mt-0.5">{s.sub}</p></Card>;
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Authentication */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Key className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Authentication & Sessions</h3></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Require MFA for admins</p><p className="text-xs text-ink-muted">Multi-factor authentication</p></div>
              <Toggle checked={mfaRequired} onChange={setMfaRequired} aria-label="Require MFA for admins" />
            </div>
            <Field label="Session timeout (minutes)">
              <Input type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"><History className="h-3.5 w-3.5" aria-hidden="true" /> Active sessions</Button>
              <Button size="sm" variant="danger"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Revoke all sessions</Button>
            </div>
          </div>
        </Card>

        {/* Data & privacy */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Database className="h-4 w-4 text-success" aria-hidden="true" /><h3 className="text-sm font-semibold">Data & Privacy</h3></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Encrypt at rest</p><p className="text-xs text-ink-muted">AES-256 encryption</p></div>
              <Toggle checked={encryption} onChange={setEncryption} aria-label="Encrypt at rest" />
            </div>
            <Field label="Data retention period (days)">
              <Input type="number" value={retention} onChange={(e) => setRetention(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Export all data</Button>
              <Button size="sm" variant="danger" onClick={() => setShowConfirm(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete memory</Button>
            </div>
          </div>
        </Card>

        {/* Backups & recovery */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><FileArchive className="h-4 w-4 text-warning" aria-hidden="true" /><h3 className="text-sm font-semibold">Backups & Recovery</h3></div>
          <div className="space-y-2">
            {[
              { name: 'Full system backup', time: 'Today 03:00', size: '1.2 GB', status: 'success' },
              { name: 'Document archive', time: 'Yesterday 03:00', size: '480 MB', status: 'success' },
              { name: 'Configuration snapshot', time: '3 days ago', size: '12 MB', status: 'success' },
            ].map((b) => (
              <div key={b.name} className="flex items-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border">
                <FileArchive className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                <div className="flex-1"><p className="text-xs text-ink-primary">{b.name}</p><p className="text-xs text-ink-muted font-mono">{b.time} · {b.size}</p></div>
                <Badge tone="success">verified</Badge>
                <Button size="sm" variant="ghost" aria-label="Restore backup"><Upload className="h-3.5 w-3.5" aria-hidden="true" /></Button>
              </div>
            ))}
            <Button size="sm" variant="primary" className="mt-2"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Create backup now</Button>
          </div>
        </Card>

        {/* Compliance */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Legal & Compliance</h3></div>
          <div className="space-y-2">
            {[
              { label: 'Redaction tools', icon: Eye },
              { label: 'Document legal holds', icon: Lock },
              { label: 'Chain-of-custody metadata', icon: FileText },
              { label: 'Immutable audit logs', icon: History },
              { label: 'Exportable review reports', icon: Download },
            ].map((c) => {
              const Icon = c.icon;
              return <div key={c.label} className="flex items-center gap-2 p-2.5 rounded-lg bg-bg-base border border-bg-border"><Icon className="h-3.5 w-3.5 text-success" aria-hidden="true" /><span className="text-xs text-ink-secondary">{c.label}</span><ShieldCheck className="h-3 w-3 text-success ml-auto" aria-hidden="true" /></div>;
            })}
          </div>
        </Card>

        {/* Branding */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Globe className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Configurable Branding</h3></div>
          <div className="space-y-3">
            <Field label="Assistant name"><Input value={branding.name} onChange={(e) => setBranding({ name: e.target.value })} /></Field>
            <Field label="Subtitle"><Input value={branding.subtitle} onChange={(e) => setBranding({ subtitle: e.target.value })} /></Field>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
              <div className="h-8 w-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /></div>
              <div><p className="text-xs text-ink-primary">{branding.name}</p><p className="text-xs text-ink-muted">{branding.subtitle}</p></div>
            </div>
          </div>
        </Card>

        {/* System */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Server className="h-4 w-4 text-ink-secondary" aria-hidden="true" /><h3 className="text-sm font-semibold">System</h3></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Demo mode</p><p className="text-xs text-ink-muted">Use sample data instead of live connections</p></div>
              <Toggle checked={demoMode} onChange={setDemoMode} aria-label="Demo mode" />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
              <FlaskConical className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              <span className="text-xs text-ink-secondary">Version 1.0.0 · Build 2026.08.23</span>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-warning">Snuffy is an assistant — not an autonomous decision-maker. All sensitive or destructive actions require explicit confirmation.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Delete confirmation */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Permanently delete memory?" titleId="delete-memory-title">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">This will permanently delete all stored conversation memory, transcripts, and keyboard history. This action cannot be undone.</p>
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>Cancel</Button><Button variant="danger" size="sm" onClick={() => setShowConfirm(false)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete permanently</Button></div>
        </div>
      </Modal>
    </div>
  );
}
