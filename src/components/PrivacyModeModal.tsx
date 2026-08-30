import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import type { PrivacyMode } from '@/types';
import { Button, Toggle } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { WifiOff, Wifi, SlidersHorizontal, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';

const modes: { id: PrivacyMode; label: string; icon: typeof Wifi; description: string }[] = [
  { id: 'local', label: 'Local / Private', icon: WifiOff, description: 'Only approved local AI servers, local databases, and local documents. External AI APIs, cloud storage, internet searches, and outbound traffic are disabled.' },
  { id: 'connected', label: 'Connected', icon: Wifi, description: 'Approved cloud AI providers, external APIs, internet research, cloud databases, cloud storage, and connected services are all permitted.' },
  { id: 'custom', label: 'Custom', icon: SlidersHorizontal, description: 'Individually enable or disable each AI provider, local server, database, document source, API, internet access, voice service, and integration.' },
];

export function PrivacyModeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { privacyMode, setPrivacyMode, customToggles, setCustomToggle, branding } = useApp();
  const [selected, setSelected] = useState<PrivacyMode>(privacyMode);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(privacyMode);
      setConfirming(false);
    }
  }, [open, privacyMode]);

  const isSensitive = selected !== privacyMode;
  const apply = () => {
    setPrivacyMode(selected);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Privacy & Connectivity Mode" titleId="privacy-mode-title" maxWidth="max-w-2xl">
      <div className="p-5 space-y-4">
        <p className="text-sm text-ink-secondary">Choose how {branding.name} operates. Sensitive changes require confirmation.</p>

        <div className="grid gap-3">
          {modes.map((m) => {
            const Icon = m.icon;
            const isActive = selected === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                aria-pressed={isActive}
                className={cn(
                  'text-left flex gap-3 p-4 rounded-lg border transition-colors',
                  isActive ? 'bg-accent/10 border-accent/40' : 'bg-bg-base border-bg-border hover:border-bg-hover',
                )}
              >
                <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', isActive ? 'bg-accent/20 text-accent' : 'bg-bg-hover text-ink-secondary')}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink-primary">{m.label}</p>
                    {isActive && <span className="text-xs font-mono uppercase text-accent">active</span>}
                  </div>
                  <p className="text-xs text-ink-muted mt-1 leading-relaxed">{m.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {selected === 'custom' && (
          <div className="animate-fade-in">
            <p className="label-mono mb-2">Per-source toggles</p>
            <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto scrollbar-thin p-3 rounded-lg bg-bg-base border border-bg-border">
              {customToggles.map((t) => (
                <div key={t.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-hover">
                  <span className="text-xs text-ink-secondary">{t.label}</span>
                  <Toggle checked={t.enabled} onChange={(v) => setCustomToggle(t.key, v)} aria-label={`Toggle ${t.label}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {isSensitive && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30" role="alert">
            <Lock className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-warning">Changing the operating mode is a sensitive action and will be recorded in the audit log.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-bg-border">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {isSensitive && !confirming ? (
          <Button variant="primary" onClick={() => setConfirming(true)}>Review change</Button>
        ) : (
          <Button variant="primary" onClick={apply}>
            {confirming ? 'Confirm & apply' : 'Apply'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
