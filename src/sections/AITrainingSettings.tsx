import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Input, Select, Field } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { KnowledgeSettings } from '@/types';
import {
  Cpu, Database, ShieldCheck, Loader2, Check, Zap, Activity, Settings2,
} from 'lucide-react';

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-rag`;

const defaultSettings: KnowledgeSettings = {
  embeddingProvider: 'ollama',
  embeddingModel: 'nomic-embed-text',
  embeddingEndpoint: 'http://localhost:11434',
  embeddingDim: 1024,
  vectorProvider: 'pgvector',
  chunkSize: 512,
  chunkOverlap: 50,
};

interface HealthState {
  embedding: { provider: string; model: string; endpoint: string; status: string } | null;
  vectorDb: { provider: string; status: string } | null;
}

export function AITrainingSettings() {
  const { privacyMode, log } = useApp();
  const [settings, setSettings] = useState<KnowledgeSettings>(defaultSettings);
  const [health, setHealth] = useState<HealthState>({ embedding: null, vectorDb: null });
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  const internetDisabled = privacyMode === 'local';

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST', headers: functionHeaders,
        body: JSON.stringify({ action: 'getSettings' }),
      });
      const data = await resp.json();
      if (data?.settings) {
        const s = data.settings;
        setSettings({
          embeddingProvider: s.embedding_provider ?? 'ollama',
          embeddingModel: s.embedding_model ?? 'nomic-embed-text',
          embeddingEndpoint: s.embedding_endpoint ?? 'http://localhost:11434',
          embeddingDim: s.embedding_dim ?? 1024,
          vectorProvider: s.vector_provider ?? 'pgvector',
          chunkSize: s.chunk_size ?? 512,
          chunkOverlap: s.chunk_overlap ?? 50,
        });
      }
    } catch { /* ignore */ }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST', headers: functionHeaders,
        body: JSON.stringify({ action: 'health' }),
      });
      const data = await resp.json();
      if (data && !data.error) setHealth({ embedding: data.embedding, vectorDb: data.vectorDb });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchHealth();
  }, [fetchSettings, fetchHealth]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(functionUrl, {
        method: 'POST', headers: functionHeaders,
        body: JSON.stringify({ action: 'updateSettings', settings }),
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
      log({ action: 'Updated knowledge settings', target: 'Training Settings', section: 'AI Training', severity: 'info' });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await save();
      await fetchHealth();
      const status = health.embedding?.status ?? 'unknown';
      if (status === 'connected') {
        setTestResult(`Connected to ${health.embedding?.provider} — ${health.embedding?.model}`);
      } else {
        setTestResult(`Connection failed: ${status}. Make sure your local embedding server is running at ${settings.embeddingEndpoint}.`);
      }
    } catch {
      setTestResult('Connection test failed.');
    }
    setTesting(false);
  };

  const healthTone = (status: string | undefined): 'success' | 'warning' | 'danger' | 'muted' => {
    if (!status) return 'muted';
    if (status === 'connected') return 'success';
    if (status === 'unreachable' || status === 'error') return 'danger';
    return 'warning';
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <SectionHeader
        title="Training Settings"
        description="Configure the local embedding model, vector database, and chunking parameters. These settings control how documents are processed and searched."
      />

      {internetDisabled && (
        <div className="mb-4 p-3 rounded-lg bg-success-soft/20 border border-success/30 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
          <p className="text-xs text-success font-medium">PRIVATE AI MODE — All embeddings and search are local.</p>
        </div>
      )}

      {/* Health status */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Embedding Service</h3>
            </div>
            <Badge tone={healthTone(health.embedding?.status)}>
              {health.embedding?.status ?? 'Unknown'}
            </Badge>
          </div>
          <p className="text-xs text-ink-muted">{health.embedding?.model ?? 'Not configured'}</p>
          <p className="text-xs text-ink-faint font-mono mt-0.5">{health.embedding?.endpoint ?? '—'}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Vector Database</h3>
            </div>
            <Badge tone={healthTone(health.vectorDb?.status)}>
              {health.vectorDb?.status ?? 'Unknown'}
            </Badge>
          </div>
          <p className="text-xs text-ink-muted">{health.vectorDb?.provider ?? 'pgvector'}</p>
        </Card>
      </div>

      {/* Settings */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Embedding Configuration</h3>
        </div>
        <div className="space-y-4">
          <Field label="Embedding Provider" hint="Ollama is the default local provider. OpenAI-compatible servers also work.">
            <Select value={settings.embeddingProvider} onChange={(e) => setSettings({ ...settings, embeddingProvider: e.target.value })}>
              <option value="ollama">Ollama (Local)</option>
              <option value="openai-compatible">OpenAI-Compatible (Local)</option>
            </Select>
          </Field>

          <Field label="Embedding Model" hint="The model used to generate text embeddings. Must be installed on your local server.">
            <Input value={settings.embeddingModel} onChange={(e) => setSettings({ ...settings, embeddingModel: e.target.value })} placeholder="nomic-embed-text" />
          </Field>

          <Field label="Embedding Endpoint" hint="The URL of your local embedding server.">
            <Input value={settings.embeddingEndpoint} onChange={(e) => setSettings({ ...settings, embeddingEndpoint: e.target.value })} placeholder="http://localhost:11434" />
          </Field>

          <Field label="Embedding Dimensions" hint="The output dimension of your embedding model. Must match the vector column.">
            <Input type="number" value={settings.embeddingDim} onChange={(e) => setSettings({ ...settings, embeddingDim: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Vector Database</h3>
        </div>
        <Field label="Vector Provider" hint="pgvector uses the built-in PostgreSQL vector extension. No external setup needed.">
          <Select value={settings.vectorProvider} onChange={(e) => setSettings({ ...settings, vectorProvider: e.target.value })}>
            <option value="pgvector">PostgreSQL + pgvector (Built-in)</option>
          </Select>
        </Field>
      </Card>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Chunking Parameters</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Chunk Size (characters)" hint="Maximum length of each text chunk.">
            <Input type="number" value={settings.chunkSize} onChange={(e) => setSettings({ ...settings, chunkSize: Number(e.target.value) })} />
          </Field>
          <Field label="Chunk Overlap (characters)" hint="Overlap between adjacent chunks to preserve context.">
            <Input type="number" value={settings.chunkOverlap} onChange={(e) => setSettings({ ...settings, chunkOverlap: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Settings
        </Button>
        <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Test Connection
        </Button>
        {savedToast && <span className="text-xs text-success flex items-center gap-1 animate-fade-in"><Check className="h-3 w-3" /> Saved</span>}
      </div>

      {testResult && (
        <div className={cn(
          'mt-3 p-3 rounded-lg border text-sm',
          testResult.startsWith('Connected') ? 'bg-success-soft/20 border-success/30 text-success' : 'bg-warning-soft/20 border-warning/30 text-warning'
        )}>
          {testResult}
        </div>
      )}
    </div>
  );
}
