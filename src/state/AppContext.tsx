import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CustomToggle, PrivacyMode, VoiceSettings, SearchSettings } from '@/types';
import { defaultCustomToggles, defaultVoiceSettings } from '@/data/demo';
import { supabase, getAuthHeaders } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  mustResetPassword: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  disabled: boolean;
  locked: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; locked?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (newPassword: string) => Promise<{ error: string | null }>;
  clearMustReset: () => void;
  requestPasswordReset: (email: string) => Promise<{ error: string | null; token?: string }>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<{ error: string | null }>;
  enrollMFA: () => Promise<{ error: string | null; secret?: string; otpauthUrl?: string }>;
  verifyMFA: (code: string) => Promise<{ error: string | null }>;
  disableMFA: () => Promise<{ error: string | null }>;
  sendEmailVerification: () => Promise<{ error: string | null }>;
  confirmEmailVerification: (token: string) => Promise<{ error: string | null }>;
}

interface AppState {
  auth: AuthState;
  privacyMode: PrivacyMode;
  setPrivacyMode: (m: PrivacyMode) => void;
  customToggles: CustomToggle[];
  setCustomToggle: (key: string, enabled: boolean) => void;
  voice: VoiceSettings;
  setVoice: (patch: Partial<VoiceSettings>) => void;
  emergencyStop: boolean;
  triggerEmergencyStop: () => void;
  clearEmergencyStop: () => void;
  branding: { name: string; subtitle: string };
  setBranding: (patch: Partial<{ name: string; subtitle: string }>) => void;
  searchSettings: SearchSettings;
  setSearchSettings: (patch: Partial<SearchSettings>) => void;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  log: (entry: { action: string; target: string; section: string; severity?: 'info' | 'warning' | 'critical' }) => void;
  auditCount: number;
}

const Ctx = createContext<AppState | null>(null);

const STORAGE_KEY = 'sufft-state-v2';

interface Persisted {
  privacyMode: PrivacyMode;
  customToggles: CustomToggle[];
  voice: VoiceSettings;
  branding: { name: string; subtitle: string };
  searchSettings: SearchSettings;
  demoMode: boolean;
  auditCount: number;
}

function isPrivacyMode(v: unknown): v is PrivacyMode {
  return v === 'local' || v === 'connected' || v === 'custom';
}

function isCustomToggleArray(v: unknown): v is CustomToggle[] {
  return Array.isArray(v) && v.every((t) => typeof t === 'object' && t !== null && 'key' in t && 'label' in t && 'enabled' in t);
}

const defaultSearchSettings: SearchSettings = {
  enabled: true,
  primaryProvider: 'brave',
  fallbackProvider: 'duckduckgo',
  autoFallback: true,
  allowAutoSearch: true,
  maxResults: 10,
  safeSearch: 'moderate',
  timeoutMs: 10000,
};

function isSearchSettings(v: unknown): v is SearchSettings {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.enabled === 'boolean' && typeof o.primaryProvider === 'string' && typeof o.autoFallback === 'boolean';
}

function isVoiceSettings(v: unknown): v is VoiceSettings {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.pushToTalk === 'boolean' &&
    typeof o.wakeWord === 'boolean' &&
    typeof o.ttsEnabled === 'boolean' &&
    typeof o.storeTranscripts === 'boolean' &&
    typeof o.storeKeyboardHistory === 'boolean' &&
    typeof o.autoDeleteHours === 'number'
  );
}

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const o = parsed as Record<string, unknown>;
    const result: Partial<Persisted> = {};
    if (isPrivacyMode(o.privacyMode)) result.privacyMode = o.privacyMode;
    if (isCustomToggleArray(o.customToggles)) result.customToggles = o.customToggles;
    if (isVoiceSettings(o.voice)) result.voice = { ...defaultVoiceSettings, ...o.voice };
    if (typeof o.branding === 'object' && o.branding !== null && 'name' in o.branding && 'subtitle' in o.branding) {
      const b = o.branding as { name: unknown; subtitle: unknown };
      if (typeof b.name === 'string' && typeof b.subtitle === 'string') result.branding = { name: b.name, subtitle: b.subtitle };
    }
    if (isSearchSettings(o.searchSettings)) result.searchSettings = { ...defaultSearchSettings, ...o.searchSettings };
    if (typeof o.demoMode === 'boolean') result.demoMode = o.demoMode;
    if (typeof o.auditCount === 'number') result.auditCount = o.auditCount;
    return result;
  } catch {
    return {};
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(load, []);
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(persisted.privacyMode ?? 'connected');
  const [customToggles, setCustomToggles] = useState<CustomToggle[]>(persisted.customToggles ?? defaultCustomToggles);
  const [voice, setVoiceState] = useState<VoiceSettings>(persisted.voice ?? defaultVoiceSettings);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [branding, setBrandingState] = useState(persisted.branding ?? { name: 'Snuffy', subtitle: 'AI Command Assistant' });
  const [searchSettings, setSearchSettingsState] = useState<SearchSettings>(persisted.searchSettings ?? defaultSearchSettings);
  const [demoMode, setDemoMode] = useState(persisted.demoMode ?? true);
  const [auditCount, setAuditCount] = useState(persisted.auditCount ?? 0);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        (async () => {
          const headers = await getAuthHeaders();
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api?resource=my-role`, { headers });
          const data = await resp.json();
          if (data.must_reset_password) setMustResetPassword(true);
          if (typeof data.email_verified === 'boolean') setEmailVerified(data.email_verified);
          if (typeof data.mfa_enabled === 'boolean') setMfaEnabled(data.mfa_enabled);
          if (typeof data.mfa_required === 'boolean') setMfaRequired(data.mfa_required);
          if (typeof data.disabled === 'boolean') setDisabled(data.disabled);
          if (typeof data.locked === 'boolean') setLocked(data.locked);
        })();
      } else {
        setMustResetPassword(false);
        setEmailVerified(false);
        setMfaEnabled(false);
        setMfaRequired(false);
        setDisabled(false);
        setLocked(false);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api`;
    // Check lockout status first
    try {
      const lockResp = await fetch(`${authApiUrl}?action=check-lockout&email=${encodeURIComponent(email)}`);
      const lockData = await lockResp.json();
      if (lockData.locked) {
        return { error: 'This account is temporarily locked due to too many failed attempts. Please try again in 15 minutes.', locked: true };
      }
    } catch { /* proceed to sign in */ }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Log the attempt
    try {
      await fetch(`${authApiUrl}?action=login-attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, success: !error }),
      });
    } catch { /* logging is best-effort */ }

    if (error) return { error: error.message };

    // Check if account is disabled
    try {
      const statusResp = await fetch(`${authApiUrl}?action=check-account-status&email=${encodeURIComponent(email)}`);
      const statusData = await statusResp.json();
      if (statusData.status === 'disabled') {
        await supabase.auth.signOut();
        return { error: 'This account has been disabled. Please contact an administrator.' };
      }
    } catch { /* proceed */ }

    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMustResetPassword(false);
    setEmailVerified(false);
    setMfaEnabled(false);
    setMfaRequired(false);
    setDisabled(false);
    setLocked(false);
  }, []);

  const resetPassword = useCallback(async (newPassword: string) => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api?resource=reset-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) return { error: data.error || 'Could not reset password.' };
      setMustResetPassword(false);
      return { error: null };
    } catch {
      return { error: 'Could not reset password. Please try again.' };
    }
  }, []);

  const clearMustReset = useCallback(() => setMustResetPassword(false), []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=password-reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      return { error: null, token: data.reset_token };
    } catch {
      return { error: 'Could not request password reset.' };
    }
  }, []);

  const confirmPasswordReset = useCallback(async (token: string, newPassword: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=password-reset-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      return { error: null };
    } catch {
      return { error: 'Could not reset password.' };
    }
  }, []);

  const enrollMFA = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=mfa-enroll`, {
        method: 'POST',
        headers,
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      return { error: null, secret: data.secret, otpauthUrl: data.otpauth_url };
    } catch {
      return { error: 'Could not enroll in MFA.' };
    }
  }, []);

  const verifyMFA = useCallback(async (code: string) => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=mfa-verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      setMfaEnabled(true);
      return { error: null };
    } catch {
      return { error: 'Could not verify MFA code.' };
    }
  }, []);

  const disableMFA = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=mfa-disable`, {
        method: 'POST',
        headers,
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      setMfaEnabled(false);
      return { error: null };
    } catch {
      return { error: 'Could not disable MFA.' };
    }
  }, []);

  const sendEmailVerification = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=email-verification-send`, {
        method: 'POST',
        headers,
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      return { error: null };
    } catch {
      return { error: 'Could not send verification email.' };
    }
  }, []);

  const confirmEmailVerification = useCallback(async (token: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-api?action=email-verification-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json();
      if (data.error) return { error: data.error };
      setEmailVerified(true);
      return { error: null };
    } catch {
      return { error: 'Could not verify email.' };
    }
  }, []);

  useEffect(() => {
    const data: Persisted = { privacyMode, customToggles, voice, branding, searchSettings, demoMode, auditCount };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota */
    }
  }, [privacyMode, customToggles, voice, branding, searchSettings, demoMode, auditCount]);

  const setCustomToggle = useCallback((key: string, enabled: boolean) => {
    setCustomToggles((prev) => prev.map((t) => (t.key === key ? { ...t, enabled } : t)));
  }, []);

  const setVoice = useCallback((patch: Partial<VoiceSettings>) => {
    setVoiceState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setBranding = useCallback((patch: Partial<{ name: string; subtitle: string }>) => {
    setBrandingState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSearchSettings = useCallback((patch: Partial<SearchSettings>) => {
    setSearchSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const triggerEmergencyStop = useCallback(() => {
    setEmergencyStop(true);
    setAuditCount((c) => c + 1);
  }, []);

  const clearEmergencyStop = useCallback(() => setEmergencyStop(false), []);

  const log = useCallback((entry: { action: string; target: string; section: string; severity?: 'info' | 'warning' | 'critical' }) => {
    setAuditCount((c) => c + 1);
    void entry;
  }, []);

  const value: AppState = {
    auth: { session, loading: authLoading, mustResetPassword, emailVerified, mfaEnabled, mfaRequired, disabled, locked, signIn, signUp, signOut, resetPassword, clearMustReset, requestPasswordReset, confirmPasswordReset, enrollMFA, verifyMFA, disableMFA, sendEmailVerification, confirmEmailVerification },
    privacyMode,
    setPrivacyMode,
    customToggles,
    setCustomToggle,
    voice,
    setVoice,
    emergencyStop,
    triggerEmergencyStop,
    clearEmergencyStop,
    branding,
    setBranding,
    searchSettings,
    setSearchSettings,
    demoMode,
    setDemoMode,
    log,
    auditCount,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
