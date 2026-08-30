import { useState } from 'react';
import { Card, SectionHeader, Badge, Button, Input, Select } from '@/components/ui';
import { demoAudit } from '@/data/demo';
import { cn } from '@/lib/utils';
import { ScrollText, Search, Download, ShieldCheck, Lock, FileArchive, Filter } from 'lucide-react';

const severityTone = { info: 'accent', warning: 'warning', critical: 'danger' } as const;
const severityDot = { info: 'bg-accent', warning: 'bg-warning', critical: 'bg-danger' } as const;

export function AuditLogs() {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [section, setSection] = useState('all');
  const [exporting, setExporting] = useState(false);

  const sections = ['all', ...Array.from(new Set(demoAudit.map((e) => e.section)))];
  const filtered = demoAudit.filter((e) =>
    (severity === 'all' || e.severity === severity) &&
    (section === 'all' || e.section === section) &&
    (e.action.toLowerCase().includes(search.toLowerCase()) || e.actor.toLowerCase().includes(search.toLowerCase()) || e.target.toLowerCase().includes(search.toLowerCase()))
  );

  const exportReport = () => {
    setExporting(true);
    try {
      const headers = ['Timestamp', 'Actor', 'Action', 'Target', 'Section', 'Severity', 'IP'];
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = filtered.map((e) => [e.timestamp, e.actor, e.action, e.target, e.section, e.severity, e.ip].map(escape).join(','));
      const csv = [headers.map(escape).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Activity & Audit Logs"
        description="Immutable, chain-of-custody audit trail of every action across the system. Exportable for compliance review."
        actions={<Button variant="primary" onClick={exportReport} disabled={exporting || filtered.length === 0}><Download className="h-4 w-4" aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export Report'}</Button>}
      />

      {/* Compliance banner */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 flex items-center gap-3"><Lock className="h-5 w-5 text-success" aria-hidden="true" /><div><p className="text-sm font-medium">Immutable</p><p className="text-xs text-ink-muted">Append-only, tamper-evident</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-sm font-medium">Chain of custody</p><p className="text-xs text-ink-muted">Full metadata retained</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><FileArchive className="h-5 w-5 text-warning" aria-hidden="true" /><div><p className="text-sm font-medium">Legal hold ready</p><p className="text-xs text-ink-muted">Redaction & export support</p></div></Card>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-faint" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, action, or target…" className="pl-8" />
          </div>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-auto min-w-[120px]">
            <option value="all">All severities</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
          </Select>
          <Select value={section} onChange={(e) => setSection(e.target.value)} className="w-auto min-w-[120px]">
            <option value="all">All sections</option>
            {sections.filter((s) => s !== 'all').map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Badge tone="muted"><Filter className="h-3 w-3" aria-hidden="true" /> {filtered.length} entries</Badge>
        </div>
      </Card>

      {/* Log table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th scope="col" className="text-left label-mono px-4 py-3">Timestamp</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Actor</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Action</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">Target</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">Section</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden lg:table-cell">IP</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted whitespace-nowrap">{e.timestamp}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">{e.actor}</td>
                  <td className="px-4 py-3 text-xs text-ink-primary">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary hidden md:table-cell">{e.target}</td>
                  <td className="px-4 py-3 hidden lg:table-cell"><Badge tone="muted">{e.section}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint hidden lg:table-cell">{e.ip}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('h-1.5 w-1.5 rounded-full', severityDot[e.severity])} />
                      <Badge tone={severityTone[e.severity]}>{e.severity}</Badge>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center"><ScrollText className="h-8 w-8 text-ink-faint mx-auto mb-2" aria-hidden="true" /><p className="text-sm text-ink-muted">No audit entries match your filters.</p></div>
        )}
      </Card>
    </div>
  );
}
