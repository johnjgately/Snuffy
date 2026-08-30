import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, StatusDot, Button } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { supabase } from '@/lib/supabase';
import { demoAIConnections, demoDatabases, demoAutomations, demoAudit, demoDocuments, demoIntegrations, demoFeatureFlags } from '@/data/demo';
import { formatNumber, formatCost, cn } from '@/lib/utils';
import type { SectionId } from '@/types';
import {
  Cpu, Database, FileText, Workflow, Activity, TrendingUp, Mic, ShieldCheck,
  Zap, Clock, ArrowRight, GraduationCap, Library, Globe, Plug, AlertTriangle,
  CheckCircle2, Server, Eye, Lock, Radio, Layers, Gauge, Boxes, Sparkles,
} from 'lucide-react';

interface HealthItem { label: string; status: 'healthy' | 'degraded' | 'offline' | 'connected' | 'error' | 'disconnected'; detail: string; }
interface QuickAction { label: string; icon: typeof Cpu; section: SectionId; tone: string; }

export function Dashboard({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { privacyMode, auditCount, branding, emergencyStop, voice } = useApp();

  const [now, setNow] = useState(new Date());
  const [recentLogs, setRecentLogs] = useState<{ action: string; actor: string; severity: string; section: string; created_at: string }[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadRecentLogs = useCallback(async () => {
    const { data } = await supabase
      .from('search_logs')
      .select('query, user, provider_used, is_fallback, success, execution_time_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(6);
    if (data && data.length > 0) {
      setRecentLogs(data.map((r: Record<string, unknown>) => ({
        action: `Search: ${r.query as string}`,
        actor: r.user as string,
        severity: r.success ? 'info' : 'warning',
        section: 'Internet Search',
        created_at: r.created_at as string,
      })));
    }
  }, []);

  useEffect(() => { loadRecentLogs(); }, [loadRecentLogs]);

  // Derived metrics
  const totalTokens = demoAIConnections.reduce((s, c) => s + c.usageTokens, 0);
  const totalCost = demoAIConnections.reduce((s, c) => s + c.usageCost, 0);
  const costLimit = 200;
  const costPct = Math.min(100, (totalCost / costLimit) * 100);

  const healthyAI = demoAIConnections.filter((c) => c.enabled && c.status === 'healthy').length;
  const degradedAI = demoAIConnections.filter((c) => c.enabled && c.status === 'degraded').length;
  const offlineAI = demoAIConnections.filter((c) => c.status === 'offline').length;
  const connectedDb = demoDatabases.filter((d) => d.status === 'connected').length;
  const errorDb = demoDatabases.filter((d) => d.status === 'error' || d.status === 'disconnected').length;
  const activeAutomations = demoAutomations.filter((a) => a.enabled).length;
  const runningAutomations = demoAutomations.filter((a) => a.status === 'running').length;
  const processedDocs = demoDocuments.filter((d) => d.status === 'processed').length;
  const processingDocs = demoDocuments.filter((d) => d.status === 'processing').length;
  const connectedIntegrations = demoIntegrations.filter((i) => i.status === 'connected').length;
  const enabledFlags = demoFeatureFlags.filter((f) => f.enabled.global).length;
  const trainingFlags = demoFeatureFlags.filter((f) => f.category === 'AI Training' && f.enabled.global).length;

  const modeLabel = privacyMode === 'local' ? 'Local / Private' : privacyMode === 'connected' ? 'Connected' : 'Custom';

  const systemHealth: HealthItem[] = [
    { label: 'Cloud AI Providers', status: healthyAI >= 2 ? 'healthy' : 'degraded', detail: `${healthyAI} healthy · ${degradedAI} degraded · ${offlineAI} offline` },
    { label: 'Local AI Servers', status: degradedAI > 0 ? 'degraded' : 'healthy', detail: `${demoAIConnections.filter((c) => c.kind === 'local' && c.enabled).length} active` },
    { label: 'Database Connections', status: errorDb > 0 ? 'degraded' : 'connected', detail: `${connectedDb}/${demoDatabases.length} connected` },
    { label: 'Document Pipeline', status: processingDocs > 0 ? 'degraded' : 'healthy', detail: `${processedDocs} indexed · ${processingDocs} processing` },
    { label: 'Knowledge & RAG', status: 'healthy', detail: `${trainingFlags} training features on` },
    { label: 'Internet Search', status: privacyMode === 'local' ? 'offline' : 'healthy', detail: privacyMode === 'local' ? 'Disabled in local mode' : 'Brave + DuckDuckGo' },
    { label: 'Automations', status: runningAutomations > 0 ? 'degraded' : 'healthy', detail: `${activeAutomations} active · ${runningAutomations} running` },
    { label: 'Integrations', status: 'connected', detail: `${connectedIntegrations} connected` },
    { label: 'Voice & Keyboard', status: voice.wakeWord ? 'healthy' : 'degraded', detail: voice.pushToTalk ? 'Push-to-talk active' : 'Voice idle' },
    { label: 'Feature Flags', status: 'healthy', detail: `${enabledFlags} enabled globally` },
  ];

  const healthTone = (s: string) =>
    s === 'healthy' || s === 'connected' ? 'success' : s === 'degraded' ? 'warning' : 'danger';

  const quickActions: QuickAction[] = [
    { label: 'AI Chat', icon: Zap, section: 'chat', tone: 'text-accent' },
    { label: 'Knowledge Docs', icon: Library, section: 'ai-knowledge-docs', tone: 'text-success' },
    { label: 'Automations', icon: Workflow, section: 'automations', tone: 'text-warning' },
    { label: 'Internet Search', icon: Globe, section: 'internet-search', tone: 'text-accent' },
    { label: 'AI Training', icon: GraduationCap, section: 'ai-training', tone: 'text-success' },
    { label: 'Security', icon: ShieldCheck, section: 'security-settings', tone: 'text-danger' },
  ];

  const activityFeed = recentLogs.length > 0 ? recentLogs : demoAudit.slice(0, 6).map((e) => ({
    action: e.action, actor: e.actor, severity: e.severity, section: e.section, created_at: e.timestamp,
  }));

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Command Dashboard"
        description="Real-time overview of your AI assistant operations, connections, and system health."
        actions={
          <div className="flex items-center gap-2">
            {!emergencyStop ? (
              <Badge tone="accent"><Activity className="h-3 w-3 animate-pulse" aria-hidden="true" /> Live</Badge>
            ) : (
              <Badge tone="danger"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Emergency Stop</Badge>
            )}
            <Badge tone="muted"><Clock className="h-3 w-3" aria-hidden="true" /> {timeStr}</Badge>
          </div>
        }
      />

      {/* Hero banner with system status */}
      <Card className="relative overflow-hidden mb-6 grid-bg" elevated>
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl" aria-hidden="true" />
        <div className="relative p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-pulse-ring" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                </span>
                <span className="label-mono">{emergencyStop ? 'Emergency stop active' : 'All systems operational'}</span>
                <span className="text-xs text-ink-faint">·</span>
                <span className="text-xs text-ink-muted font-mono">{dateStr}</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{branding.name} Command Center</h2>
              <p className="text-sm text-ink-secondary mt-1.5 max-w-lg">
                Operating in <span className="text-accent font-medium">{modeLabel}</span> mode.
                {auditCount > 0 && <span> {auditCount} new audit events since last visit.</span>}
                {' '}{runningAutomations > 0 && <span className="text-warning">{runningAutomations} automation{runningAutomations > 1 ? 's' : ''} running.</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onNavigate('chat')}><Zap className="h-4 w-4" aria-hidden="true" /> Open AI Chat</Button>
              <Button variant="outline" onClick={() => onNavigate('ai-training')}><GraduationCap className="h-4 w-4" aria-hidden="true" /> AI Training</Button>
              <Button variant="ghost" onClick={() => onNavigate('automations')}><Workflow className="h-4 w-4" aria-hidden="true" /> Automations</Button>
            </div>
          </div>

          {/* Quick action bar */}
          <div className="mt-5 pt-5 border-t border-bg-border">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <button
                    key={qa.label}
                    onClick={() => onNavigate(qa.section)}
                    className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-bg-base/60 border border-bg-border hover:border-accent/30 hover:bg-bg-hover transition-all"
                  >
                    <Icon className={cn('h-4 w-4 shrink-0 group-hover:scale-110 transition-transform', qa.tone)} aria-hidden="true" />
                    <span className="text-xs text-ink-secondary group-hover:text-ink-primary transition-colors truncate">{qa.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Top-level metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 relative overflow-hidden group hover:border-accent/30 transition-colors">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Cpu className="h-5 w-5" aria-hidden="true" />
            </div>
            <StatusDot tone={degradedAI > 0 ? 'warning' : 'success'} label={degradedAI > 0 ? 'Degraded' : 'Operational'} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{healthyAI}<span className="text-base text-ink-muted font-normal ml-1">/ {demoAIConnections.length}</span></p>
          <p className="text-xs text-ink-muted mt-0.5">AI Providers Healthy</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint font-mono">
            <span className="text-success">{healthyAI} ok</span>
            {degradedAI > 0 && <span className="text-warning">{degradedAI} degraded</span>}
            {offlineAI > 0 && <span className="text-ink-faint">{offlineAI} off</span>}
          </div>
        </Card>

        <Card className="p-4 relative overflow-hidden group hover:border-success/30 transition-colors">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center text-success">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <StatusDot tone={errorDb > 0 ? 'warning' : 'success'} label={errorDb > 0 ? 'Issues' : 'Connected'} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{connectedDb}<span className="text-base text-ink-muted font-normal ml-1">/ {demoDatabases.length}</span></p>
          <p className="text-xs text-ink-muted mt-0.5">Databases Connected</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint font-mono">
            <span className="text-success">{connectedDb} live</span>
            {errorDb > 0 && <span className="text-danger">{errorDb} errors</span>}
          </div>
        </Card>

        <Card className="p-4 relative overflow-hidden group hover:border-warning/30 transition-colors">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <StatusDot tone={processingDocs > 0 ? 'warning' : 'success'} label={processingDocs > 0 ? 'Processing' : 'Indexed'} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{processedDocs}<span className="text-base text-ink-muted font-normal ml-1">/ {demoDocuments.length}</span></p>
          <p className="text-xs text-ink-muted mt-0.5">Documents Indexed</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint font-mono">
            <span className="text-success">{processedDocs} ready</span>
            {processingDocs > 0 && <span className="text-warning">{processingDocs} processing</span>}
          </div>
        </Card>

        <Card className="p-4 relative overflow-hidden group hover:border-accent/30 transition-colors">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Workflow className="h-5 w-5" aria-hidden="true" />
            </div>
            <StatusDot tone={runningAutomations > 0 ? 'warning' : 'success'} label={runningAutomations > 0 ? 'Running' : 'Idle'} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">{activeAutomations}<span className="text-base text-ink-muted font-normal ml-1">/ {demoAutomations.length}</span></p>
          <p className="text-xs text-ink-muted mt-0.5">Automations Active</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint font-mono">
            <span className="text-accent">{activeAutomations} enabled</span>
            {runningAutomations > 0 && <span className="text-warning">{runningAutomations} running</span>}
          </div>
        </Card>
      </div>

      {/* System Health Grid */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">System Health</h3>
            </div>
            <Badge tone="muted">{systemHealth.filter((h) => healthTone(h.status) === 'success').length}/{systemHealth.length} healthy</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {systemHealth.map((h) => (
              <div key={h.label} className="flex items-center gap-3 p-3 rounded-lg bg-bg-base/50 border border-bg-border hover:border-bg-hover transition-colors">
                <StatusDot tone={healthTone(h.status)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink-primary truncate">{h.label}</p>
                  <p className="text-xs text-ink-muted font-mono truncate">{h.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* AI Usage & Spending */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">AI Usage & Spending</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('ai-connections')}>Details <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className="label-mono">Total tokens</p>
              <p className="text-xl font-semibold mt-1">{formatNumber(totalTokens)}</p>
            </div>
            <div>
              <p className="label-mono">Spending</p>
              <p className="text-xl font-semibold mt-1">{formatCost(totalCost)}</p>
            </div>
          </div>
          {/* Budget bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-ink-muted">Monthly budget</span>
              <span className="font-mono text-ink-secondary">{formatCost(totalCost)} / {formatCost(costLimit)}</span>
            </div>
            <div className="h-2 rounded-full bg-bg-base overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', costPct > 80 ? 'bg-danger' : costPct > 50 ? 'bg-warning' : 'bg-accent')}
                style={{ width: `${Math.max(3, costPct)}%` }}
              />
            </div>
          </div>
          {/* Per-provider breakdown */}
          <div className="space-y-2.5">
            {demoAIConnections.filter((c) => c.enabled).slice(0, 4).map((c) => {
              const pct = totalCost > 0 ? Math.min(100, (c.usageCost / costLimit) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-secondary flex items-center gap-1.5">
                      {c.kind === 'local' ? <Server className="h-3 w-3 text-success" aria-hidden="true" /> : <Cpu className="h-3 w-3 text-accent" aria-hidden="true" />}
                      {c.name}
                    </span>
                    <span className="font-mono text-ink-muted">{formatNumber(c.usageTokens)} tok · {formatCost(c.usageCost)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
                    <div className={cn('h-full rounded-full', c.kind === 'local' ? 'bg-success' : 'bg-accent')} style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Activity + Data Sources + Training Pipeline */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Recent Activity */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Recent Activity</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('audit-logs')}>All <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
          </div>
          <div className="space-y-3">
            {activityFeed.map((e, i) => (
              <div key={i} className="flex gap-2.5">
                <div className={cn(
                  'mt-1 h-1.5 w-1.5 rounded-full shrink-0',
                  e.severity === 'critical' ? 'bg-danger' : e.severity === 'warning' ? 'bg-warning' : 'bg-accent',
                )} />
                <div className="min-w-0">
                  <p className="text-xs text-ink-primary truncate">{e.action}</p>
                  <p className="text-xs text-ink-muted font-mono">{e.actor} · {e.section}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Permitted Data Sources */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Permitted Data Sources</h3>
            <Badge tone="muted" className="ml-auto">{modeLabel} mode</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Cloud AI', icon: Cpu, on: privacyMode !== 'local' },
              { label: 'Local AI', icon: Server, on: true },
              { label: 'Databases', icon: Database, on: true },
              { label: 'Documents', icon: FileText, on: true },
              { label: 'Knowledge Base', icon: Library, on: true },
              { label: 'Internet', icon: Globe, on: privacyMode === 'connected' },
              { label: 'Voice', icon: Mic, on: true },
              { label: 'Integrations', icon: Plug, on: privacyMode !== 'local' },
            ].map((src) => {
              const Icon = src.icon;
              return (
                <div key={src.label} className={cn(
                  'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                  src.on ? 'bg-bg-base border-bg-border' : 'bg-bg-base/30 border-bg-border opacity-50',
                )}>
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', src.on ? 'text-accent' : 'text-ink-faint')} aria-hidden="true" />
                  <span className="text-xs text-ink-secondary truncate flex-1">{src.label}</span>
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', src.on ? 'bg-success' : 'bg-ink-faint')} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* AI Training Pipeline */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-success" aria-hidden="true" />
              <h3 className="text-sm font-semibold">AI Training Pipeline</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('ai-training')}>Open <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Knowledge Bases', icon: Library, count: 3, section: 'ai-knowledge-bases' as SectionId, tone: 'text-success' },
              { label: 'Documents Ingested', icon: FileText, count: processedDocs, section: 'ai-knowledge-docs' as SectionId, tone: 'text-accent' },
              { label: 'Embedding Models', icon: Layers, count: 1, section: 'ai-training-settings' as SectionId, tone: 'text-warning' },
              { label: 'Vector Search', icon: Boxes, count: 1, section: 'ai-training' as SectionId, tone: 'text-accent' },
              { label: 'Training Features', icon: Sparkles, count: trainingFlags, section: 'feature-flags' as SectionId, tone: 'text-success' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => onNavigate(item.section)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-bg-base/50 border border-bg-border hover:border-accent/30 hover:bg-bg-hover transition-all group"
                >
                  <Icon className={cn('h-4 w-4 shrink-0 group-hover:scale-110 transition-transform', item.tone)} aria-hidden="true" />
                  <span className="text-xs text-ink-secondary flex-1 text-left group-hover:text-ink-primary transition-colors">{item.label}</span>
                  <span className="text-sm font-semibold text-ink-primary font-mono">{item.count}</span>
                  <ArrowRight className="h-3 w-3 text-ink-faint group-hover:text-accent transition-colors" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Bottom row: Active Automations + Integrations */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active Automations */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Automation Status</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('automations')}>Manage <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
          </div>
          <div className="space-y-2">
            {demoAutomations.map((a) => (
              <div key={a.id} className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                a.enabled ? 'bg-bg-base/50 border-bg-border' : 'bg-bg-base/20 border-bg-border opacity-60',
              )}>
                <div className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                  a.status === 'running' ? 'bg-warning/10 border border-warning/20' : a.enabled ? 'bg-accent/10 border border-accent/20' : 'bg-bg-base border border-bg-border',
                )}>
                  {a.status === 'running'
                    ? <Activity className="h-4 w-4 text-warning animate-pulse" aria-hidden="true" />
                    : a.enabled
                      ? <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
                      : <Clock className="h-4 w-4 text-ink-faint" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink-primary truncate">{a.name}</p>
                  <p className="text-xs text-ink-muted font-mono truncate">{a.schedule} · {a.runs} runs</p>
                </div>
                <Badge tone={a.status === 'running' ? 'warning' : a.enabled ? 'success' : 'muted'}>
                  {a.status === 'running' ? 'Running' : a.enabled ? 'Active' : 'Paused'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Integrations */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Integrations</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('integrations')}>All <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {demoIntegrations.slice(0, 6).map((int) => (
              <div key={int.id} className={cn(
                'flex items-center gap-2.5 p-3 rounded-lg border transition-colors',
                int.status === 'connected' ? 'bg-bg-base/50 border-bg-border' : 'bg-bg-base/20 border-bg-border opacity-60',
              )}>
                <div className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                  int.status === 'connected' ? 'bg-success/10 border border-success/20' : 'bg-bg-base border border-bg-border',
                )}>
                  {int.status === 'connected'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    : <Plug className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-primary truncate">{int.name}</p>
                  <p className="text-xs text-ink-muted truncate">{int.category}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Security footer */}
      <Card className="mt-6 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="label-mono">Security Posture</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" /> RLS enabled on all tables</span>
            <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> {auditCount} audit events tracked</span>
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-success" aria-hidden="true" /> JWT verified on edge functions</span>
            <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-warning" aria-hidden="true" /> {modeLabel} mode</span>
          </div>
          <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={() => onNavigate('security-settings')}>Security Settings <ArrowRight className="h-3 w-3" aria-hidden="true" /></Button>
        </div>
      </Card>
    </div>
  );
}
