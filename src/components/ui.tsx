import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className, elevated }: { children: ReactNode; className?: string; elevated?: boolean }) {
  return <div className={cn(elevated ? 'panel-elevated' : 'panel', className)}>{children}</div>;
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-secondary max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'muted';

const toneMap: Record<BadgeTone, string> = {
  neutral: 'bg-bg-hover text-ink-secondary border-bg-border',
  success: 'bg-success-soft/30 text-success border-success/30',
  warning: 'bg-warning-soft/30 text-warning border-warning/30',
  danger: 'bg-danger-soft/30 text-danger border-danger/30',
  accent: 'bg-accent-soft/30 text-accent border-accent/30',
  muted: 'bg-transparent text-ink-muted border-bg-border',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium', toneMap[tone], className)}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  className,
  disabled,
  type = 'button',
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  'aria-label'?: string;
}) {
  const variants = {
    default: 'bg-bg-hover text-ink-primary hover:bg-bg-border border border-bg-border',
    primary: 'bg-accent text-bg-base hover:bg-accent/90 border border-transparent font-medium',
    ghost: 'bg-transparent text-ink-secondary hover:bg-bg-hover border border-transparent',
    danger: 'bg-danger-soft/40 text-danger hover:bg-danger-soft/60 border border-danger/30',
    outline: 'bg-transparent text-ink-primary hover:bg-bg-hover border border-bg-border',
  };
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed', variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, disabled, 'aria-label': ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; 'aria-label'?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-bg-border',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} aria-hidden="true" />
    </button>
  );
}

export function StatusDot({ tone, label }: { tone: 'success' | 'warning' | 'danger' | 'muted'; label?: string }) {
  const colors = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', muted: 'bg-ink-faint' };
  return (
    <span className="relative inline-flex h-2 w-2" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60', colors[tone])} />
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', colors[tone])} />
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      {hint && <p className="text-xs text-ink-muted mt-0.5 mb-2">{hint}</p>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm text-ink-primary placeholder:text-ink-faint focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors',
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-lg bg-bg-base border border-bg-border px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors',
        props.className,
      )}
    />
  );
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 text-ink-faint">{icon}</div>
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      <p className="text-xs text-ink-muted mt-1 max-w-sm">{description}</p>
    </div>
  );
}
