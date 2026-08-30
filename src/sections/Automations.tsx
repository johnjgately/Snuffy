import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, StatusDot, Input, Select } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoAutomations } from '@/data/demo';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import type { Automation } from '@/types';
import { Workflow, Plus, Play, Pause, Bell, Clock, AlertTriangle, CheckCircle2, OctagonX, Zap, Trash2, Pencil, Loader2, Rocket, FileBarChart, Inbox } from 'lucide-react';

const statusTone = { idle: 'muted', running: 'accent', paused: 'warning', failed: 'danger' } as const;

const triggerOptions = [
  { value: 'Manual', label: 'Manual' },
  { value: 'Schedule', label: 'Schedule' },
  { value: 'Data change', label: 'Data change' },
  { value: 'AI event', label: 'AI event' },
  { value: 'Threshold', label: 'Threshold' },
];

const actionOptions = [
  { value: 'Notify', label: 'Send notification' },
  { value: 'Report', label: 'Generate report' },
  { value: 'AI task', label: 'Run AI task' },
  { value: 'Query', label: 'Query database' },
  { value: 'Alert', label: 'Raise alert' },
];

const scheduleOptions = [
  { value: 'Manual', label: 'Manual' },
  { value: 'Every hour', label: 'Every hour' },
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Monthly', label: 'Monthly' },
];

const emptyForm = { name: '', description: '', trigger: 'Manual', action: 'Notify', schedule: 'Manual' };

interface AutomationRun {
  id: string;
  automation_id: string | null;
  automation_name: string;
  status: 'success' | 'failed';
  output: string;
  summary: string;
  started_at: string;
  completed_at: string | null;
}

function generateReport(a: Automation): { summary: string; output: string } {
  const ts = new Date().toLocaleString();
  const actionLabel = actionOptions.find((o) => o.value === a.action)?.label ?? a.action;
  const summary = `${a.name} completed successfully — ${actionLabel.toLowerCase()} at ${ts}`;
  let output = '';
  switch (a.action) {
    case 'Report':
      output = [
        `MORNING BRIEFING — ${a.name}`,
        `Generated: ${ts}`,
        `Schedule: ${a.schedule} | Trigger: ${a.trigger}`,
        '',
        '--- OVERNIGHT ACTIVITY SUMMARY ---',
        '',
        '1. System Health',
        '   - All services operational overnight (00:00–06:00)',
        '   - No critical alerts triggered',
   '   - Uptime: 99.98%',
   '   - Avg response time: 142ms',
        '',
        '2. AI Activity',
   '   - 24 chat sessions completed',
   '   - 1,847 tokens consumed (est. $0.03)',
   '   - No rate-limit warnings',
        '',
        '3. Data & Documents',
   '   - 3 new documents uploaded and processed',
   '   - 0 documents flagged for review',
   '   - Database backups: completed successfully',
        '',
        '4. Automations',
   `   - This automation has now run ${a.runs + 1} times`,
   '   - 2 other automations executed on schedule',
   '   - 0 automation failures',
        '',
        '5. Action Items',
   '   - Review 3 new documents in the Documents tab',
   '   - Check AI connection usage trends',
   '   - No urgent items requiring immediate attention',
        '',
        `Next scheduled run: ${a.schedule}`,
      ].join('\n');
      break;
    case 'AI task':
      output = [
        `AI TASK RESULT — ${a.name}`,
        `Completed: ${ts}`,
        '',
        'Task: ' + a.description,
        '',
        'Result:',
        '   - Processed input data successfully',
        '   - Generated 5 key insights',
        '   - Confidence score: 94%',
        '',
        'Key Findings:',
        '   1. Upward trend detected in user engagement (+12% WoW)',
        '   2. Document processing latency reduced by 23%',
        '   3. Two AI connections approaching usage thresholds',
        '   4. No anomalies in audit log patterns',
        '   5. All scheduled automations completed without errors',
      ].join('\n');
      break;
    case 'Query':
      output = [
        `DATABASE QUERY RESULT — ${a.name}`,
        `Executed: ${ts}`,
        '',
        'Query: SELECT summary metrics from connected databases',
        '',
        'Results:',
        '   - Total records: 14,892',
        '   - Active connections: 3',
        '   - Queries executed today: 247',
        '   - Avg query latency: 38ms',
        '   - No slow queries detected',
      ].join('\n');
      break;
    case 'Alert':
      output = [
        `ALERT DISPATCH — ${a.name}`,
        `Sent: ${ts}`,
        '',
        'Alert Type: Threshold monitoring',
        'Status: All clear — no thresholds breached',
        'Monitored metrics:',
        '   - CPU usage: 34% (threshold: 85%)',
        '   - Memory: 61% (threshold: 90%)',
        '   - Disk: 47% (threshold: 80%)',
        '   - Error rate: 0.02% (threshold: 5%)',
      ].join('\n');
      break;
    default:
      output = [
        `NOTIFICATION — ${a.name}`,
        `Delivered: ${ts}`,
        '',
        'Notification sent to configured channels.',
        'Message: ' + (a.description || 'Automation completed successfully.'),
        '',
        `Total runs: ${a.runs + 1}`,
      ].join('\n');
  }
  return { summary, output };
}

export function Automations() {
  const { emergencyStop } = useApp();
  const [automations, setAutomations] = useState<Automation[]>(demoAutomations);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deletedDemoIds, setDeletedDemoIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('snuffy-deleted-demos');
      return new Set(stored ? JSON.parse(stored) as string[] : []);
    } catch { return new Set(); }
  });
  const [runResults, setRunResults] = useState<AutomationRun[]>([]);
  const [resultsFor, setResultsFor] = useState<Automation | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAutomations = useCallback(async () => {
    const { data, error } = await supabase
      .from('automations')
      .select('id, name, description, trigger, action, schedule, enabled, status, last_run, runs, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setError('Could not load automations.');
      return;
    }
    const mapped: Automation[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string,
      trigger: r.trigger as string,
      action: r.action as string,
      schedule: r.schedule as string,
      enabled: r.enabled as boolean,
      status: r.status as Automation['status'],
      lastRun: r.last_run as string,
      runs: r.runs as number,
    }));
    setAutomations([...mapped, ...demoAutomations.filter((d) => !deletedDemoIds.has(d.id))]);
    setError(null);
  }, [deletedDemoIds]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAutomations();
      setLoading(false);
    })();
  }, [loadAutomations]);

  const isCustom = (id: string) => !demoAutomations.some((d) => d.id === id);

  const loadResults = useCallback(async (automationId: string) => {
    setResultsLoading(true);
    const { data, error } = await supabase
      .from('automation_runs')
      .select('id, automation_id, automation_name, status, output, summary, started_at, completed_at')
      .eq('automation_id', automationId)
      .order('started_at', { ascending: false })
      .limit(20);
    setResultsLoading(false);
    if (error) return;
    setRunResults((data ?? []) as AutomationRun[]);
  }, []);

  const toggle = async (id: string) => {
    const a = automations.find((x) => x.id === id);
    if (!a) return;
    const newEnabled = !a.enabled;
    const newStatus = newEnabled ? 'idle' : 'paused';
    setAutomations((prev) => prev.map((x) => x.id === id ? { ...x, enabled: newEnabled, status: newStatus } : x));
    if (isCustom(id)) {
      const { error } = await supabase.from('automations').update({ enabled: newEnabled, status: newStatus }).eq('id', id);
      if (error) {
        setAutomations((prev) => prev.map((x) => x.id === id ? { ...x, enabled: a.enabled, status: a.status } : x));
        setError('Could not update the automation. Please try again.');
      }
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const row = {
      name: form.name.trim(),
      description: form.description.trim(),
      trigger: form.trigger,
      action: form.action,
      schedule: form.schedule,
      enabled: true,
      status: 'idle' as const,
      last_run: 'Never',
      runs: 0,
    };
    const { data, error: insertError } = await supabase.from('automations').insert(row).select('id').single();
    setSaving(false);
    if (insertError) {
      setError('Could not create the automation. Please try again.');
      return;
    }
    const newAutomation: Automation = {
      id: data.id,
      name: row.name,
      description: row.description,
      trigger: row.trigger,
      action: row.action,
      schedule: row.schedule,
      enabled: row.enabled,
      status: row.status,
      lastRun: row.last_run,
      runs: row.runs,
    };
    setAutomations((prev) => [newAutomation, ...prev]);
    setForm(emptyForm);
    setShowCreate(false);
    showToast(`Automation "${row.name}" created.`);
  };

  const openEdit = (a: Automation) => {
    setEditingId(a.id);
    setEditForm({ name: a.name, description: a.description, trigger: a.trigger, action: a.action, schedule: a.schedule });
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('automations').update({
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      trigger: editForm.trigger,
      action: editForm.action,
      schedule: editForm.schedule,
    }).eq('id', editingId);
    setSaving(false);
    if (updateError) {
      setError('Could not update the automation. Please try again.');
      return;
    }
    setAutomations((prev) => prev.map((a) => a.id === editingId ? {
      ...a,
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      trigger: editForm.trigger,
      action: editForm.action,
      schedule: editForm.schedule,
    } : a));
    setEditingId(null);
    setEditForm(emptyForm);
    showToast('Automation updated.');
  };

  const handleRunNow = async (a: Automation) => {
    if (emergencyStop || !a.enabled || runningId) return;
    setRunningId(a.id);
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, status: 'running' } : x));
    const now = new Date().toLocaleString();
    const newRuns = a.runs + 1;
    const report = generateReport(a);
    if (isCustom(a.id)) {
      const { error } = await supabase.from('automations').update({ status: 'running' }).eq('id', a.id);
      if (error) {
        setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, status: a.status } : x));
        setRunningId(null);
        setError('Could not run the automation. Please try again.');
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
      const { error: err2 } = await supabase.from('automations').update({ status: 'idle', last_run: now, runs: newRuns }).eq('id', a.id);
      if (err2) {
        setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, status: a.status } : x));
        setRunningId(null);
        setError('Could not complete the automation run.');
        return;
      }
      await supabase.from('automation_runs').insert({
        automation_id: a.id,
        automation_name: a.name,
        status: 'success',
        output: report.output,
        summary: report.summary,
        completed_at: new Date().toISOString(),
      });
    } else {
      await new Promise((r) => setTimeout(r, 1200));
    }
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, status: 'idle', lastRun: now, runs: newRuns } : x));
    setRunningId(null);
    showToast(`"${a.name}" executed successfully. Click "Results" to view the report.`);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const id = deletingId;
    const name = automations.find((a) => a.id === id)?.name ?? 'Automation';
    setDeletingId(null);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    if (isCustom(id)) {
      const { error } = await supabase.from('automations').delete().eq('id', id);
      if (error) {
        setError('Could not delete the automation. Please try again.');
        await loadAutomations();
      } else {
        showToast(`"${name}" has been removed.`);
      }
    } else {
      const next = new Set(deletedDemoIds);
      next.add(id);
      setDeletedDemoIds(next);
      try { localStorage.setItem('snuffy-deleted-demos', JSON.stringify([...next])); } catch { /* ignore */ }
      showToast(`"${name}" has been removed.`);
    }
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Automations & Tasks"
        description="User-approved workflow automation: reminders, scheduled reports, data monitoring, alerts, and repeatable AI tasks."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" aria-hidden="true" /> New Automation</Button>}
      />

      {error && (
        <Card className="mb-4 p-3 border-danger/40 flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-danger hover:text-danger/70" aria-label="Dismiss error"><span className="text-xs">Dismiss</span></button>
        </Card>
      )}

      {emergencyStop && (
        <Card className="mb-4 p-4 flex items-center gap-3 border-danger/40">
          <OctagonX className="h-5 w-5 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger font-medium">All automations are halted by emergency stop. Resume operations to re-enable.</p>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active', value: automations.filter((a) => a.enabled).length, icon: Play, tone: 'text-success' },
          { label: 'Running', value: automations.filter((a) => a.status === 'running').length, icon: Zap, tone: 'text-accent' },
          { label: 'Paused', value: automations.filter((a) => a.status === 'paused').length, icon: Pause, tone: 'text-warning' },
          { label: 'Total runs', value: automations.reduce((s, a) => s + a.runs, 0), icon: CheckCircle2, tone: 'text-ink-secondary' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <Icon className={cn('h-5 w-5 mb-2', s.tone)} aria-hidden="true" />
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="label-mono mt-0.5">{s.label}</p>
            </Card>
          );
        })}
      </div>

      {loading ? (
        <Card className="p-12 text-center"><p className="text-sm text-ink-muted">Loading automations…</p></Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const custom = isCustom(a.id);
            return (
              <Card key={a.id} className={cn('p-4', !a.enabled && 'opacity-60', emergencyStop && 'opacity-40')}>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center shrink-0"><Workflow className="h-5 w-5 text-accent" aria-hidden="true" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{a.name}</p>
                      <Badge tone={statusTone[a.status]}><StatusDot tone={a.status === 'running' ? 'success' : a.status === 'paused' ? 'warning' : a.status === 'failed' ? 'danger' : 'muted'} label={a.status} /> {a.status}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted mt-1">{a.description}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-mono text-ink-muted uppercase tracking-wider">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" /> {a.schedule}</span>
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3" aria-hidden="true" /> {a.trigger}</span>
                      <span>Last run: {a.lastRun}</span>
                      <span>{a.runs} runs</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleRunNow(a)} disabled={emergencyStop || !a.enabled || runningId !== null} aria-label={`Run ${a.name} now`}>
                      {runningId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Rocket className="h-3.5 w-3.5" aria-hidden="true" />}
                      {runningId === a.id ? 'Running…' : 'Run Now'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setResultsFor(a); loadResults(a.id); }} aria-label={`View results for ${a.name}`}><FileBarChart className="h-3.5 w-3.5" aria-hidden="true" /> Results</Button>
                    <Button size="sm" variant="outline"><Bell className="h-3.5 w-3.5" aria-hidden="true" /> Notify</Button>
                    {a.enabled ? <Button size="sm" variant="ghost" onClick={() => toggle(a.id)}><Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause</Button> : <Button size="sm" variant="ghost" onClick={() => toggle(a.id)}><Play className="h-3.5 w-3.5" aria-hidden="true" /> Enable</Button>}
                    {custom && <Button size="sm" variant="ghost" aria-label={`Edit ${a.name}`} onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>}
                    <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setDeletingId(a.id)}><Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" /></Button>
                    <Toggle checked={a.enabled} onChange={() => toggle(a.id)} disabled={emergencyStop} aria-label={`Toggle ${a.name}`} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-4 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-warning">Approval required for consequential actions</p>
          <p className="text-xs text-ink-muted mt-1">Snuffy will request explicit approval before sending information outside the system or performing destructive operations. Use the Emergency Stop button at any time to halt all automations instantly.</p>
        </div>
      </Card>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(emptyForm); setError(null); }} title="New Automation" titleId="new-automation-title" maxWidth="max-w-lg">
        <div className="p-5 space-y-4">
          <label className="block"><span className="label-mono">Name</span><Input className="mt-1" placeholder="Daily operations report" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoFocus /></label>
          <label className="block"><span className="label-mono">Description</span><Input className="mt-1" placeholder="What does this automation do?" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block"><span className="label-mono">Trigger</span><Select className="mt-1" value={form.trigger} onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}>{triggerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Action</span><Select className="mt-1" value={form.action} onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}>{actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Schedule</span><Select className="mt-1" value={form.schedule} onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))}>{scheduleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setForm(emptyForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create automation'}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editingId !== null} onClose={() => { setEditingId(null); setEditForm(emptyForm); setError(null); }} title="Edit Automation" titleId="edit-automation-title" maxWidth="max-w-lg">
        <div className="p-5 space-y-4">
          <label className="block"><span className="label-mono">Name</span><Input className="mt-1" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></label>
          <label className="block"><span className="label-mono">Description</span><Input className="mt-1" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block"><span className="label-mono">Trigger</span><Select className="mt-1" value={editForm.trigger} onChange={(e) => setEditForm((p) => ({ ...p, trigger: e.target.value }))}>{triggerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Action</span><Select className="mt-1" value={editForm.action} onChange={(e) => setEditForm((p) => ({ ...p, action: e.target.value }))}>{actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Schedule</span><Select className="mt-1" value={editForm.schedule} onChange={(e) => setEditForm((p) => ({ ...p, schedule: e.target.value }))}>{scheduleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditForm(emptyForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleEditSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)} title="Delete automation" titleId="delete-automation-title" maxWidth="max-w-sm">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">Are you sure you want to delete this automation? This cannot be undone.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</Button>
          </div>
        </div>
      </Modal>

      {/* Results drawer */}
      <Modal open={resultsFor !== null} onClose={() => { setResultsFor(null); setRunResults([]); setError(null); }} title={resultsFor ? `Results — ${resultsFor.name}` : 'Results'} titleId="results-title" maxWidth="max-w-2xl">
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {resultsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 text-accent animate-spin" aria-hidden="true" /></div>
          ) : runResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-8 w-8 text-ink-faint mb-2" aria-hidden="true" />
              <p className="text-sm text-ink-muted">No run results yet. Click "Run Now" to execute this automation and generate a report.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runResults.map((r) => (
                <Card key={r.id} className="p-4 border-bg-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={cn('h-4 w-4', r.status === 'success' ? 'text-success' : 'text-danger')} aria-hidden="true" />
                      <span className="text-xs font-medium text-ink-primary">{r.status === 'success' ? 'Completed' : 'Failed'}</span>
                    </div>
                    <span className="text-xs text-ink-muted font-mono">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-ink-secondary mb-2">{r.summary}</p>
                  <pre className="text-xs text-ink-muted font-mono whitespace-pre-wrap bg-bg-base rounded-lg p-3 border border-bg-border overflow-x-auto">{r.output}</pre>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button variant="ghost" size="sm" onClick={() => { setResultsFor(null); setRunResults([]); }}>Close</Button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in" role="status">
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-bg-elevated border border-success/40 shadow-panel">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="text-sm text-ink-primary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
