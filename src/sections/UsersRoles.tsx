import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, StatusDot, Select, Input } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { demoUsers } from '@/data/demo';
import { supabase, getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { User, Role } from '@/types';
import { Users, ShieldCheck, KeyRound, UserCog, Lock, Eye, ScrollText, Cpu, FileText, Database, Mic, Workflow, Plug, Trash2, Mail, Pencil, UserPlus, Cloud, AlertTriangle, Loader2, Plus } from 'lucide-react';

const iconMap: Record<string, typeof FileText> = {
  Cpu, FileText, Database, Mic, Workflow, ScrollText, Plug, UserCog,
};

const roleTone: Record<string, 'danger' | 'warning' | 'accent' | 'muted' | 'success'> = {
  Administrator: 'danger', Operator: 'warning', Analyst: 'accent', Auditor: 'muted', Viewer: 'success',
};
const statusTone = { active: 'success', suspended: 'danger', invited: 'warning' } as const;
const roleOptions: Role[] = ['Administrator', 'Operator', 'Analyst', 'Auditor', 'Viewer'];
const statusOptions = ['invited', 'active', 'suspended'] as const;

const accessLevels = ['full', 'admin', 'write', 'read', 'none'] as const;

const iconOptions = ['Cpu', 'FileText', 'Database', 'Mic', 'Workflow', 'ScrollText', 'Plug', 'UserCog'] as const;

interface RolePermission {
  id: string;
  capability: string;
  capability_icon: string | null;
  role: string;
  access_level: string;
}

const emptyCapForm = { name: '', icon: 'Cpu' as string };

const oauthProviders = [
  { value: 'google', label: 'Google', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', userinfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo' },
  { value: 'github', label: 'GitHub', authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', userinfoUrl: 'https://api.github.com/user' },
  { value: 'azure', label: 'Microsoft', authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo' },
];

const emptyUserForm = { name: '', email: '', role: 'Viewer' as string, status: 'invited' as string, mfa: false };
const emptyOAuthConfig = { provider: 'google', clientId: '', clientSecret: '' };

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function UsersRoles() {
  const [roleFilter, setRoleFilter] = useState('all');
  const [allUsers, setAllUsers] = useState<User[]>(demoUsers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showOAuth, setShowOAuth] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [showAddCap, setShowAddCap] = useState(false);
  const [deletingCap, setDeletingCap] = useState<string | null>(null);
  const [permSaving, setPermSaving] = useState(false);
  const [permLoading, setPermLoading] = useState(true);
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([]);
  const [capForm, setCapForm] = useState(emptyCapForm);

  // Forms
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editForm, setEditForm] = useState(emptyUserForm);
  const [inviteForm, setInviteForm] = useState(emptyUserForm);
  const [oauthForm, setOauthForm] = useState(emptyOAuthConfig);
  const [oauthConfigs, setOAuthConfigs] = useState<Record<string, boolean>>({});

  const oauthFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth`;
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, status, mfa, permissions, oauth_provider, oauth_id, avatar_url, last_active, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setError('Could not load users.');
      return;
    }
    const mapped: User[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      role: r.role as Role,
      status: r.status as User['status'],
      mfa: r.mfa as boolean,
      lastActive: (r.last_active as string) ?? 'Never',
      permissions: (r.permissions as string[]) ?? [],
      oauthProvider: (r.oauth_provider as string) ?? undefined,
      oauthId: (r.oauth_id as string) ?? undefined,
      avatarUrl: (r.avatar_url as string) ?? undefined,
    }));
    setAllUsers([...mapped, ...demoUsers]);
    setError(null);
  }, []);

  const loadOAuthConfigs = useCallback(async () => {
    const { data } = await supabase
      .from('oauth_configs')
      .select('provider, enabled');
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: Record<string, unknown>) => {
      map[r.provider as string] = r.enabled as boolean;
    });
    setOAuthConfigs(map);
  }, []);

  const loadRolePerms = useCallback(async () => {
    const { data, error } = await supabase.from('role_permissions').select('id, capability, capability_icon, role, access_level').order('capability');
    if (error) return;
    setRolePerms(data ?? []);
    setPermLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadOAuthConfigs(), loadRolePerms()]);
      setLoading(false);
    })();
  }, [loadUsers, loadOAuthConfigs, loadRolePerms]);

  // Build matrix from DB rows
  const capabilities = Array.from(new Set(rolePerms.map((p) => p.capability)));
  const getAccess = (cap: string, role: string): string => rolePerms.find((p) => p.capability === cap && p.role === role)?.access_level ?? 'none';


  const handleAccessChange = async (capability: string, role: string, newLevel: string) => {
    const existing = rolePerms.find((p) => p.capability === capability && p.role === role);
    setPermSaving(true);
    if (existing) {
      const { error } = await supabase.from('role_permissions').update({ access_level: newLevel }).eq('id', existing.id);
      if (error) { setError('Could not update permission.'); setPermSaving(false); return; }
      setRolePerms((prev) => prev.map((p) => p.id === existing.id ? { ...p, access_level: newLevel } : p));
    } else {
      const capIcon = rolePerms.find((p) => p.capability === capability)?.capability_icon ?? 'Cpu';
      const { data, error } = await supabase.from('role_permissions').insert({ capability, capability_icon: capIcon, role, access_level: newLevel }).select('id, capability, capability_icon, role, access_level').single();
      if (error) { setError('Could not set permission.'); setPermSaving(false); return; }
      setRolePerms((prev) => [...prev, data]);
    }
    setPermSaving(false);
  };

  const handleAddCapability = async () => {
    const name = capForm.name.trim();
    if (!name) return;
    if (capabilities.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setError('A capability with that name already exists.');
      return;
    }
    setPermSaving(true);
    setError(null);
    const rows = roleOptions.map((role) => ({ capability: name, capability_icon: capForm.icon, role, access_level: 'none' }));
    const { data, error } = await supabase.from('role_permissions').insert(rows).select('id, capability, capability_icon, role, access_level');
    setPermSaving(false);
    if (error) { setError('Could not add capability.'); return; }
    setRolePerms((prev) => [...prev, ...(data ?? [])]);
    setCapForm(emptyCapForm);
    setShowAddCap(false);
    showToast(`Capability "${name}" added.`);
  };

  const handleDeleteCapability = async () => {
    if (!deletingCap) return;
    const capName = deletingCap;
    setDeletingCap(null);
    setPermSaving(true);
    const { error } = await supabase.from('role_permissions').delete().eq('capability', capName);
    setPermSaving(false);
    if (error) { setError('Could not delete capability.'); return; }
    setRolePerms((prev) => prev.filter((p) => p.capability !== capName));
    showToast(`Capability "${capName}" removed.`);
  };

  const filtered = roleFilter === 'all' ? allUsers : allUsers.filter((u) => u.role === roleFilter);
  const isCustom = (id: string) => !demoUsers.some((d) => d.id === id);

  // Create a user manually
  const handleAddUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const row = {
      name: userForm.name.trim(),
      email: userForm.email.trim(),
      role: userForm.role,
      status: userForm.status,
      mfa: userForm.mfa,
      permissions: [] as string[],
    };
    const { data, error: insertError } = await supabase.from('users').insert(row).select('id').single();
    setSaving(false);
    if (insertError) {
      setError('Could not add the user. Please try again.');
      return;
    }
    const newUser: User = {
      id: data.id,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      status: row.status as User['status'],
      mfa: row.mfa,
      lastActive: 'Never',
      permissions: [],
    };
    setAllUsers((prev) => [newUser, ...prev]);
    setUserForm(emptyUserForm);
    setShowAdd(false);
    showToast(`User "${row.name}" added.`);
  };

  // Invite a user (creates with 'invited' status)
  const handleInvite = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const row = {
      name: inviteForm.name.trim(),
      email: inviteForm.email.trim(),
      role: inviteForm.role,
      status: 'invited',
      mfa: false,
      permissions: [] as string[],
    };
    const { data, error: insertError } = await supabase.from('users').insert(row).select('id').single();
    setSaving(false);
    if (insertError) {
      setError('Could not invite the user. Please try again.');
      return;
    }
    const newUser: User = {
      id: data.id,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      status: 'invited',
      mfa: false,
      lastActive: 'Never',
      permissions: [],
    };
    setAllUsers((prev) => [newUser, ...prev]);
    setInviteForm(emptyUserForm);
    setShowInvite(false);
    showToast(`Invitation sent to ${row.email}`);
  };

  // Edit user
  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, status: u.status, mfa: u.mfa });
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('users').update({
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role,
      status: editForm.status,
      mfa: editForm.mfa,
    }).eq('id', editingUser.id);
    setSaving(false);
    if (updateError) {
      setError('Could not update the user. Please try again.');
      return;
    }
    setAllUsers((prev) => prev.map((u) => u.id === editingUser.id ? {
      ...u,
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role as Role,
      status: editForm.status as User['status'],
      mfa: editForm.mfa,
    } : u));
    setEditingUser(null);
    showToast('User updated successfully.');
  };

  // Suspend/reactivate
  const toggleSuspend = async (u: User) => {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    setAllUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: newStatus } : x));
    if (isCustom(u.id)) {
      const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', u.id);
      if (error) {
        setAllUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: u.status } : x));
        setError('Could not update the user. Please try again.');
        return;
      }
    }
    showToast(newStatus === 'suspended' ? `${u.name} has been suspended.` : `${u.name} has been reactivated.`);
  };

  // Delete user
  const handleDelete = async () => {
    if (!deletingUser) return;
    const id = deletingUser.id;
    const name = deletingUser.name;
    setDeletingUser(null);
    if (!isCustom(id)) {
      setError('Demo users cannot be deleted.');
      return;
    }
    setAllUsers((prev) => prev.filter((u) => u.id !== id));
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      setError('Could not delete the user. Please try again.');
      await loadUsers();
    } else {
      showToast(`${name} has been removed.`);
    }
  };

  // Save OAuth provider config
  const handleOAuthSave = async () => {
    if (!oauthForm.clientId.trim() || !oauthForm.clientSecret.trim()) {
      setError('Client ID and secret are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const prov = oauthProviders.find((p) => p.value === oauthForm.provider)!;
    // Upsert: if config exists for this provider, update; otherwise insert
    const { data: existing } = await supabase
      .from('oauth_configs')
      .select('id')
      .eq('provider', oauthForm.provider)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase.from('oauth_configs').update({
        client_id: oauthForm.clientId.trim(),
        client_secret: oauthForm.clientSecret.trim(),
        auth_url: prov.authUrl,
        token_url: prov.tokenUrl,
        userinfo_url: prov.userinfoUrl,
        enabled: true,
      }).eq('id', existing.id);
      if (updateError) {
        setError('Could not save OAuth configuration. Please try again.');
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from('oauth_configs').insert({
        provider: oauthForm.provider,
        client_id: oauthForm.clientId.trim(),
        client_secret: oauthForm.clientSecret.trim(),
        auth_url: prov.authUrl,
        token_url: prov.tokenUrl,
        userinfo_url: prov.userinfoUrl,
        scopes: 'openid email profile',
        enabled: true,
      });
      if (insertError) {
        setError('Could not save OAuth configuration. Please try again.');
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setOAuthConfigs((prev) => ({ ...prev, [oauthForm.provider]: true }));
    setOauthForm(emptyOAuthConfig);
    setShowOAuth(false);
    showToast(`${prov.label} OAuth configured. You can now import users from ${prov.label}.`);
  };

  // Initiate OAuth login flow
  const handleOAuthLogin = async (provider: string) => {
    const redirectUri = window.location.origin + '/users';
    try {
      const resp = await fetch(oauthFunctionUrl + '?action=authorize&provider=' + provider + '&redirect_uri=' + encodeURIComponent(redirectUri), {
        headers: functionHeaders,
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setError('Could not start OAuth flow. Make sure the OAuth provider is configured.');
    }
  };

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Users, Roles & Permissions"
        description="Role-based access control with multi-factor authentication, session management, and granular permissions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setShowOAuth(true)}><Cloud className="h-4 w-4" aria-hidden="true" /> OAuth2</Button>
            <Button variant="ghost" onClick={() => setShowInvite(true)}><Mail className="h-4 w-4" aria-hidden="true" /> Invite</Button>
            <Button variant="primary" onClick={() => setShowAdd(true)}><UserPlus className="h-4 w-4" aria-hidden="true" /> Add User</Button>
          </div>
        }
      />

      {error && (
        <Card className="mb-4 p-3 border-danger/40 flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-danger hover:text-danger/70" aria-label="Dismiss error"><span className="text-xs">Dismiss</span></button>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total users', value: allUsers.length, icon: Users, tone: 'text-accent' },
          { label: 'With MFA', value: allUsers.filter((u) => u.mfa).length, icon: ShieldCheck, tone: 'text-success' },
          { label: 'Active sessions', value: allUsers.filter((u) => u.status === 'active').length, icon: KeyRound, tone: 'text-warning' },
          { label: 'Administrators', value: allUsers.filter((u) => u.role === 'Administrator').length, icon: Lock, tone: 'text-danger' },
        ].map((s) => {
          const Icon = s.icon;
          return <Card key={s.label} className="p-4"><Icon className={cn('h-5 w-5 mb-2', s.tone)} aria-hidden="true" /><p className="text-2xl font-semibold">{s.value}</p><p className="label-mono mt-0.5">{s.label}</p></Card>;
        })}
      </div>

      {/* Users table */}
      <Card className="mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">{loading ? 'Loading…' : `${filtered.length} users`}</h3>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-auto min-w-[120px]">
            <option value="all">All roles</option>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-border">
                <th scope="col" className="text-left label-mono px-4 py-3">User</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Role</th>
                <th scope="col" className="text-left label-mono px-4 py-3">MFA</th>
                <th scope="col" className="text-left label-mono px-4 py-3 hidden md:table-cell">Last active</th>
                <th scope="col" className="text-left label-mono px-4 py-3">Status</th>
                <th scope="col" className="text-right label-mono px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={`${u.name} avatar`} className="h-8 w-8 rounded-full border border-accent/30" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent">{initials(u.name)}</div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-ink-primary">{u.name}</p>
                          {u.oauthProvider && <Cloud className="h-3 w-3 text-ink-muted" aria-hidden="true" />}
                        </div>
                        <p className="text-xs text-ink-muted font-mono">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={roleTone[u.role]}>{u.role}</Badge></td>
                  <td className="px-4 py-3">{u.mfa ? <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /> : <Eye className="h-4 w-4 text-ink-faint" aria-hidden="true" />}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted hidden md:table-cell">{u.lastActive}</td>
                  <td className="px-4 py-3"><span className="flex items-center gap-1.5"><StatusDot tone={statusTone[u.status]} label={u.status} /><Badge tone={statusTone[u.status] === 'success' ? 'success' : statusTone[u.status] === 'danger' ? 'danger' : 'warning'}>{u.status}</Badge></span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                      <Button size="sm" variant="ghost" aria-label={u.status === 'suspended' ? `Reactivate ${u.name}` : `Suspend ${u.name}`} onClick={() => toggleSuspend(u)}>
                        {u.status === 'suspended' ? <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
                      </Button>
                      {isCustom(u.id) && <Button size="sm" variant="ghost" aria-label={`Delete ${u.name}`} onClick={() => setDeletingUser(u)}><Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Permission matrix */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Role Permission Matrix</h3></div>
          <div className="flex items-center gap-2">
            {permSaving && <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" aria-hidden="true" />}
            <Button size="sm" variant="ghost" onClick={() => setShowAddCap(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Capability</Button>
          </div>
        </div>
        {permLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 text-accent animate-spin" aria-hidden="true" /></div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bg-border">
                  <th scope="col" className="text-left label-mono px-4 py-3">Capability</th>
                  {roleOptions.map((r) => <th key={r} scope="col" className="text-center label-mono px-4 py-3">{r}</th>)}
                  <th scope="col" className="text-right label-mono px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border">
                {capabilities.map((cap) => {
                  const iconName = rolePerms.find((p) => p.capability === cap)?.capability_icon ?? 'Cpu';
                  const Icon = iconMap[iconName] ?? FileText;
                  return (
                    <tr key={cap} className="hover:bg-bg-hover transition-colors group">
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" /><span className="text-xs text-ink-primary">{cap}</span></div></td>
                      {roleOptions.map((r) => {
                        const level = getAccess(cap, r);
                        return (
                          <td key={r} className="px-4 py-3 text-center">
                            <select
                              value={level}
                              onChange={(e) => handleAccessChange(cap, r, e.target.value)}
                              disabled={permSaving}
                              className={cn(
                                'rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition-colors focus:outline-none focus:ring-1',
                                level === 'full' ? 'border-success/40 bg-success/10 text-success' :
                                level === 'admin' ? 'border-danger/40 bg-danger/10 text-danger' :
                                level === 'write' ? 'border-warning/40 bg-warning/10 text-warning' :
                                level === 'read' ? 'border-accent/40 bg-accent/10 text-accent' :
                                'border-bg-border bg-bg-base text-ink-muted',
                              )}
                            >
                              {accessLevels.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDeletingCap(cap)}
                          className="p-1 rounded text-ink-faint hover:text-danger hover:bg-danger-soft/30 opacity-0 group-hover:opacity-100 transition-all"
                          aria-label={`Delete ${cap} capability`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add User modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setUserForm(emptyUserForm); setError(null); }} title="Add User" titleId="add-user-title" maxWidth="max-w-md">
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">Add a user directly to the platform. They'll have immediate access with the role and status you select.</p>
          <label className="block"><span className="label-mono">Full name</span><Input className="mt-1" placeholder="Jane Doe" value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} autoFocus /></label>
          <label className="block"><span className="label-mono">Email address</span><Input className="mt-1" type="email" placeholder="jane@company.com" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label-mono">Role</span><Select className="mt-1" value={userForm.role} onChange={(e) => setUserForm((p) => ({ ...p, role: e.target.value }))}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Status</span><Select className="mt-1" value={userForm.status} onChange={(e) => setUserForm((p) => ({ ...p, status: e.target.value }))}>{statusOptions.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</Select></label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={userForm.mfa} onChange={(e) => setUserForm((p) => ({ ...p, mfa: e.target.checked }))} className="h-4 w-4 rounded border-bg-border" />
            <span className="text-sm text-ink-secondary">Require multi-factor authentication</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setUserForm(emptyUserForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAddUser} disabled={saving}><UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> {saving ? 'Adding…' : 'Add user'}</Button>
          </div>
        </div>
      </Modal>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setInviteForm(emptyUserForm); setError(null); }} title="Invite User" titleId="invite-user-title" maxWidth="max-w-md">
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">Invite a new team member. They'll receive an email invitation to join the platform with the role you select.</p>
          <label className="block"><span className="label-mono">Full name</span><Input className="mt-1" placeholder="Jane Doe" value={inviteForm.name} onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))} autoFocus /></label>
          <label className="block"><span className="label-mono">Email address</span><Input className="mt-1" type="email" placeholder="jane@company.com" value={inviteForm.email} onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} /></label>
          <label className="block"><span className="label-mono">Role</span><Select className="mt-1" value={inviteForm.role} onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowInvite(false); setInviteForm(emptyUserForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleInvite} disabled={saving}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> {saving ? 'Sending…' : 'Send invite'}</Button>
          </div>
        </div>
      </Modal>

      {/* OAuth2 modal */}
      <Modal open={showOAuth} onClose={() => { setShowOAuth(false); setOauthForm(emptyOAuthConfig); setError(null); }} title="OAuth2 User Import" titleId="oauth-title" maxWidth="max-w-lg">
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">Configure an OAuth2 provider to let users sign in with their existing accounts. New users are automatically imported with Viewer role.</p>

          {/* Configured providers */}
          <div className="space-y-2">
            <span className="label-mono">Providers</span>
            {oauthProviders.map((p) => {
              const enabled = oauthConfigs[p.value];
              return (
                <div key={p.value} className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
                  <div className="flex items-center gap-2">
                    <Cloud className={cn('h-4 w-4', enabled ? 'text-success' : 'text-ink-faint')} aria-hidden="true" />
                    <span className="text-sm font-medium">{p.label}</span>
                    {enabled && <Badge tone="success">Configured</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {enabled && <Button size="sm" variant="outline" onClick={() => handleOAuthLogin(p.value)}>Sign in with {p.label}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setOauthForm((prev) => ({ ...prev, provider: p.value, clientId: '', clientSecret: '' }))}>{enabled ? 'Edit' : 'Configure'}</Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Config form */}
          <div className="space-y-3 pt-2 border-t border-bg-border">
            <label className="block"><span className="label-mono">Provider</span><Select className="mt-1" value={oauthForm.provider} onChange={(e) => setOauthForm((p) => ({ ...p, provider: e.target.value }))}>{oauthProviders.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Client ID</span><Input className="mt-1" placeholder="your-client-id" value={oauthForm.clientId} onChange={(e) => setOauthForm((p) => ({ ...p, clientId: e.target.value }))} /></label>
            <label className="block"><span className="label-mono">Client secret</span><Input type="password" className="mt-1" placeholder="your-client-secret" value={oauthForm.clientSecret} onChange={(e) => setOauthForm((p) => ({ ...p, clientSecret: e.target.value }))} /></label>
            <p className="text-xs text-ink-muted">Set the redirect URI in your OAuth provider to: <span className="font-mono">{typeof window !== 'undefined' ? window.location.origin + '/users' : 'https://your-app/users'}</span></p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowOAuth(false); setOauthForm(emptyOAuthConfig); setError(null); }}>Close</Button>
            <Button variant="primary" size="sm" onClick={handleOAuthSave} disabled={saving || !oauthForm.clientId.trim()}>{saving ? 'Saving…' : 'Save configuration'}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editingUser !== null} onClose={() => { setEditingUser(null); setError(null); }} title="Edit User" titleId="edit-user-title" maxWidth="max-w-md">
        <div className="p-5 space-y-4">
          <label className="block"><span className="label-mono">Full name</span><Input className="mt-1" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></label>
          <label className="block"><span className="label-mono">Email address</span><Input className="mt-1" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label-mono">Role</span><Select className="mt-1" value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></label>
            <label className="block"><span className="label-mono">Status</span><Select className="mt-1" value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}>{statusOptions.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</Select></label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editForm.mfa} onChange={(e) => setEditForm((p) => ({ ...p, mfa: e.target.checked }))} className="h-4 w-4 rounded border-bg-border" />
            <span className="text-sm text-ink-secondary">Require multi-factor authentication</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditingUser(null); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleEditSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </Modal>

      {/* Add capability modal */}
      <Modal open={showAddCap} onClose={() => { setShowAddCap(false); setCapForm(emptyCapForm); setError(null); }} title="Add Capability" titleId="add-cap-title" maxWidth="max-w-md">
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-secondary">Add a new capability row to the permission matrix. All roles default to "none" access.</p>
          <label className="block"><span className="label-mono">Capability name</span><Input className="mt-1" placeholder="e.g. Reports, Settings, API Keys" value={capForm.name} onChange={(e) => setCapForm((p) => ({ ...p, name: e.target.value }))} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleAddCapability(); }} /></label>
          <label className="block"><span className="label-mono">Icon</span><Select className="mt-1" value={capForm.icon} onChange={(e) => setCapForm((p) => ({ ...p, icon: e.target.value }))}>{iconOptions.map((i) => <option key={i} value={i}>{i}</option>)}</Select></label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowAddCap(false); setCapForm(emptyCapForm); setError(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAddCapability} disabled={permSaving || !capForm.name.trim()}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> {permSaving ? 'Adding…' : 'Add capability'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete capability confirmation */}
      <Modal open={deletingCap !== null} onClose={() => setDeletingCap(null)} title="Delete capability" titleId="delete-cap-title" maxWidth="max-w-sm">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">Are you sure you want to remove the <span className="font-medium text-ink-primary">{deletingCap}</span> capability from the permission matrix? All role assignments for this capability will be deleted.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeletingCap(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteCapability}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete capability</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deletingUser !== null} onClose={() => setDeletingUser(null)} title="Remove user" titleId="delete-user-title" maxWidth="max-w-sm">
        <div className="p-5">
          <p className="text-sm text-ink-secondary">
            Are you sure you want to remove <span className="font-medium text-ink-primary">{deletingUser?.name}</span>? This will revoke their access immediately. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setDeletingUser(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove user</Button>
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in" role="status">
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-bg-elevated border border-success/40 shadow-panel">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="text-sm text-ink-primary">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
