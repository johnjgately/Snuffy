import { navItems } from '@/nav';
import type { SectionId } from '@/types';
import { useApp } from '@/state/AppContext';
import { cn } from '@/lib/utils';
import { ShieldAlert, X } from 'lucide-react';

export function Sidebar({ active, onSelect, open, onClose }: { active: SectionId; onSelect: (id: SectionId) => void; open: boolean; onClose: () => void }) {
  const { branding, privacyMode, emergencyStop } = useApp();
  const groups = Array.from(new Set(navItems.map((n) => n.group)));

  const modeLabel = privacyMode === 'local' ? 'Local / Private' : privacyMode === 'connected' ? 'Connected' : 'Custom';
  const modeTone = privacyMode === 'local' ? 'text-success' : privacyMode === 'connected' ? 'text-accent' : 'text-warning';

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed z-40 inset-y-0 left-0 w-64 bg-bg-surface border-r border-bg-border flex flex-col transition-transform lg:translate-x-0 lg:static',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-bg-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-accent" aria-hidden="true" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent border-2 border-bg-surface" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink-primary">{branding.name}</p>
              <p className="text-xs text-ink-muted font-mono uppercase tracking-wider">{branding.subtitle}</p>
            </div>
          </div>
          <button className="lg:hidden text-ink-muted" onClick={onClose} aria-label="Close navigation menu">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Section navigation" className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="label-mono px-2 mb-2">{group}</p>
              <div className="space-y-0.5">
                {navItems
                  .filter((n) => n.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelect(item.id);
                          onClose();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                          isActive ? 'bg-accent/10 text-accent border border-accent/20' : 'text-ink-secondary hover:bg-bg-hover hover:text-ink-primary border border-transparent',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-bg-border shrink-0 space-y-2">
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-bg-base border border-bg-border">
            <span className="text-xs text-ink-muted font-mono uppercase tracking-wider">Mode</span>
            <span className={cn('text-xs font-medium', modeTone)}>{modeLabel}</span>
          </div>
          {emergencyStop && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-danger-soft/30 border border-danger/40" role="status">
              <span className="h-2 w-2 rounded-full bg-danger animate-blink" aria-hidden="true" />
              <span className="text-xs text-danger font-medium">Emergency stop active</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
