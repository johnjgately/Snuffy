import { useState, useEffect } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, Input, Field } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, Lock, Download, Upload, Eye, Trash2, Key, Server, Globe, Database, FileText, Activity, AlertTriangle, History, FileArchive, FlaskConical, CheckCircle2, Copy, Smartphone } from 'lucide-react';

type MfaStatus = 'idle' | 'enrolling' | 'verifying' | 'enabled';

interface MfaEnrollResponse {
  secret?: string;
  otpauth_url?: string;
  error?: string;
}

interface MfaVerifyResponse {
  recovery_codes?: string[];
  error?: string;
}

interface MfaStatusResponse {
  mfa_enabled?: boolean;
  error?: string;
}

export function SecuritySettings() {
  const { branding, setBranding, demoMode, setDemoMode } = useApp();
  const [showConfirm, setShowConfirm] = useState(false);
  const [retention, setRetention] = useState('90');
  const [encryption, setEncryption] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');

  // MFA enrollment state
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('idle');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaOtpauthUrl, setMfaOtpauthUrl] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showDisableMfa, setShowDisableMfa] = useState(false);
  const [stepUpCode, setStepUpCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Check current MFA status on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=mfa-status`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token ?? ''}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          },
        );
        const json: MfaStatusResponse = await res.json();
        if (!cancelled && !json.error) {
          setMfaEnabled(Boolean(json.mfa_enabled));
        }
      } catch {
        // ignore — status stays default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function callAuthApi<T>(action: string, body: Record<string, unknown>): Promise<T> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    return (await res.json()) as T;
  }

  async function handleEnrollMfa() {
    setMfaError('');
    setMfaLoading(true);
    setRecoveryCodes([]);
    try {
      const data = await callAuthApi<MfaEnrollResponse>('mfa-enroll', {});
      if (data.error) {
        setMfaError(data.error);
      } else if (data.secret && data.otpauth_url) {
        setMfaSecret(data.secret);
        setMfaOtpauthUrl(data.otpauth_url);
        setMfaStatus('enrolling');
      } else {
        setMfaError('Unexpected response from enrollment service.');
      }
    } catch {
      setMfaError('Failed to reach the authentication service.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleVerifyMfa() {
    setMfaError('');
    if (mfaCode.length !== 6) {
      setMfaError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setMfaLoading(true);
    setMfaStatus('verifying');
    try {
      const data = await callAuthApi<MfaVerifyResponse>('mfa-verify', { code: mfaCode, secret: mfaSecret });
      if (data.error) {
        setMfaError(data.error);
        setMfaStatus('enrolling');
      } else if (data.recovery_codes && data.recovery_codes.length > 0) {
        setRecoveryCodes(data.recovery_codes);
        setMfaEnabled(true);
        setMfaStatus('enabled');
        setMfaCode('');
      } else {
        setMfaError('Verification did not return recovery codes.');
        setMfaStatus('enrolling');
      }
    } catch {
      setMfaError('Failed to verify the code.');
      setMfaStatus('enrolling');
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleDisableMfa() {
    setMfaError('');
    if (stepUpCode.length !== 6) {
      setMfaError('Enter your current 6-digit MFA code to confirm.');
      return;
    }
    setMfaLoading(true);
    try {
      const data = await callAuthApi<{ error?: string }>('mfa-disable', { code: stepUpCode });
      if (data.error) {
        setMfaError(data.error);
      } else {
        setMfaEnabled(false);
        setMfaStatus('idle');
        setMfaSecret('');
        setMfaOtpauthUrl('');
        setMfaCode('');
        setRecoveryCodes([]);
        setShowDisableMfa(false);
        setStepUpCode('');
      }
    } catch {
      setMfaError('Failed to disable MFA.');
    } finally {
      setMfaLoading(false);
    }
  }

  function resetEnrollment() {
    setMfaStatus('idle');
    setMfaSecret('');
    setMfaOtpauthUrl('');
    setMfaCode('');
    setRecoveryCodes([]);
    setMfaError('');
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {
        // clipboard unavailable — no-op
      },
    );
  }

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Security, Privacy & System Settings"
        description="Authentication, encryption, data retention, backups, compliance, and configurable branding."
      />

      {/* Security posture */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Encryption', value: 'Supabase managed', icon: Lock, tone: 'text-success', sub: 'Transport & storage protection' },
          { label: 'MFA setting', value: mfaRequired ? 'Preferred' : 'Off', icon: ShieldCheck, tone: mfaRequired ? 'text-warning' : 'text-danger', sub: 'Not enforced globally' },
          { label: 'Session setting', value: `${sessionTimeout} min`, icon: Activity, tone: 'text-accent', sub: 'Local preference' },
          { label: 'Audit retention', value: `${retention} days`, icon: History, tone: 'text-warning', sub: 'Local display setting' },
        ].map((s) => {
          const Icon = s.icon;
          return <Card key={s.label} className="p-4"><div className="flex items-center justify-between"><Icon className={cn('h-5 w-5', s.tone)} aria-hidden="true" /><Badge tone="success">Active</Badge></div><p className="text-lg font-semibold mt-2">{s.value}</p><p className="label-mono mt-0.5">{s.label}</p><p className="text-xs text-ink-faint mt-0.5">{s.sub}</p></Card>;
        })}
      </div>

      <Card className="mb-4 p-4 border-success/30 bg-success-soft/10">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink-primary">Database protection is active</p>
            <p className="text-xs text-ink-secondary mt-1">Your saved connections, documents, knowledge records, and automations are now separated by account. Provider secrets are hidden from browser reads, private storage is account-scoped, and OAuth callbacks use one-time state protection.</p>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Authentication */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Key className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Authentication & Sessions</h3></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Require MFA for admins</p><p className="text-xs text-ink-muted">Preference only until an identity provider enforces MFA</p></div>
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

        {/* Multi-Factor Authentication */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Multi-Factor Authentication</h3></div>
            <Badge tone={mfaEnabled ? 'success' : 'muted'}>{mfaEnabled ? 'Enabled' : 'Disabled'}</Badge>
          </div>

          {mfaError && (
            <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-danger-soft/20 border border-danger/30">
              <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-danger">{mfaError}</p>
            </div>
          )}

          {/* Idle: not enrolled */}
          {mfaStatus === 'idle' && !mfaEnabled && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
                <ShieldCheck className="h-4 w-4 text-ink-secondary shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-ink-secondary">Add a TOTP authenticator (Google Authenticator, 1Password, Authy) as a second factor. After enrollment you will receive single-use recovery codes.</p>
              </div>
              <Button size="sm" variant="primary" onClick={handleEnrollMfa} disabled={mfaLoading}>
                <Key className="h-3.5 w-3.5" aria-hidden="true" />
                {mfaLoading ? 'Starting…' : 'Enroll in MFA'}
              </Button>
            </div>
          )}

          {/* Enrolling: show secret + otpauth url + code input */}
          {(mfaStatus === 'enrolling' || mfaStatus === 'verifying') && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="label-mono">Secret key</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(mfaSecret, 'secret')}
                    className="text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 text-xs"
                    aria-label="Copy secret key"
                  >
                    {copied === 'secret' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === 'secret' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs font-mono text-ink-primary break-all select-all">{mfaSecret}</p>
              </div>

              <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="label-mono">otpauth URL</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(mfaOtpauthUrl, 'url')}
                    className="text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 text-xs"
                    aria-label="Copy otpauth URL"
                  >
                    {copied === 'url' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === 'url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs font-mono text-ink-secondary break-all">{mfaOtpauthUrl}</p>
              </div>

              <Field label="6-digit verification code" hint="Enter the code shown by your authenticator app after scanning the URL or typing the secret.">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="font-mono tracking-widest text-center"
                  aria-label="6-digit verification code"
                />
              </Field>

              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={handleVerifyMfa} disabled={mfaLoading || mfaCode.length !== 6}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {mfaStatus === 'verifying' && mfaLoading ? 'Verifying…' : 'Verify & enable'}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetEnrollment} disabled={mfaLoading}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Enabled: show recovery codes + disable */}
          {mfaStatus === 'enabled' && mfaEnabled && recoveryCodes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-warning">Save these recovery codes now. Each code can be used once if you lose access to your authenticator. They will not be shown again.</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="label-mono">Recovery codes</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(recoveryCodes.join('\n'), 'recovery')}
                    className="text-ink-muted hover:text-ink-primary inline-flex items-center gap-1 text-xs"
                    aria-label="Copy all recovery codes"
                  >
                    {copied === 'recovery' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === 'recovery' ? 'Copied' : 'Copy all'}
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {recoveryCodes.map((code, i) => (
                    <li key={i} className="text-xs font-mono text-ink-primary px-2 py-1 rounded bg-bg-hover border border-bg-border">{code}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                <p className="text-xs text-success">MFA is active on your account.</p>
              </div>
              <Button size="sm" variant="danger" onClick={() => setShowDisableMfa(true)}>
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Disable MFA
              </Button>
            </div>
          )}

          {/* Already enabled (status fetched, no fresh recovery codes to show) */}
          {mfaStatus === 'idle' && mfaEnabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success-soft/20 border border-success/30">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                <p className="text-xs text-success">MFA is active on your account.</p>
              </div>
              <Button size="sm" variant="danger" onClick={() => setShowDisableMfa(true)}>
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Disable MFA
              </Button>
            </div>
          )}
        </Card>

        {/* Data & privacy */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Database className="h-4 w-4 text-success" aria-hidden="true" /><h3 className="text-sm font-semibold">Data & Privacy</h3></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Encrypt at rest</p><p className="text-xs text-ink-muted">Managed by the database platform</p></div>
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
                <div className="flex-1"><p className="text-xs text-ink-primary">{b.name}</p><p className="text-xs text-ink-muted font-mono">{b.time} · {b.size} · demo record</p></div>
                <Badge tone="warning">sample</Badge>
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
              { label: 'Audit log storage', icon: History },
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

      {/* Disable MFA step-up verification */}
      <Modal open={showDisableMfa} onClose={() => { setShowDisableMfa(false); setStepUpCode(''); setMfaError(''); }} title="Disable Multi-Factor Authentication" titleId="disable-mfa-title">
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-warning">Disabling MFA removes the second factor from your account. Enter your current 6-digit MFA code to confirm this action.</p>
          </div>
          {mfaError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger-soft/20 border border-danger/30">
              <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-danger">{mfaError}</p>
            </div>
          )}
          <Field label="Current MFA code" hint="Enter the 6-digit code currently shown in your authenticator app.">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={stepUpCode}
              onChange={(e) => setStepUpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="font-mono tracking-widest text-center"
              aria-label="Current MFA code"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowDisableMfa(false); setStepUpCode(''); setMfaError(''); }}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDisableMfa} disabled={mfaLoading || stepUpCode.length !== 6}>
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {mfaLoading ? 'Disabling…' : 'Disable MFA'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
