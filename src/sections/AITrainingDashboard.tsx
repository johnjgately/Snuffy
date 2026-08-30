import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, StatusDot } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { getAuthHeaders } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { SectionId } from '@/types';
import {
  GraduationCap, Library, FileText, Database, Cpu, Activity,
  HardDrive, Boxes, ShieldCheck, Loader2, ArrowRight, Layers,
} from 'lucide-react';

const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-rag`;

interface Stats {
  knowledgeBases: number;
  documents: number;
  chunks: number;
  readyDocuments: number;
}

interface HealthState {
  embedding: { provider: string; model: string; endpoint: string; status: string } | null;
  vectorDb: { provider: string; status: string } | null;
}

export function AITrainingDashboard({ onNavigate }: { onNavigate: (id: SectionId) => void }) {
  const { privacyMode } = useApp();
  const [stats, setStats] = useState<Stats>({ knowledgeBases: 0, documents: 0, chunks: 0, readyDocuments: 0 });
  const [health, setHealth] = useState<HealthState>({ embedding: null, vectorDb: null });
  const [loading, setLoading] = useState(true);
  const [functionHeaders, setFunctionHeaders] = useState<Record<string, string>>({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  const internetDisabled = privacyMode === 'local';

  useEffect(() => {
    getAuthHeaders().then(setFunctionHeaders);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST', headers: functionHeaders,
        body: JSON.stringify({ action: 'stats' }),
      });
      const data = await resp.json();
      if (data && !data.error) setStats(data);
    } catch { /* ignore */ }
    setLoading(false);
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
    fetchStats();
    fetchHealth();
  }, [fetchStats, fetchHealth]);

  const cards = [
    { id: 'ai-knowledge-bases' as SectionId, icon: Library, label: 'Knowledge Bases', value: stats.knowledgeBases, desc: 'Collections of approved documents' },
    { id: 'ai-knowledge-docs' as SectionId, icon: FileText, label: 'Documents Indexed', value: stats.documents, desc: `${stats.readyDocuments} ready · ${stats.chunks} chunks` },
    { id: 'ai-training-settings' as SectionId, icon: Cpu, label: 'Embedding Model', value: health.embedding?.model ?? '—', desc: health.embedding?.provider ?? 'Not configured' },
    { id: 'ai-training-settings' as SectionId, icon: Database, label: 'Vector Database', value: health.vectorDb?.provider ?? 'pgvector', desc: health.vectorDb?.status ?? 'Unknown' },
  ];

  const healthTone = (status: string | undefined): 'success' | 'warning' | 'danger' | 'muted' => {
    if (!status) return 'muted';
    if (status === 'connected' || status === 'available') return 'success';
    if (status === 'unreachable' || status === 'error') return 'danger';
    return 'warning';
  };

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <SectionHeader
        title="AI Training Dashboard"
        description="Manage local knowledge ingestion, RAG, and model training. Phase 1 focuses on local knowledge and retrieval-augmented generation."
      />

      {internetDisabled && (
        <div className="mb-4 p-4 rounded-lg bg-success-soft/20 border border-success/30 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-success">PRIVATE AI MODE</p>
            <p className="text-xs text-ink-muted mt-1">Privacy mode is set to Local. All processing happens on your infrastructure. No document content, embeddings, or queries are sent to any external service.</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button key={i} onClick={() => onNavigate(card.id)} className="text-left">
              <Card className="p-4 hover:border-accent/30 transition-colors h-full">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">{card.label}</span>
                </div>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
                ) : (
                  <p className="text-2xl font-semibold text-ink-primary truncate">{card.value}</p>
                )}
                <p className="text-xs text-ink-muted mt-1">{card.desc}</p>
              </Card>
            </button>
          );
        })}
      </div>

      {/* System Health */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Embedding Service</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Provider</span>
              <span className="text-xs text-ink-primary font-medium">{health.embedding?.provider ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Model</span>
              <span className="text-xs text-ink-primary font-medium">{health.embedding?.model ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Endpoint</span>
              <span className="text-xs text-ink-primary font-mono truncate max-w-[200px]">{health.embedding?.endpoint ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-bg-border">
              <span className="text-xs text-ink-muted">Status</span>
              <div className="flex items-center gap-1.5">
                <StatusDot tone={healthTone(health.embedding?.status)} />
                <span className="text-xs font-medium capitalize">{health.embedding?.status ?? 'Unknown'}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Vector Database</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Provider</span>
              <span className="text-xs text-ink-primary font-medium">{health.vectorDb?.provider ?? 'pgvector'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Total Chunks</span>
              <span className="text-xs text-ink-primary font-medium">{stats.chunks}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Ready Documents</span>
              <span className="text-xs text-ink-primary font-medium">{stats.readyDocuments}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-bg-border">
              <span className="text-xs text-ink-muted">Status</span>
              <div className="flex items-center gap-1.5">
                <StatusDot tone={healthTone(health.vectorDb?.status)} />
                <span className="text-xs font-medium capitalize">{health.vectorDb?.status ?? 'Unknown'}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Pipeline visualization */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Knowledge Ingestion Pipeline</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            'Upload', 'Validate', 'Parse', 'OCR', 'Extract', 'Chunk', 'Embed', 'Index', 'Ready',
          ].map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              <span className={cn(
                'px-2.5 py-1 rounded-md font-mono',
                i < 7 ? 'bg-success-soft/20 text-success border border-success/20' : i === 7 ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-bg-hover text-ink-muted border border-bg-border'
              )}>
                {stage}
              </span>
              {i < 8 && <ArrowRight className="h-3 w-3 text-ink-faint" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Phase status */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Implementation Phases</h3>
        </div>
        <div className="space-y-2">
          {[
            { phase: 'Phase 1', name: 'Local Knowledge & RAG', status: 'active', desc: 'File upload, parsing, OCR, embeddings, vector search, knowledge bases, RAG with citations' },
            { phase: 'Phase 2', name: 'Dataset Builder', status: 'pending', desc: 'Training datasets, document-to-data generation, human review, quality checks, splitting' },
            { phase: 'Phase 3', name: 'Model Training', status: 'pending', desc: 'Hardware detection, base model management, LoRA/QLoRA, training jobs, monitoring' },
            { phase: 'Phase 4', name: 'Evaluation & Deployment', status: 'pending', desc: 'Evaluation, regression testing, approval workflow, deployment, rollback' },
            { phase: 'Phase 5', name: 'Multimodal', status: 'pending', desc: 'Images, charts, diagrams, complex PDFs, PowerPoint graphics' },
          ].map((p) => (
            <div key={p.phase} className="flex items-start gap-3 p-3 rounded-lg bg-bg-base border border-bg-border">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-ink-faint">{p.phase}</span>
                  <span className="text-sm font-medium text-ink-primary">{p.name}</span>
                </div>
                <p className="text-xs text-ink-muted mt-1">{p.desc}</p>
              </div>
              <Badge tone={p.status === 'active' ? 'success' : 'muted'}>
                {p.status === 'active' ? 'Active' : 'Planned'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
