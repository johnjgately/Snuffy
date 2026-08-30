import { useApp } from '@/state/AppContext';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Menu, OctagonX, ShieldCheck, Wifi, WifiOff, SlidersHorizontal, Bell, LogOut } from 'lucide-react';
import { useState } from 'react';

export function TopBar({ onMenu, onOpenMode, onSignOut }: { onMenu: () => void; onOpenMode: () => void; onSignOut: () => void }) {
  const { privacyMode, triggerEmergencyStop, auth } = useApp();
  const userEmail = auth.session?.user?.email ?? '';
  const userInitial = userEmail ? userEmail[0].toUpperCase() : 'U';
  const [confirm, setConfirm] = useState(false);

  const modeMeta = {
    local: { label: 'Local / Private', icon: WifiOff, tone: 'text-success' },
    connected: { label: 'Connected', icon: Wifi, tone: 'text-accent' },
    custom: { label: 'Custom', icon: SlidersHorizontal, tone: 'text-warning' },
  }[privacyMode];
  const ModeIcon = modeMeta.icon;

  return (
    <header className="sticky top-0 z-20 h-16 bg-bg-surface/80 backdrop-blur-md border-b border-bg-border flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button className="lg:hidden text-ink-secondary" onClick={onMenu} aria-label="Open navigation menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          <span className="font-mono uppercase tracking-wider">Secure Session</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenMode}
          aria-label={`Change privacy mode. Current mode: ${modeMeta.label}`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-base border border-bg-border hover:border-accent/40 transition-colors"
        >
          <ModeIcon className={cn('h-4 w-4', modeMeta.tone)} aria-hidden="true" />
          <span className="text-xs font-medium text-ink-primary hidden sm:inline">{modeMeta.label}</span>
          <span className="text-xs text-ink-muted font-mono uppercase tracking-wider hidden md:inline">change</span>
        </button>

        <button className="relative p-2 rounded-lg hover:bg-bg-hover text-ink-secondary" aria-label="Notifications">
          <Bell className="h-4.5 w-4.5" aria-hidden="true" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        </button>

        {confirm ? (
          <div className="flex items-center gap-2 animate-fade-in" role="group" aria-label="Emergency stop confirmation">
            <span className="text-xs text-danger font-medium hidden sm:inline">Halt everything?</span>
            <Button variant="danger" size="sm" onClick={() => { triggerEmergencyStop(); setConfirm(false); }} aria-label="Confirm emergency stop">
              <OctagonX className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} aria-label="Cancel emergency stop">Cancel</Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirm(true)} aria-label="Activate emergency stop">
            <OctagonX className="h-3.5 w-3.5" aria-hidden="true" /> Emergency Stop
          </Button>
        )}

        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-bg-border">
          <div className="h-8 w-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-xs font-semibold text-accent" aria-hidden="true">
            {userInitial}
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-xs font-medium text-ink-primary max-w-[160px] truncate">{userEmail || 'Signed in'}</p>
          </div>
          <button onClick={onSignOut} className="p-1.5 rounded-lg hover:bg-bg-hover text-ink-muted hover:text-danger transition-colors" aria-label="Sign out">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
