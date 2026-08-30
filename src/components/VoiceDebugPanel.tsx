import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Mic, Bug, X, Trash2, Loader2, CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import type { DebugEvent } from '@/hooks/useWakeWord';

interface VoiceDebugPanelProps {
  events: DebugEvent[];
  onClearEvents: () => void;
  wakeState: string;
  restartCount: number;
  lastTranscript: string;
  lastError: string;
  browserSupported: boolean;
  micLabel: string;
}

export function VoiceDebugPanel({
  events,
  onClearEvents,
  wakeState,
  restartCount,
  lastTranscript,
  lastError,
  browserSupported,
  micLabel,
}: VoiceDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, open]);

  const runMicTest = useCallback(() => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SRCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SRCtor) {
      setTesting(false);
      setTestError('SpeechRecognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    interface TestRec {
      start(): void;
      stop(): void;
      abort(): void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>; resultIndex: number }) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string; message?: string }) => void) | null;
      onstart: (() => void) | null;
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      maxAlternatives: number;
    }
    const rec = new SRCtor() as TestRec;
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    let finalText = '';
    let allAlternatives = '';

    rec.onstart = () => {
      setTestResult('Listening… speak one sentence now.');
    };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (alt) {
          interim += alt.transcript;
          // Collect all alternatives for the first final result
          if (e.results.length > 0) {
            const result = e.results[i];
            const alts: string[] = [];
            for (let j = 0; j < Math.min(result.length, 5); j++) {
              const a = result[j];
              if (a) alts.push(`"${a.transcript}" (conf: ${a.confidence.toFixed(2)})`);
            }
            if (alts.length > 0) allAlternatives = alts.join(' | ');
          }
        }
      }
      const combined = (finalText + interim).trim();
      setTestResult(`Interim: "${combined}"`);
    };
    rec.onend = () => {
      setTesting(false);
      if (finalText) {
        setTestResult(`Final transcript: "${finalText}"\n\nAlternatives:\n${allAlternatives || '(none)'}`);
      } else {
        setTestResult('(no final transcript captured — try speaking louder or closer to the mic)');
      }
    };
    rec.onerror = (e) => {
      setTesting(false);
      setTestError(`Error: ${e.error}${e.message ? ' — ' + e.message : ''}`);
    };

    // Override onresult to capture final results properly
    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      const alts: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result[0];
        if (!alt) continue;
        // Check if this is a final result (Chrome sets isFinal on the result)
        const isFinal = (result as unknown as { isFinal?: boolean }).isFinal === true;
        if (isFinal) {
          final += alt.transcript;
          // Collect alternatives for the final result
          for (let j = 0; j < Math.min(result.length, 5); j++) {
            const a = result[j];
            if (a) alts.push(`  [${j}] "${a.transcript}" (conf: ${a.confidence.toFixed(3)})`);
          }
        } else {
          interim += alt.transcript;
        }
      }
      finalText = final;
      const combined = (final + interim).trim();
      if (combined) {
        setTestResult(`Listening…\n  Interim: "${interim}"\n  Final so far: "${final}"`);
      }
      if (final) {
        setTestResult(`Final transcript: "${final}"\n\nAlternatives:\n${alts.join('\n') || '(none)'}`);
      }
    };

    try {
      rec.start();
    } catch (err) {
      setTesting(false);
      setTestError(`Could not start recognition: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Safety timeout
    setTimeout(() => {
      try { rec.stop(); } catch { /* noop */ }
    }, 8000);
  }, []);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Bug className="h-3.5 w-3.5" aria-hidden="true" /> Voice Debug
      </Button>
    );
  }

  return (
    <Card className="mb-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Voice Debug Panel</h3>
          <Badge tone="accent" className="ml-1">
            <Radio className="h-2.5 w-2.5" /> {wakeState}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClearEvents}><Trash2 className="h-3 w-3" aria-hidden="true" /> Clear log</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="h-3 w-3" aria-hidden="true" /> Close</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-bg-border">
        {/* Left: Status + Test */}
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-muted mb-2">Status</p>
            <div className="space-y-1.5 text-xs">
              <StatusRow label="Browser support" value={browserSupported ? 'Supported' : 'Not supported'} ok={browserSupported} />
              <StatusRow label="Recognition state" value={wakeState} />
              <StatusRow label="Selected mic" value={micLabel || 'System default'} />
              <StatusRow label="Restart count" value={String(restartCount)} />
              <StatusRow label="Last transcript" value={lastTranscript || '(none)'} />
              <StatusRow label="Last error" value={lastError || '(none)'} ok={!lastError} />
            </div>
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-muted mb-2">Test microphone / transcription</p>
            <Button size="sm" variant="primary" onClick={runMicTest} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
              {testing ? 'Listening…' : 'Test microphone'}
            </Button>
            <p className="text-xs text-ink-muted mt-1.5">Records one sentence and shows the exact transcript Chrome returns, including all alternatives.</p>
            {testResult && (
              <pre className="mt-2 text-xs text-ink-secondary bg-bg-base border border-bg-border rounded-lg p-2.5 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto scrollbar-thin">{testResult}</pre>
            )}
            {testError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-danger bg-danger-soft/20 border border-danger/30 rounded-lg p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{testError}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-muted mb-2">Wake phrase normalization</p>
            <div className="text-xs text-ink-muted space-y-1">
              <p>Recognized aliases (normalized, word-boundary matched):</p>
              <ul className="list-disc list-inside text-ink-secondary ml-1">
                <li>hey snuffy</li>
                <li>hey suffy</li>
                <li>hey sgt suffy</li>
                <li>hey snuff</li>
              </ul>
              <p className="mt-1">Punctuation stripped, whitespace collapsed, case-insensitive.</p>
            </div>
          </div>
        </div>

        {/* Right: Event log */}
        <div className="flex flex-col">
          <p className="text-xs font-mono uppercase tracking-wider text-ink-muted px-4 pt-3 pb-1">Recognition lifecycle events</p>
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 max-h-72 lg:max-h-none">
            {events.length === 0 ? (
              <p className="text-xs text-ink-faint py-4 text-center">No events yet. Wake word listening will log every recognition event here.</p>
            ) : (
              <div className="space-y-0.5">
                {events.map((evt) => (
                  <div key={evt.id} className="flex gap-2 text-xs font-mono py-0.5 border-b border-bg-border/50">
                    <span className="text-ink-faint shrink-0">{evt.timestamp}</span>
                    <span className={cn('shrink-0 font-semibold', eventColor(evt.type))}>{evt.type}</span>
                    <span className="text-ink-secondary break-all">{evt.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-bg-base border border-bg-border">
      <span className="text-ink-muted">{label}</span>
      <span className={cn('font-mono truncate', ok === true ? 'text-success' : ok === false ? 'text-danger' : 'text-ink-primary')}>
        {ok !== undefined && <span className="mr-1">{ok ? <CheckCircle2 className="inline h-3 w-3" /> : <AlertTriangle className="inline h-3 w-3" />}</span>}
        {value}
      </span>
    </div>
  );
}

function eventColor(type: string): string {
  if (type === 'onerror' || type === 'start-error' || type === 'error-limit') return 'text-danger';
  if (type === 'onstart') return 'text-success';
  if (type === 'onresult') return 'text-accent';
  if (type === 'state') return 'text-warning';
  if (type === 'wake-detected') return 'text-warning';
  if (type === 'skip') return 'text-ink-faint';
  return 'text-ink-secondary';
}
