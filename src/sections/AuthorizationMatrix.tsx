import { ShieldCheck, Lock, Eye, Edit, Trash2, ArrowRightLeft, Download, Settings, ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui';

const roles = [
  'Platform Admin',
  'Platform Auditor',
  'Org Admin',
  'Org Member',
  'Org Viewer',
  'Personal User',
];

const dataTypes = [
  'User Profiles & Accounts',
  'Organizations & Memberships',
  'Documents / Uploads',
  'Personal Knowledge Bases',
  'Organization Knowledge Bases',
  'Shared Knowledge Bases',
  'RAG Indexes & Retrieval',
  'AI Conversations & Outputs',
  'Automations & Outputs',
  'API Keys / Provider Settings',
  'Local AI Endpoint Settings',
  'Audit Logs',
  'Exports',
  'Security & Emergency Stop',
];

type Access = 'full' | 'read' | 'write' | 'admin' | 'none' | 'audit';

const matrix: Record<string, Record<string, { read: Access; create: Access; update: Access; delete: Access; transfer: Access; export: Access; admin: Access; audit: Access }>> = {
  'User Profiles & Accounts': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'none', transfer: 'none', export: 'read', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'none', update: 'write', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'none', update: 'write', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'Organizations & Memberships': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'none', transfer: 'write', export: 'read', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Documents / Uploads': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'write', export: 'write', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'Personal Knowledge Bases': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'read' },
    'Org Member': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'Organization Knowledge Bases': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'write', export: 'write', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'write', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Shared Knowledge Bases': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'write', export: 'write', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'none', update: 'write', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'RAG Indexes & Retrieval': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'none', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'write', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'AI Conversations & Outputs': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'none', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'Automations & Outputs': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'full', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'write', export: 'write', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'read', admin: 'none', audit: 'none' },
  },
  'API Keys / Provider Settings': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'none', export: 'none', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'none', admin: 'write', audit: 'read' },
    'Org Member': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'write', delete: 'write', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Local AI Endpoint Settings': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'none', export: 'none', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'read' },
    'Org Member': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Audit Logs': {
    'Platform Admin': { read: 'full', create: 'none', update: 'none', delete: 'full', transfer: 'none', export: 'full', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'full', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'full', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'read', admin: 'none', audit: 'read' },
    'Org Member': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Exports': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'none', export: 'none', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'write', update: 'none', delete: 'write', transfer: 'none', export: 'none', admin: 'write', audit: 'read' },
    'Org Member': { read: 'read', create: 'write', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'read', create: 'write', update: 'none', delete: 'write', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
  'Security & Emergency Stop': {
    'Platform Admin': { read: 'full', create: 'full', update: 'full', delete: 'full', transfer: 'none', export: 'none', admin: 'full', audit: 'full' },
    'Platform Auditor': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'full' },
    'Org Admin': { read: 'read', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'read' },
    'Org Member': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Org Viewer': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
    'Personal User': { read: 'none', create: 'none', update: 'none', delete: 'none', transfer: 'none', export: 'none', admin: 'none', audit: 'none' },
  },
};

const operations = [
  { key: 'read', label: 'Read', icon: Eye },
  { key: 'create', label: 'Create', icon: ShieldCheck },
  { key: 'update', label: 'Update', icon: Edit },
  { key: 'delete', label: 'Delete', icon: Trash2 },
  { key: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
  { key: 'export', label: 'Export', icon: Download },
  { key: 'admin', label: 'Admin', icon: Settings },
  { key: 'audit', label: 'Audit', icon: ScrollText },
] as const;

function accessBadge(access: Access) {
  switch (access) {
    case 'full': return <Badge tone="accent">Full</Badge>;
    case 'admin': return <Badge tone="accent">Admin</Badge>;
    case 'write': return <Badge tone="accent">Write</Badge>;
    case 'read': return <Badge tone="success">Read</Badge>;
    case 'audit': return <Badge tone="warning">Audit</Badge>;
    default: return <span className="text-xs text-ink-faint">—</span>;
  }
}

export function AuthorizationMatrix() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold">Authorization Matrix</h1>
        </div>
        <p className="text-sm text-ink-muted mt-1">
          Role-based access control for all data types. Deny by default — the most restrictive applicable rule wins unless a platform administrator grants an approved exception.
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-elevated border border-bg-border">
        <Lock className="h-4 w-4 text-ink-muted shrink-0" />
        <p className="text-xs text-ink-muted">
          This matrix is enforced through backend authorization, database row-level security policies, and API/Edge Function checks. Client-side display is for documentation only.
        </p>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left py-2 px-3 sticky left-0 bg-bg-base z-10">
                <span className="label-mono">Data Type / Role</span>
              </th>
              {roles.map((role) => (
                <th key={role} className="text-center py-2 px-2 min-w-[120px]">
                  <span className="text-xs font-medium text-ink-secondary">{role}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataTypes.map((dt) => (
              <tr key={dt} className="border-b border-bg-border hover:bg-bg-elevated/50">
                <td className="py-2 px-3 sticky left-0 bg-bg-base z-10">
                  <span className="text-xs font-medium">{dt}</span>
                </td>
                {roles.map((role) => {
                  const perms = matrix[dt]?.[role];
                  return (
                    <td key={role} className="text-center py-1.5 px-1">
                      <div className="flex flex-wrap justify-center gap-0.5">
                        {operations.map((op) => (
                          <span key={op.key} title={`${op.label}: ${perms?.[op.key] ?? 'none'}`}>
                            {accessBadge(perms?.[op.key] ?? 'none')}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel-base rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Conflict Resolution</h3>
          <p className="text-xs text-ink-muted">
            When multiple roles apply to a user, the most restrictive rule wins. For example, if a user is both an Org Admin and a Personal User, they get Personal User access to personal data and Org Admin access to organization data — never the reverse.
          </p>
        </div>
        <div className="panel-base rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Exception Process</h3>
          <p className="text-xs text-ink-muted">
            Platform administrators can grant approved exceptions for specific data types and roles. All exceptions are logged with the approver, reason, scope, and timestamp.
          </p>
        </div>
      </div>
    </div>
  );
}
