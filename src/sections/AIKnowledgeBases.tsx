import { useState, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button, Input, Select, EmptyState } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { KnowledgeBase } from '@/types';
import {
  Library, Plus, Trash2, ShieldCheck, Loader2, FileText, AlertTriangle,
} from 'lucide-react';

const CLASSIFICATIONS = ['Public', 'Internal', 'Sensitive', 'Confidential', 'Restricted'];

export function AIKnowledgeBases() {
  const { privacyMode, log } = useApp();
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newClass, setNewClass] = useState('Internal');
  const [creating, setCreating] = useState(false);

  const internetDisabled = privacyMode === 'local';

  const fetchBases = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_bases')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped: KnowledgeBase[] = await Promise.all(data.map(async (kb: Record<string, unknown>) => {
          const { count } = await supabase
            .from('knowledge_documents')
            .select('id', { count: 'exact', head: true })
            .eq('knowledge_base_id', kb.id as string);
          return {
            id: kb.id as string,
            name: kb.name as string,
            description: (kb.description as string) ?? '',
            classification: kb.classification as string,
            documentCount: count ?? 0,
            createdAt: kb.created_at as string,
          };
        }));
        setBases(mapped);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBases();
  }, [fetchBases]);

  const createBase = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from('knowledge_bases').insert({
        name: newName.trim(),
        description: newDesc.trim() || null,
        classification: newClass,
      });
      if (error) throw error;
      log({ action: 'Created knowledge base', target: newName, section: 'AI Training', severity: 'info' });
      setNewName('');
      setNewDesc('');
      setNewClass('Internal');
      setShowCreate(false);
      fetchBases();
    } catch { /* ignore */ }
    setCreating(false);
  };

  const deleteBase = async (id: string, name: string) => {
    try {
      await supabase.from('knowledge_bases').delete().eq('id', id);
      log({ action: 'Deleted knowledge base', target: name, section: 'AI Training', severity: 'warning' });
      fetchBases();
    } catch { /* ignore */ }
  };

  const classTone = (cls: string): 'neutral' | 'success' | 'warning' | 'danger' => {
    const map: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
      Public: 'success', Internal: 'neutral', Sensitive: 'warning',
      Confidential: 'warning', Restricted: 'danger',
    };
    return map[cls] ?? 'neutral';
  };

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <SectionHeader
        title="Knowledge Bases"
        description="Create separate knowledge libraries for different departments, classifications, or topics. The AI can access any knowledge base you authorize."
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5" /> New Knowledge Base
          </Button>
        }
      />

      {internetDisabled && (
        <div className="mb-4 p-3 rounded-lg bg-success-soft/20 border border-success/30 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
          <p className="text-xs text-success font-medium">PRIVATE AI MODE — All knowledge stays local.</p>
        </div>
      )}

      {showCreate && (
        <Card className="p-4 mb-4 animate-fade-in">
          <div className="space-y-3">
            <Input placeholder="Knowledge base name (e.g. Cybersecurity Policies)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <div className="flex items-center gap-3">
              <Select value={newClass} onChange={(e) => setNewClass(e.target.value)} className="w-auto">
                {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Button variant="primary" size="sm" onClick={createBase} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
        </div>
      ) : bases.length === 0 ? (
        <EmptyState
          icon={<Library className="h-8 w-8" />}
          title="No knowledge bases yet"
          description="Create a knowledge base to start uploading and organizing documents for AI retrieval."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {bases.map((kb) => (
            <Card key={kb.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <Library className="h-4 w-4 text-accent" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">{kb.name}</p>
                    <p className="text-xs text-ink-muted">{kb.createdAt.slice(0, 10)}</p>
                  </div>
                </div>
                <Badge tone={classTone(kb.classification)}>{kb.classification}</Badge>
              </div>
              {kb.description && <p className="text-xs text-ink-muted mb-3">{kb.description}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-bg-border">
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {kb.documentCount} {kb.documentCount === 1 ? 'document' : 'documents'}
                </div>
                <button
                  onClick={() => deleteBase(kb.id, kb.name)}
                  className="text-ink-faint hover:text-danger transition-colors"
                  aria-label={`Delete ${kb.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
