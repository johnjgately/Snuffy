import { cn } from '@/lib/utils';
import { Mic, AudioLines, Brain, Volume2, Circle, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AssistantPhase = 'idle' | 'listening' | 'transcribing' | 'processing' | 'responding' | 'wake-listening' | 'wake-detected' | 'command';

interface PhaseMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  dot: string;
  pulse: boolean;
}

const phaseMap: Record<AssistantPhase, PhaseMeta> = {
  idle: { label: 'Ready', icon: Circle, color: 'text-ink-muted', bg: 'bg-bg-base', border: 'border-bg-border', dot: 'bg-ink-faint', pulse: false },
  listening: { label: 'Listening', icon: Mic, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/40', dot: 'bg-accent', pulse: true },
  transcribing: { label: 'Transcribing', icon: AudioLines, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/40', dot: 'bg-accent', pulse: true },
  processing: { label: 'Processing', icon: Brain, color: 'text-warning', bg: 'bg-warning-soft/20', border: 'border-warning/40', dot: 'bg-warning', pulse: true },
  responding: { label: 'Responding', icon: Volume2, color: 'text-success', bg: 'bg-success-soft/20', border: 'border-success/40', dot: 'bg-success', pulse: true },
  'wake-listening': { label: 'Wake-word standby', icon: Radio, color: 'text-accent', bg: 'bg-accent/5', border: 'border-accent/20', dot: 'bg-accent', pulse: true },
  'wake-detected': { label: 'Wake word detected', icon: Radio, color: 'text-warning', bg: 'bg-warning-soft/20', border: 'border-warning/40', dot: 'bg-warning', pulse: true },
  command: { label: 'Capturing command', icon: Mic, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/40', dot: 'bg-accent', pulse: true },
};

export function AssistantStatusBar({ phase, wakePhrase }: { phase: AssistantPhase; wakePhrase?: string }) {
  const meta = phaseMap[phase];
  const Icon = meta.icon;
  const active = phase !== 'idle';

  const statusText = (() => {
    if (phase === 'wake-listening' && wakePhrase) return `Say "${wakePhrase}"`;
    if (phase === 'idle') return 'Awaiting input';
    if (phase === 'listening') return 'Microphone active';
    if (phase === 'transcribing') return 'Converting speech to text';
    if (phase === 'processing') return 'Preparing response';
    if (phase === 'responding') return 'Speaking response';
    if (phase === 'wake-detected') return 'Activated — speak your request';
    if (phase === 'command') return 'Recording your command';
    return '';
  })();

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5 border-b transition-colors', meta.border, meta.bg)} role="status" aria-live="polite" aria-atomic="true">
      <div className="relative flex items-center gap-2.5">
        <div className={cn('relative h-7 w-7 rounded-full flex items-center justify-center border', meta.border, meta.bg)}>
          <Icon className={cn('h-3.5 w-3.5', meta.color)} aria-hidden="true" />
          {active && meta.pulse && (
            <span className={cn('absolute inset-0 rounded-full border animate-pulse-ring', meta.border)} aria-hidden="true" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', meta.dot, active && 'animate-blink')} aria-hidden="true" />
          <span className={cn('text-xs font-semibold uppercase tracking-wider', meta.color)}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* Phase progress segments */}
      <div className="hidden sm:flex items-center gap-1.5 ml-2" aria-hidden="true">
        {(['listening', 'transcribing', 'processing', 'responding'] as const).map((p) => {
          const isActive = phase === p || (phase === 'command' && p === 'listening');
          const isPast = phase === 'responding' && (p === 'listening' || p === 'transcribing' || p === 'processing');
          return (
            <div
              key={p}
              className={cn(
                'h-1 w-8 rounded-full transition-colors',
                isActive ? 'bg-accent' : isPast ? 'bg-accent/30' : 'bg-bg-border',
              )}
            />
          );
        })}
      </div>

      <div className="flex-1" />

      <span className="sr-only">{meta.label}. {statusText}.</span>
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-muted" aria-hidden="true">
        {phase === 'wake-listening' && wakePhrase && (
          <span>Say <span className="text-accent">"{wakePhrase}"</span></span>
        )}
        {phase === 'idle' && <span className="text-ink-faint">Awaiting input</span>}
        {phase === 'listening' && <span className="text-accent">Microphone active</span>}
        {phase === 'transcribing' && <span className="text-accent">Converting speech to text</span>}
        {phase === 'processing' && <span className="text-warning">Preparing response</span>}
        {phase === 'responding' && <span className="text-success">Speaking response</span>}
        {phase === 'wake-detected' && <span className="text-warning">Activated — speak your request</span>}
        {phase === 'command' && <span className="text-accent">Recording your command</span>}
      </div>
    </div>
  );
}
