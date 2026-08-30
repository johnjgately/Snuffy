import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, Select, Field, Input } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { supabase, getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/types';
import {
  Globe, ShieldCheck, Zap, AlertTriangle, Loader2, Check, X,
  Activity, Search, Clock, Server, Lock, ExternalLink,
} from 'lucide-react';

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;

interface HealthState {
  brave: { status: string; detail: string } | null;
  duckduckgo: { status: string; detail: string } | null;
}

export function InternetSearch() {
  const { searchSettings, setSearchSettings, privacyMode, log } = useApp();
  const [health, setHealth] = useState<HealthState>({ brave: null, duckduckgo: null });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ provider: string; results: SearchResult[] } | null>(null);
  const [searchLogs, setSearchLogs] = useState<Array<{
    id: string; created_at: string; query: string; provider_used: string;
    is_fallback: boolean; fallback_reason: string | null; result_count: number; success: boolean;
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  const internetDisabled = privacyMode === 'local';

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const [braveRes, ddgRes] = await Promise.all([
        fetch(functionUrl, { method: 'POST', headers: functionHeaders, body: JSON.stringify({ action: 'health', provider: 'brave' }) }),
        fetch(functionUrl, { method: 'POST', headers: functionHeaders, body: JSON.stringify({ action: 'health', provider: 'duckduckgo' }) }),
      ]);
      const braveData = await braveRes.json();
      const ddgData = await ddgRes.json();
      setHealth({
        brave: { status: braveData.status, detail: braveData.detail },
        duckduckgo: { status: ddgData.status, detail: ddgData.detail },
      });
    } catch {
      setHealth({ brave: null, duckduckgo: null });
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('search_logs')
        .select('id, created_at, query, provider_used, is_fallback, fallback_reason, result_count, success')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setSearchLogs(data as typeof searchLogs);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchLogs();
  }, [fetchHealth, fetchLogs]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch(functionUrl, {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({ action: 'updateSettings', settings: searchSettings }),
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
      log({ action: 'Updated search settings', target: 'Internet Search', section: 'Internet Search', severity: 'info' });
    } catch {
      /* best-effort */
    }
    setSaving(false);
  };

  const testProvider = async (provider: 'brave' | 'duckduckgo') => {
    setTesting(provider);
    setTestResults(null);
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: functionHeaders,
        body: JSON.stringify({ action: 'test', provider }),
      });
      const data = await resp.json();
      if (data.testResults) {
        setTestResults({ provider, results: data.testResults as SearchResult[] });
      }
      fetchHealth();
    } catch {
      /* ignore */
    }
    setTesting(null);
  };

  const healthTone = (status: string | undefined): 'success' | 'warning' | 'danger' | 'muted' => {
    if (!status) return 'muted';
    if (status === 'connected' || status === 'available') return 'success';
    if (status === 'timeout' || status === 'rate_limited') return 'warning';
    return 'danger';
  };

  const healthLabel = (status: string | undefined): string => {
    if (!status) return 'Unknown';
    const map: Record<string, string> = {
      connected: 'Connected',
      available: 'Available',
      auth_failed: 'Auth Failed',
      rate_limited: 'Rate Limited',
      unavailable: 'Unavailable',
      timeout: 'Timeout',
      no_key: 'No API Key',
    };
    return map[status] ?? status;
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <SectionHeader
        title="Internet Search"
        description="Brave Search is the primary provider. DuckDuckGo is an optional fallback. All searches run server-side — API keys never reach the browser."
      />

      {/* Privacy mode warning */}
      {internetDisabled && (
        <div className="mb-4 p-4 rounded-lg bg-warning-soft/20 border border-warning/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-warning">Internet access is disabled</p>
            <p className="text-xs text-ink-muted mt-1">Privacy mode is set to Local. No search queries can leave this environment. Change privacy mode in the top bar to enable Internet search.</p>
          </div>
        </div>
      )}

      {/* Provider Status */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">Brave Search</p>
                <p className="text-xs text-ink-muted">Primary provider</p>
              </div>
            </div>
            <Badge tone={healthTone(health.brave?.status)}>
              {healthTone(health.brave?.status) === 'success' ? <Check className="h-2.5 w-2.5" /> : null}
              {healthLabel(health.brave?.status)}
            </Badge>
          </div>
          <p className="text-xs text-ink-muted mb-3">{health.brave?.detail ?? 'Not yet tested'}</p>
          <Button size="sm" variant="outline" onClick={() => testProvider('brave')} disabled={testing === 'brave' || internetDisabled}>
            {testing === 'brave' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test Brave Connection
          </Button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-bg-hover border border-bg-border flex items-center justify-center">
                <Server className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">DuckDuckGo</p>
                <p className="text-xs text-ink-muted">Fallback provider</p>
              </div>
            </div>
            <Badge tone={healthTone(health.duckduckgo?.status)}>
              {healthTone(health.duckduckgo?.status) === 'success' ? <Check className="h-2.5 w-2.5" /> : null}
              {healthLabel(health.duckduckgo?.status)}
            </Badge>
          </div>
          <p className="text-xs text-ink-muted mb-3">{health.duckduckgo?.detail ?? 'Not yet tested'}</p>
          <Button size="sm" variant="outline" onClick={() => testProvider('duckduckgo')} disabled={testing === 'duckduckgo' || internetDisabled}>
            {testing === 'duckduckgo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test DuckDuckGo Fallback
          </Button>
        </Card>
      </div>

      {/* Test Results */}
      {testResults && (
        <Card className="p-4 mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Test Results — {testResults.provider === 'brave' ? 'Brave Search' : 'DuckDuckGo'}</h3>
            <Button size="sm" variant="ghost" onClick={() => setTestResults(null)} aria-label="Dismiss test results"><X className="h-3.5 w-3.5" /></Button>
          </div>
          {testResults.results.length === 0 ? (
            <p className="text-xs text-ink-muted">No results returned. Check that the API key is configured and the provider is reachable.</p>
          ) : (
            <div className="space-y-2">
              {testResults.results.map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-bg-base border border-bg-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-ink-faint">{i + 1}.</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline flex items-center gap-1">
                      {r.title} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="text-xs text-ink-muted mt-1 ml-5">{r.snippet}</p>
                  <p className="text-xs text-ink-faint mt-1 ml-5 font-mono">{r.domain}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Settings */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Search Provider Settings</h3>
        </div>
        <div className="space-y-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
            <div>
              <p className="text-sm text-ink-primary">Internet Search</p>
              <p className="text-xs text-ink-muted">Enable or disable all Internet search</p>
            </div>
            <Toggle checked={searchSettings.enabled} onChange={(v) => setSearchSettings({ enabled: v })} disabled={internetDisabled} aria-label="Internet search enabled" />
          </div>

          {/* Primary provider */}
          <Field label="Primary Provider">
            <Select value={searchSettings.primaryProvider} onChange={(e) => setSearchSettings({ primaryProvider: e.target.value as 'brave' | 'duckduckgo' })} disabled={internetDisabled}>
              <option value="brave">Brave Search</option>
            </Select>
          </Field>

          {/* Fallback provider */}
          <Field label="Fallback Provider">
            <Select value={searchSettings.fallbackProvider} onChange={(e) => setSearchSettings({ fallbackProvider: e.target.value as 'duckduckgo' | 'none' })} disabled={internetDisabled}>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="none">None</option>
            </Select>
          </Field>

          {/* Auto fallback */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
            <div>
              <p className="text-sm text-ink-primary">Automatic Fallback</p>
              <p className="text-xs text-ink-muted">Fall back to DuckDuckGo when Brave fails</p>
            </div>
            <Toggle checked={searchSettings.autoFallback} onChange={(v) => setSearchSettings({ autoFallback: v })} disabled={internetDisabled || searchSettings.fallbackProvider === 'none'} aria-label="Automatic fallback" />
          </div>

          {/* Allow AI auto search */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
            <div>
              <p className="text-sm text-ink-primary">Allow AI Automatic Search</p>
              <p className="text-xs text-ink-muted">Let the AI search the web when it detects a need for current information</p>
            </div>
            <Toggle checked={searchSettings.allowAutoSearch} onChange={(v) => setSearchSettings({ allowAutoSearch: v })} disabled={internetDisabled} aria-label="Allow AI automatic search" />
          </div>

          {/* Max results */}
          <Field label="Maximum Results">
            <Select value={String(searchSettings.maxResults)} onChange={(e) => setSearchSettings({ maxResults: Number(e.target.value) as 5 | 10 | 20 })} disabled={internetDisabled}>
              <option value="5">5 results</option>
              <option value="10">10 results</option>
              <option value="20">20 results</option>
            </Select>
          </Field>

          {/* Safe search */}
          <Field label="Safe Search">
            <Select value={searchSettings.safeSearch} onChange={(e) => setSearchSettings({ safeSearch: e.target.value as 'off' | 'moderate' | 'strict' })} disabled={internetDisabled}>
              <option value="off">Off</option>
              <option value="moderate">Moderate</option>
              <option value="strict">Strict</option>
            </Select>
          </Field>

          {/* Timeout */}
          <Field label="Search Timeout (milliseconds)">
            <Input type="number" value={searchSettings.timeoutMs} onChange={(e) => setSearchSettings({ timeoutMs: Number(e.target.value) })} disabled={internetDisabled} />
          </Field>

          {/* Brave API key notice */}
          <div className="p-3 rounded-lg bg-accent-soft/10 border border-accent/20 flex items-start gap-2">
            <Lock className="h-4 w-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-ink-primary">Brave Search API Key</p>
              <p className="text-xs text-ink-muted mt-0.5">The API key is stored as a server-side secret and never exposed to the browser. Configure it in your Supabase Edge Function secrets as <span className="font-mono text-accent">BRAVE_SEARCH_API_KEY</span>.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={saveSettings} disabled={saving || internetDisabled}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save Settings
            </Button>
            {savedToast && <span className="text-xs text-success flex items-center gap-1 animate-fade-in"><Check className="h-3 w-3" /> Saved</span>}
          </div>
        </div>
      </Card>

      {/* Search Architecture */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Search Architecture</h3>
        </div>
        <div className="flex flex-col gap-1 text-xs text-ink-muted font-mono">
          {[
            'User Request',
            '  ↓',
            'AI Orchestrator',
            '  ↓',
            'web_search()',
            '  ↓',
            'Search Manager',
            '  ↓',
            'Brave Search API (Primary)',
            '  ↓  (if Brave fails)',
            'DuckDuckGo (Fallback)',
            '  ↓',
            'Normalized Results',
            '  ↓',
            'AI Model → Cited Response',
          ].map((line, i) => (
            <span key={i} className={cn(line.includes('Brave') && 'text-accent font-medium', line.includes('DuckDuckGo') && 'text-warning')}>{line}</span>
          ))}
        </div>
      </Card>

      {/* Recent Search Logs */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Recent Searches</h3>
          </div>
          <Button size="sm" variant="ghost" onClick={fetchLogs}>Refresh</Button>
        </div>
        {searchLogs.length === 0 ? (
          <p className="text-xs text-ink-muted text-center py-6">No searches have been performed yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {searchLogs.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-bg-base border border-bg-border">
                <span className={cn('h-2 w-2 rounded-full shrink-0 mt-1.5', entry.success ? 'bg-success' : 'bg-danger')} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-primary truncate">{entry.query}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-ink-faint font-mono">{new Date(entry.created_at).toLocaleString()}</span>
                    <Badge tone={entry.is_fallback ? 'warning' : 'accent'}>
                      {entry.provider_used}
                      {entry.is_fallback && ' (fallback)'}
                    </Badge>
                    <span className="text-xs text-ink-muted">{entry.result_count} results</span>
                    {entry.fallback_reason && <span className="text-xs text-warning">{entry.fallback_reason}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
