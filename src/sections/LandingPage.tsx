import { useState, useEffect } from 'react';
import { useApp } from '@/state/AppContext';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Cpu, ShieldCheck, Workflow, Database, Mic, ScrollText,
  Lock, Mail, ArrowRight, Zap, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2,
  GraduationCap, Globe, MessageSquare, FileText, Search, BookOpen,
  Server, Layers, FileSearch, Sparkles,
  Library, Settings2, Users, Flag, Plug,
} from 'lucide-react';

const features = [
  { icon: MessageSquare, title: 'AI Chat Workspace', desc: 'Conversational AI with automatic web search, local knowledge base retrieval, and source citations on every answer.' },
  { icon: GraduationCap, title: 'AI Training & Knowledge', desc: 'Build private knowledge bases from your documents. Upload, chunk, embed, and index files — all processed locally.' },
  { icon: Globe, title: 'Internet Search', desc: 'Brave Search with DuckDuckGo fallback. Automatic web lookups for current events, weather, news, and live data.' },
  { icon: Cpu, title: 'AI & Local Servers', desc: 'Connect to cloud providers or run local models via Ollama. Route queries, monitor tokens, and control costs.' },
  { icon: Database, title: 'Database Connections', desc: 'Connect external databases with role-based permissions. Query, inspect, and audit every interaction.' },
  { icon: Workflow, title: 'Automations & Tasks', desc: 'Schedule reports, set up data monitoring, and trigger AI tasks — all with explicit approval gates.' },
  { icon: Mic, title: 'Voice & Keyboard', desc: 'Hands-free operation with wake-word detection, push-to-talk, and on-device speech-to-text.' },
  { icon: ScrollText, title: 'Full Audit Trail', desc: 'Every action is logged. Track who did what, when, and from where — with severity tagging.' },
  { icon: ShieldCheck, title: 'Security & Governance', desc: 'Emergency stop, audit logs, MFA enforcement, and granular role-based access control built in.' },
];

const stats = [
  { value: '19', label: 'Integrated modules' },
  { value: '5', label: 'Role tiers' },
  { value: '100%', label: 'Audit coverage' },
  { value: '0ms', label: 'Emergency stop' },
];

const ragSteps = [
  { icon: FileText, label: 'Upload', desc: 'PDF, Word, Excel, images, and more' },
  { icon: Layers, label: 'Chunk', desc: 'Smart text splitting with overlap' },
  { icon: Sparkles, label: 'Embed', desc: 'Local Ollama embedding models' },
  { icon: Search, label: 'Retrieve', desc: 'Vector similarity search via pgvector' },
  { icon: BookOpen, label: 'Cite', desc: 'Source citations in every AI answer' },
];

const securityItems = [
  { icon: ScrollText, title: 'Full audit trail', desc: 'Track every action with IP, timestamp, and severity.' },
  { icon: Lock, title: 'Role-based access', desc: 'Five role tiers with granular per-module permissions.' },
  { icon: Zap, title: 'Instant emergency stop', desc: 'One button halts all automations and AI activity.' },
  { icon: ShieldCheck, title: 'Privacy modes', desc: 'Local mode keeps all data on your machine. Connected mode allows cloud AI. Custom mode lets you decide.' },
];

const modules = [
  { icon: MessageSquare, name: 'AI Chat' },
  { icon: GraduationCap, name: 'Training Dashboard' },
  { icon: Library, name: 'Knowledge Bases' },
  { icon: FileSearch, name: 'Knowledge Documents' },
  { icon: Settings2, name: 'Training Settings' },
  { icon: FileText, name: 'Documents' },
  { icon: Database, name: 'Databases' },
  { icon: Cpu, name: 'AI Servers' },
  { icon: Globe, name: 'Internet Search' },
  { icon: Workflow, name: 'Automations' },
  { icon: Mic, name: 'Voice & Keyboard' },
  { icon: ScrollText, name: 'Audit Logs' },
  { icon: Users, name: 'Users & Roles' },
  { icon: Flag, name: 'Feature Flags' },
  { icon: Plug, name: 'Integrations' },
  { icon: ShieldCheck, name: 'Security' },
];

export function LandingPage() {
  const { auth, branding } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setFormError(null);
    setSuccessMsg(null);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setFormError('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setSuccessMsg(null);
    if (mode === 'login') {
      const { error } = await auth.signIn(email.trim(), password);
      setSubmitting(false);
      if (error) {
        setFormError(error);
      }
    } else {
      const { error } = await auth.signUp(email.trim(), password);
      setSubmitting(false);
      if (error) {
        setFormError(error);
      } else {
        setSuccessMsg('Account created. You can now sign in.');
        setMode('login');
        setPassword('');
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary">
      {/* Nav bar */}
      <nav className="fixed top-0 inset-x-0 z-40 border-b border-bg-border/50 bg-bg-base/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Zap className="h-5 w-5 text-accent" aria-hidden="true" />
            </div>
            <span className="text-base font-semibold tracking-tight">{branding.name}</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-ink-secondary">
            <a href="#features" className="hover:text-ink-primary transition-colors">Features</a>
            <a href="#knowledge" className="hover:text-ink-primary transition-colors">Knowledge AI</a>
            <a href="#security" className="hover:text-ink-primary transition-colors">Security</a>
            <a href="#modules" className="hover:text-ink-primary transition-colors">Modules</a>
          </div>
          <Button variant="primary" size="sm" onClick={() => { setMode('login'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }); }}>
            Sign in <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" aria-hidden="true" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/10 rounded-full blur-[120px] pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent font-medium mb-6">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-pulse-ring" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              Enterprise-grade AI operations platform
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
              Command your AI infrastructure with{' '}
              <span className="text-accent">confidence</span>
            </h1>
            <p className="mt-5 text-lg text-ink-secondary leading-relaxed max-w-xl">
              {branding.name} unifies AI chat with source citations, private knowledge bases with local embeddings, AI model training and fine-tuning, internet search with Brave and DuckDuckGo, document management, database connections, workflow automations, voice interaction with wake-word detection, role-based access control, feature flags, integrations, audit logging, and governance — into a single secure command center with full audit trails and human-in-the-loop controls.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" onClick={() => { setMode('login'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Sign in to your account
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Local AI mode</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Source citations</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> 19 integrated modules</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Private knowledge base</span>
            </div>
          </div>

          {/* Auth card */}
          <div id="auth" className="animate-fade-in">
            <div className="panel-elevated rounded-2xl shadow-panel p-6 lg:p-8 max-w-md mx-auto">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
                <h2 className="text-lg font-semibold">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
              </div>
              <p className="text-sm text-ink-muted mb-6">
                {mode === 'login' ? 'Access your command center' : 'Set up your account in seconds'}
              </p>

              {/* Mode toggle */}
              <div className="flex gap-1 p-1 rounded-lg bg-bg-base border border-bg-border mb-5">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={cn('flex-1 py-2 text-sm rounded-md transition-colors', mode === 'login' ? 'bg-accent/15 text-accent font-medium' : 'text-ink-muted hover:text-ink-secondary')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={cn('flex-1 py-2 text-sm rounded-md transition-colors', mode === 'signup' ? 'bg-accent/15 text-accent font-medium' : 'text-ink-muted hover:text-ink-secondary')}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="label-mono">Email</span>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" aria-hidden="true" />
                    <Input
                      type="email"
                      className="pl-10"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="label-mono">Password</span>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" aria-hidden="true" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      className="pl-10 pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-secondary transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {formError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-soft/20 border border-danger/30 animate-fade-in">
                    <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-danger">{formError}</p>
                  </div>
                )}

                {successMsg && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-success-soft/20 border border-success/30 animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-success">{successMsg}</p>
                  </div>
                )}

                <Button type="submit" variant="primary" className="w-full" disabled={submitting || auth.loading}>
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                  ) : (
                    <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                  )}
                </Button>
              </form>

              <p className="text-xs text-ink-faint text-center mt-5">
                {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-accent hover:text-accent/80 transition-colors font-medium"
                >
                  {mode === 'login' ? 'Create one' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section id="stats" className="border-y border-bg-border py-12 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl lg:text-4xl font-bold text-accent">{s.value}</p>
              <p className="label-mono mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Knowledge AI pipeline */}
      <section id="knowledge" className="py-20 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent font-medium mb-4">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> AI Training & Knowledge
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Private knowledge base with source citations</h2>
            <p className="mt-3 text-ink-secondary max-w-2xl mx-auto">
              Upload your documents into organized knowledge bases. {branding.name} processes them locally — chunking, embedding, and indexing — so the AI can retrieve relevant information and cite exact sources in every answer.
            </p>
          </div>

          {/* Pipeline visualization */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
            {ragSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="relative">
                  <div className="panel rounded-xl p-5 text-center hover:border-accent/30 transition-colors">
                    <div className="h-12 w-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-3">
                      <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold">{step.label}</p>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                  {i < ragSteps.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-2.5 -translate-y-1/2 z-10">
                      <ArrowRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="panel rounded-xl p-6">
              <Library className="h-5 w-5 text-accent mb-3" aria-hidden="true" />
              <h3 className="text-sm font-semibold mb-2">Organized knowledge bases</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Create separate libraries for each department or topic — Cybersecurity, HR, Legal. Each has its own classification level from Public to Restricted.
              </p>
            </div>
            <div className="panel rounded-xl p-6">
              <FileSearch className="h-5 w-5 text-accent mb-3" aria-hidden="true" />
              <h3 className="text-sm font-semibold mb-2">12+ file formats</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                PDF, Word, PowerPoint, Excel, CSV, images, JSON, XML, YAML, HTML, and email. Automatic OCR for scanned documents and images.
              </p>
            </div>
            <div className="panel rounded-xl p-6">
              <Server className="h-5 w-5 text-accent mb-3" aria-hidden="true" />
              <h3 className="text-sm font-semibold mb-2">Runs on your hardware</h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                Embeddings via local Ollama. Vector search via pgvector. In Local privacy mode, no document content or queries ever leave your machine.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-20 px-4 lg:px-8 border-t border-bg-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to operate AI at scale</h2>
            <p className="mt-3 text-ink-secondary max-w-2xl mx-auto">
              From AI chat with citations to private knowledge bases, from internet search to automations — {branding.name} brings it all under one roof.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group panel rounded-xl p-6 hover:border-accent/30 transition-colors">
                  <div className="h-11 w-11 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modules list */}
      <section id="modules" className="py-20 px-4 lg:px-8 border-t border-bg-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight">19 modules, one workspace</h2>
            <p className="mt-3 text-ink-secondary max-w-2xl mx-auto">
              Every section of {branding.name} is integrated. Navigate between AI chat, knowledge bases, databases, automations, and governance without ever leaving the platform.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.name} className="flex items-center gap-3 panel rounded-lg p-4 hover:border-accent/30 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-medium truncate">{m.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Security highlight */}
      <section id="security" className="py-20 px-4 lg:px-8 border-t border-bg-border">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-success/10 border border-success/20 mb-6">
            <ShieldCheck className="h-8 w-8 text-success" aria-hidden="true" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Built for trust, designed for control</h2>
          <p className="mt-4 text-lg text-ink-secondary max-w-2xl mx-auto leading-relaxed">
            Every action is audited. Every automation requires approval. Emergency stop halts everything instantly. Your data stays yours.
          </p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {securityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="panel rounded-xl p-5 text-left">
                  <Icon className="h-5 w-5 text-success mb-3" aria-hidden="true" />
                  <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                  <p className="text-xs text-ink-muted leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to take command?</h2>
          <p className="mt-3 text-ink-secondary">Create your account and start managing your AI infrastructure today.</p>
          <div className="mt-8">
            <Button variant="primary" onClick={() => { setMode('signup'); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Get started now <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bg-border py-8 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium">{branding.name}</span>
            <span className="text-xs text-ink-faint">— {branding.subtitle}</span>
          </div>
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} {branding.name}. All rights reserved.</p>
        </div>
        <div className="max-w-7xl mx-auto mt-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            © 2026 John Gately. All Rights Reserved. Snuffy and its associated content, design, software, documentation, workflows, and branding are protected by copyright law. No part may be copied, reproduced, modified, distributed, or used without prior written permission from John Gately.
          </p>
        </div>
      </footer>
    </div>
  );
}
