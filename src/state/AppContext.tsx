import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CustomToggle, PrivacyMode, VoiceSettings, SearchSettings } from '@/types';
import { defaultCustomToggles, defaultVoiceSettings } from '@/data/demo';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
    auth: { session, loading: authLoading, signIn, signUp, signOut },
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
