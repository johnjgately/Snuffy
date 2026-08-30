import { useState } from 'react';
import { Card, SectionHeader, Badge, Button, StatusDot, Input, Select } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoIntegrations } from '@/data/demo';
import type { Integration } from '@/types';
import { cn } from '@/lib/utils';
import { Plug, Plus, Code, Webhook, Box, FileCode, ShieldCheck, Key, Copy, ExternalLink, Building2, Monitor, Check } from 'lucide-react';

const statusTone = { connected: 'success', available: 'muted', disabled: 'danger' } as const;

const tabs = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'embed', label: 'Embedded Deployments' },
  { id: 'sdk', label: 'SDK & API' },
] as const;

const categories = ['Messaging', 'Calendar', 'Email', 'Cloud Storage', 'Developer', 'IoT', 'Deployment', 'CRM', 'Analytics', 'Other'];

const emptyForm = { name: '', category: 'Messaging', description: '', permissions: '' };

export function Integrations() {
  const [tab, setTab] = useState<'integrations' | 'embed' | 'sdk'>('integrations');
  const [showWebhook, setShowWebhook] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>(demoIntegrations);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const handleAdd = () => {
    const name = form.name.trim();
    if (!name) {
      setError('Integration name is required.');
      return;
    }
    const perms = form.permissions
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const id = `i${Date.now()}`;
    const newIntegration: Integration = {
      id,
      name,
      category: form.category,
      status: 'available',
      description: form.description.trim() || `Custom ${form.category.toLowerCase()} integration.`,
      permissions: perms,
    };
    setIntegrations((prev) => [...prev, newIntegration]);
    setForm(emptyForm);
    setError('');
    setShowAdd(false);
    setJustAdded(id);
    setTimeout(() => setJustAdded(null), 2500);
  };

  const closeModal = () => {
    setShowAdd(false);
    setForm(emptyForm);
    setError('');
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Integrations & Embedded Deployments"
        description="Modular, API-first integration framework. Embed Snuffy into parent sites via SDK, widget, iframe, or browser extension."
        actions={<Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Add Integration</Button>}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-bg-surface border border-bg-border rounded-lg w-fit" role="tablist" aria-label="Integration views">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors', tab === t.id ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:text-ink-primary')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'integrations' && (
        <div role="tabpanel" id="tabpanel-integrations" aria-labelledby="tab-integrations" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((i) => (
            <Card key={i.id} className={cn('p-4 transition-all', justAdded === i.id && 'ring-2 ring-accent/50 animate-fade-in')}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center"><Plug className="h-4.5 w-4.5 text-accent" aria-hidden="true" /></div>
                  <div><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-ink-muted font-mono">{i.category}</p></div>
                </div>
                <StatusDot tone={statusTone[i.status] === 'success' ? 'success' : statusTone[i.status] === 'danger' ? 'danger' : 'muted'} label={i.status} />
              </div>
              <p className="text-xs text-ink-muted mb-3">{i.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {i.permissions.map((p) => <Badge key={p} tone="muted"><Key className="h-2.5 w-2.5" aria-hidden="true" /> {p}</Badge>)}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-bg-border">
                <span className="text-xs text-ink-faint font-mono">{i.lastSync ? `Synced ${i.lastSync}` : 'Not connected'}</span>
                {i.status === 'connected' ? <Button size="sm" variant="outline">Manage</Button> : i.status === 'available' ? <Button size="sm" variant="primary">Connect</Button> : <Button size="sm" variant="ghost">Enable</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'embed' && (
        <div role="tabpanel" id="tabpanel-embed" aria-labelledby="tab-embed" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3"><Box className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Embedded Widget</h3></div>
              <p className="text-xs text-ink-muted mb-3">Drop this snippet into any parent site to embed Snuffy as a floating assistant widget.</p>
              <div className="bg-bg-base border border-bg-border rounded-lg p-3 font-mono text-xs text-ink-secondary overflow-x-auto" role="region" aria-label="Widget embed code">
                <div>{'<script src="https://cdn.sufft.ai/widget.js"'}</div>
                <div>{'  data-tenant="your-tenant-id"'}</div>
                <div>{'  data-theme="dark"'}</div>
                <div>{'  data-features="chat,voice"'}</div>
                <div>{'  async></script>'}</div>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" aria-label="Copy widget snippet"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy snippet</Button>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3"><Monitor className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Iframe Deployment</h3></div>
              <p className="text-xs text-ink-muted mb-3">Embed the full Snuffy workspace in an iframe with SSO and scoped permissions.</p>
              <div className="bg-bg-base border border-bg-border rounded-lg p-3 font-mono text-xs text-ink-secondary overflow-x-auto" role="region" aria-label="Iframe embed code">
                <div>{'<iframe'}</div>
                <div>{'  src="https://app.sufft.ai/embed?tenant=xxx"'}</div>
                <div>{'  allow="microphone"'}</div>
                <div>{'  sandbox="allow-scripts"'}</div>
                <div>{'  style="width:100%;height:600px;border:0"'}</div>
                <div>{'></iframe>'}</div>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" aria-label="Copy iframe snippet"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy snippet</Button>
              <p className="text-xs text-ink-muted mt-2">Note: The sandbox uses <code className="font-mono text-ink-secondary">allow-scripts</code> without <code className="font-mono text-ink-secondary">allow-same-origin</code> to prevent the embedded content from removing its own sandbox restrictions.</p>
            </Card>
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><Building2 className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Active Deployments</h3></div>
            <div className="space-y-2">
              {[
                { site: 'portal.example.com', type: 'Widget', status: 'connected', features: 'chat, voice, documents' },
                { site: 'intranet.example.org', type: 'Iframe', status: 'connected', features: 'chat, databases:read' },
                { site: 'app.example.io', type: 'SDK', status: 'connected', features: 'chat only' },
              ].map((d) => (
                <div key={d.site} className="flex items-center gap-3 p-3 rounded-lg bg-bg-base border border-bg-border">
                  <ExternalLink className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                  <div className="flex-1"><p className="text-xs font-medium text-ink-primary">{d.site}</p><p className="text-xs text-ink-muted font-mono">{d.type} · {d.features}</p></div>
                  <Badge tone="success">{d.status}</Badge>
                  <Button size="sm" variant="ghost">Manage</Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'sdk' && (
        <div role="tabpanel" id="tabpanel-sdk" aria-labelledby="tab-sdk" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3"><Code className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">JavaScript SDK</h3></div>
              <p className="text-xs text-ink-muted mb-3">Initialize the SDK with your tenant token and scoped features.</p>
              <div className="bg-bg-base border border-bg-border rounded-lg p-3 font-mono text-xs text-ink-secondary overflow-x-auto" role="region" aria-label="SDK initialization code">
                <div>{'import { Suffy } from "@sufft/sdk";'}</div>
                <div className="mt-1">{'const suffy = new Suffy({'}</div>
                <div>{'  tenant: "your-tenant-id",'}</div>
                <div>{'  token: "sk_embed_xxx",'}</div>
                <div>{'  features: ["chat", "voice"],'}</div>
                <div>{'  theme: "dark",'}</div>
                <div>{'});'}</div>
                <div className="mt-1">{'await suffy.chat.send("Summarize this document");'}</div>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" aria-label="Copy SDK code"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy</Button>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3"><Webhook className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Webhooks</h3></div>
              <p className="text-xs text-ink-muted mb-3">Subscribe to versioned events with signed payloads.</p>
              <div className="space-y-2">
                {[
                  { event: 'chat.message.completed', version: 'v1' },
                  { event: 'document.processed', version: 'v1' },
                  { event: 'automation.executed', version: 'v2' },
                  { event: 'audit.entry.created', version: 'v1' },
                ].map((w) => (
                  <div key={w.event} className="flex items-center gap-2 p-2 rounded-lg bg-bg-base border border-bg-border">
                    <FileCode className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
                    <span className="text-xs font-mono text-ink-secondary">{w.event}</span>
                    <Badge tone="accent" className="ml-auto">{w.version}</Badge>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="primary" className="mt-3" onClick={() => setShowWebhook(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add webhook</Button>
            </Card>
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /><h3 className="text-sm font-semibold">Security Guarantees</h3></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                'API keys never exposed to parent site',
                'Private documents stay tenant-isolated',
                'Database credentials server-side only',
                'Internal system prompts never sent to client',
                'Audit data restricted to authorized roles',
                'Rate limiting on all endpoints',
                'Versioned API with backward compatibility',
                'SSO with shared identity mapping',
                'Role & permission mapping per tenant',
              ].map((s) => <div key={s} className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-base border border-bg-border"><ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" aria-hidden="true" /><span className="text-xs text-ink-secondary">{s}</span></div>)}
            </div>
          </Card>
          <Modal open={showWebhook} onClose={() => setShowWebhook(false)} title="Add Webhook" titleId="webhook-title">
            <div className="p-5">
              <label className="block mb-3"><span className="label-mono">Endpoint URL</span><input className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm" placeholder="https://your-site.com/webhook" /></label>
              <label className="block mb-3"><span className="label-mono">Events</span><select className="mt-1 w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm"><option>chat.message.completed</option><option>document.processed</option><option>automation.executed</option><option>audit.entry.created</option></select></label>
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setShowWebhook(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={() => setShowWebhook(false)}>Register</Button></div>
            </div>
          </Modal>
        </div>
      )}

      <Modal open={showAdd} onClose={closeModal} title="Add Integration" titleId="add-integration-title">
        <div className="p-5 space-y-4">
          <div>
            <label className="block">
              <span className="label-mono">Name</span>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError(''); }}
                placeholder="e.g. Salesforce, Zendesk, Jira"
                aria-label="Integration name"
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label-mono">Category</span>
              <Select
                className="mt-1"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                aria-label="Integration category"
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
                placeholder="What does this integration do?"
                aria-label="Integration description"
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label-mono">Permissions</span>
              <Input
                className="mt-1"
                value={form.permissions}
                onChange={(e) => setForm((f) => ({ ...f, permissions: e.target.value }))}
                placeholder="channels:read, chat:write (comma-separated)"
                aria-label="Integration permissions"
              />
            </label>
            <p className="text-xs text-ink-muted mt-1">Separate multiple permissions with commas.</p>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
