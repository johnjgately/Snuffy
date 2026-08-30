import { useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/state/AppContext';
import { Button } from '@/components/ui';
import { OctagonX, RotateCcw } from 'lucide-react';

export function EmergencyOverlay({ onClear }: { onClear: () => void }) {
  const { emergencyStop, branding } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClearRef.current();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (!emergencyStop) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.[0]?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [emergencyStop, handleKeyDown]);

  if (!emergencyStop) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="emergency-title" aria-describedby="emergency-desc">
      <div className="absolute inset-0 bg-danger-soft/40 backdrop-blur-md" aria-hidden="true" />
      <div ref={dialogRef} className="relative w-full max-w-md panel-elevated border-danger/40 shadow-panel animate-fade-in text-center">
        <div className="p-8">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-danger/20 border border-danger/40 flex items-center justify-center" aria-hidden="true">
            <OctagonX className="h-8 w-8 text-danger" />
          </div>
          <h2 id="emergency-title" className="text-lg font-semibold text-danger">Emergency Stop Active</h2>
          <p id="emergency-desc" className="mt-2 text-sm text-ink-secondary">
            {branding.name} has been halted. All automations, external API calls, microphone activity, keyboard insertion, and background jobs are stopped.
          </p>
          <div className="mt-4 flex flex-col gap-1.5 text-xs text-ink-muted font-mono" role="list">
            <span className="flex items-center justify-center gap-2" role="listitem"><span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> Automations: stopped</span>
            <span className="flex items-center justify-center gap-2" role="listitem"><span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> Microphone: off</span>
            <span className="flex items-center justify-center gap-2" role="listitem"><span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> Outbound APIs: blocked</span>
            <span className="flex items-center justify-center gap-2" role="listitem"><span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /> Keyboard insertion: disabled</span>
          </div>
          <div className="mt-6">
            <Button variant="primary" onClick={onClear}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Resume operations
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
