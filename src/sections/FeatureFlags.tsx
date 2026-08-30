import { useState } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, Input, Select } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoFeatureFlags } from '@/data/demo';
import type { FeatureFlag, Role } from '@/types';
import { cn } from '@/lib/utils';
import { Flag, Plus, Users, Building2, FlaskConical, History, ShieldCheck, Globe, Box, Server, Cloud, Check } from 'lucide-react';

const envMeta = [
  { key: 'dev', label: 'Dev', icon: FlaskConical },
  { key: 'test', label: 'Test', icon: Box },
  { key: 'staging', label: 'Staging', icon: Server },
  { key: 'prod', label: 'Prod', icon: Cloud },
] as const;

const categoryTone: Record<string, 'accent' | 'success' | 'warning' | 'danger' | 'muted'> = {
  AI: 'accent', Data: 'success', Documents: 'warning', Voice: 'accent', Keyboard: 'warning', Integrations: 'muted', Automation: 'success', Research: 'muted', Experimental: 'danger',
};

const categories = ['AI', 'Data', 'Documents', 'Voice', 'Keyboard', 'Integrations', 'Automation', 'Research', 'Experimental'];

const allRoles: Role[] = ['Administrator', 'Operator', 'Analyst', 'Auditor', 'Viewer'];

const emptyForm = {
  name: '',
  key: '',
  category: 'AI',
  description: '',
  global: false,
  dev: true,
  test: true,
  staging: false,
  prod: false,
  roles: ['Administrator'] as Role[],
};

export function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>(demoFeatureFlags);
  const [selected, setSelected] = useState(demoFeatureFlags[0]?.id ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const flag = flags.find((f) => f.id === selected) ?? flags[0];
  const toggleEnv = (id: string, env: 'dev' | 'test' | 'staging' | 'prod') => {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: { ...f.enabled, [env]: !f.enabled[env] }, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), updatedBy: 'Commander Reyes' } : f)));
  };
  const toggleGlobal = (id: string) => {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: { ...f.enabled, global: !f.enabled.global }, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '), updatedBy: 'Commander Reyes' } : f)));
  };

  const closeModal = () => {
    setShowAdd(false);
    setForm(emptyForm);
    setError('');
  };

  const handleAdd = () => {
    const name = form.name.trim();
    const key = form.key.trim();
    if (!name) { setError('Flag name is required.'); return; }
    if (!key) { setError('Flag key is required.'); return; }
    if (flags.some((f) => f.key === key)) { setError('A flag with this key already exists.'); return; }

    const id = `f${Date.now()}`;
    const newFlag: FeatureFlag = {
      id,
      key,
      name,
      description: form.description.trim() || `Feature flag for ${name}.`,
      category: form.category,
      enabled: {
        global: form.global,
        dev: form.dev,
        test: form.test,
        staging: form.staging,
        prod: form.prod,
      },
      roles: form.roles,
      testGroups: [],
      users: [],
      tenants: [],
      updatedBy: 'Commander Reyes',
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    setFlags((prev) => [...prev, newFlag]);
    setSelected(id);
    closeModal();
  };

  const toggleRole = (role: Role) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Feature Flag Management"
        description="Safely enable, disable, test, and roll back individual capabilities across environments, roles, users, and tenants — without redeploying."
        actions={<Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> New Flag</Button>}
      />

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Flag list */}
        <Card className="lg:col-span-5 p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2"><Flag className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Flags ({flags.length})</h3></div>
          <div className="divide-y divide-bg-border max-h-[600px] overflow-y-auto scrollbar-thin">
            {flags.map((f) => (
              <button key={f.id} onClick={() => setSelected(f.id)} className={cn('w-full text-left p-3 flex items-center gap-3 transition-colors', flag?.id === f.id ? 'bg-accent/5' : 'hover:bg-bg-hover')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-ink-primary truncate">{f.name}</p>
                    <Badge tone={categoryTone[f.category]}>{f.category}</Badge>
                  </div>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">{f.key}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {envMeta.map((e) => <span key={e.key} className={cn('h-1.5 w-1.5 rounded-full', f.enabled[e.key] ? 'bg-success' : 'bg-ink-faint')} title={`${e.label}: ${f.enabled[e.key] ? 'on' : 'off'}`} />)}
                  <Toggle checked={f.enabled.global} onChange={() => toggleGlobal(f.id)} aria-label={`Toggle ${f.name} global`} />
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Flag detail */}
        <Card className="lg:col-span-7 p-5">
          {flag && (
            <div className="animate-fade-in">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold">{flag.name}</h3>
                  <p className="text-xs text-ink-muted mt-0.5 font-mono">{flag.key}</p>
                </div>
                <Badge tone={categoryTone[flag.category]}>{flag.category}</Badge>
              </div>
              <p className="text-sm text-ink-secondary mb-4">{flag.description}</p>

              {/* Global */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border mb-4">
                <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-accent" aria-hidden="true" /><div><p className="text-sm text-ink-primary">Global</p><p className="text-xs text-ink-muted">Master switch for all environments</p></div></div>
                <Toggle checked={flag.enabled.global} onChange={() => toggleGlobal(flag.id)} aria-label="Toggle global" />
              </div>

              {/* Environments */}
              <p className="label-mono mb-2">Environments</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {envMeta.map((e) => {
                  const Icon = e.icon;
                  return (
                    <div key={e.key} className={cn('p-3 rounded-lg border text-center', flag.enabled[e.key] ? 'bg-success-soft/20 border-success/30' : 'bg-bg-base border-bg-border')}>
                      <Icon className={cn('h-5 w-5 mx-auto mb-1', flag.enabled[e.key] ? 'text-success' : 'text-ink-faint')} aria-hidden="true" />
                      <p className="text-xs text-ink-secondary">{e.label}</p>
                      <div className="mt-2 flex justify-center"><Toggle checked={flag.enabled[e.key]} onChange={() => toggleEnv(flag.id, e.key)} aria-label={`Toggle ${e.label} environment`} /></div>
                    </div>
                  );
                })}
              </div>

              {/* Roles */}
              <p className="label-mono mb-2">Role-based controls</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {flag.roles.map((r) => <Badge key={r} tone="accent"><Users className="h-2.5 w-2.5" aria-hidden="true" /> {r}</Badge>)}
              </div>

              {/* Test groups + users + tenants */}
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                  <p className="label-mono mb-1">Test groups</p>
                  <div className="flex flex-wrap gap-1">{flag.testGroups.length ? flag.testGroups.map((g) => <Badge key={g} tone="warning"><FlaskConical className="h-2.5 w-2.5" aria-hidden="true" /> {g}</Badge>) : <span className="text-xs text-ink-faint">None</span>}</div>
                </div>
                <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                  <p className="label-mono mb-1">Individual users</p>
                  <div className="flex flex-wrap gap-1">{flag.users.length ? flag.users.map((u) => <Badge key={u} tone="muted">{u}</Badge>) : <span className="text-xs text-ink-faint">None</span>}</div>
                </div>
                <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                  <p className="label-mono mb-1">Tenants</p>
                  <div className="flex flex-wrap gap-1">{flag.tenants.length ? flag.tenants.map((t) => <Badge key={t} tone="muted"><Building2 className="h-2.5 w-2.5" aria-hidden="true" /> {t}</Badge>) : <span className="text-xs text-ink-faint">All tenants</span>}</div>
                </div>
              </div>

              {/* Audit */}
              <button onClick={() => setHistoryOpen((v) => !v)} className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-primary">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> Audit history
                <ShieldCheck className="h-3 w-3 text-success" aria-hidden="true" />
              </button>
              {historyOpen && (
                <div className="mt-2 p-3 rounded-lg bg-bg-base border border-bg-border text-xs space-y-1 animate-fade-in">
                  <p className="text-ink-secondary">{flag.updatedAt} — <span className="text-ink-primary">{flag.updatedBy}</span> modified flag</p>
                  <p className="text-ink-muted font-mono">Previous: global={String(!flag.enabled.global)} → New: global={String(flag.enabled.global)}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal open={showAdd} onClose={closeModal} title="New Feature Flag" titleId="new-flag-title">
        <div className="p-5 space-y-4">
          <div>
            <label className="block">
              <span className="label-mono">Name</span>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError(''); }}
                placeholder="e.g. Beta Dashboard"
                aria-label="Flag name"
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label-mono">Key</span>
              <Input
                className="mt-1 font-mono"
                value={form.key}
                onChange={(e) => { setForm((f) => ({ ...f, key: e.target.value })); setError(''); }}
                placeholder="e.g. beta.dashboard"
                aria-label="Flag key"
              />
            </label>
            <p className="text-xs text-ink-muted mt-1">A unique identifier used in code to check this flag.</p>
          </div>
          <div>
            <label className="block">
              <span className="label-mono">Category</span>
              <Select
                className="mt-1"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                aria-label="Flag category"
              >
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label-mono">Description</span>
              <textarea
                className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm text-ink-primary placeholder:text-ink-faint focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors resize-none"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does this flag control?"
                aria-label="Flag description"
              />
            </label>
          </div>

          {/* Environment defaults */}
          <div>
            <span className="label-mono">Initial environment state</span>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="min-h-[72px] flex flex-col items-center justify-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border cursor-pointer hover:border-accent/30 transition-colors">
                <Toggle checked={form.global} onChange={(v) => setForm((f) => ({ ...f, global: v }))} aria-label="Global on" />
                <span className="text-sm font-medium text-ink-secondary">Global</span>
              </label>
              {envMeta.map((e) => (
                <label key={e.key} className="min-h-[72px] flex flex-col items-center justify-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border cursor-pointer hover:border-accent/30 transition-colors">
                  <Toggle checked={form[e.key]} onChange={(v) => setForm((f) => ({ ...f, [e.key]: v }))} aria-label={`${e.label} on`} />
                  <span className="text-sm font-medium text-ink-secondary">{e.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Roles */}
          <div>
            <span className="label-mono">Roles</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {allRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRole(r)}
                  className={cn(
                    'px-2.5 py-1 rounded-md border text-xs transition-colors',
                    form.roles.includes(r) ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-bg-base border-bg-border text-ink-muted hover:text-ink-primary'
                  )}
                  aria-pressed={form.roles.includes(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Create Flag</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
