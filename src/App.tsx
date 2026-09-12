import { useState } from 'react';
import { AppProvider, useApp } from '@/state/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { PrivacyModeModal } from '@/components/PrivacyModeModal';
import { EmergencyOverlay } from '@/components/EmergencyOverlay';
import { LandingPage } from '@/sections/LandingPage';
import { Button, Input } from '@/components/ui';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import type { SectionId } from '@/types';
import { Dashboard } from '@/sections/Dashboard';
import { AIChat } from '@/sections/AIChat';
import { Documents } from '@/sections/Documents';
import { Databases } from '@/sections/Databases';
import { AIConnections } from '@/sections/AIConnections';
import { VoiceKeyboard } from '@/sections/VoiceKeyboard';
import { Automations } from '@/sections/Automations';
import { AuditLogs } from '@/sections/AuditLogs';
import { StorageReview } from '@/sections/StorageReview';
import { UsersRoles } from '@/sections/UsersRoles';
import { FeatureFlags } from '@/sections/FeatureFlags';
import { Integrations } from '@/sections/Integrations';
import { SecuritySettings } from '@/sections/SecuritySettings';
import { Help } from '@/sections/Help';
import { About } from '@/sections/About';
import { InternetSearch } from '@/sections/InternetSearch';
import { AITrainingDashboard } from '@/sections/AITrainingDashboard';
import { AIKnowledgeBases } from '@/sections/AIKnowledgeBases';
import { AIKnowledgeDocs } from '@/sections/AIKnowledgeDocs';
import { AITrainingSettings } from '@/sections/AITrainingSettings';
import { EmergencyStop } from '@/sections/EmergencyStop';
import { AuthorizationMatrix } from '@/sections/AuthorizationMatrix';
import { LocalAIConnectors } from '@/sections/LocalAIConnectors';
import { DataGovernance } from '@/sections/DataGovernance';

function Shell() {
  const { emergencyStop, clearEmergencyStop, auth } = useApp();
  const [active, setActive] = useState<SectionId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);

  const render = () => {
    switch (active) {
      case 'dashboard': return <Dashboard onNavigate={setActive} />;
      case 'chat': return <AIChat />;
      case 'documents': return <Documents />;
      case 'databases': return <Databases />;
      case 'ai-connections': return <AIConnections />;
      case 'voice-keyboard': return <VoiceKeyboard />;
      case 'automations': return <Automations />;
      case 'audit-logs': return <AuditLogs />;
      case 'storage-review': return <StorageReview />;
      case 'users-roles': return <UsersRoles />;
      case 'feature-flags': return <FeatureFlags />;
      case 'integrations': return <Integrations />;
      case 'security-settings': return <SecuritySettings />;
      case 'help': return <Help />;
      case 'about': return <About />;
      case 'internet-search': return <InternetSearch />;
      case 'ai-training': return <AITrainingDashboard onNavigate={setActive} />;
      case 'ai-knowledge-bases': return <AIKnowledgeBases />;
      case 'ai-knowledge-docs': return <AIKnowledgeDocs />;
      case 'ai-training-settings': return <AITrainingSettings />;
      case 'emergency-stop': return <EmergencyStop />;
      case 'authorization-matrix': return <AuthorizationMatrix />;
      case 'local-ai-connectors': return <LocalAIConnectors />;
      case 'data-governance': return <DataGovernance />;
      default: return <Dashboard onNavigate={setActive} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base">
      <Sidebar active={active} onSelect={setActive} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenu={() => setSidebarOpen(true)} onOpenMode={() => setModeOpen(true)} onSignOut={auth.signOut} />
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6" aria-label="Main content">
          {render()}
          <footer className="mt-8 pt-4 border-t border-bg-border">
            <p className="text-xs text-ink-muted leading-relaxed max-w-3xl">
              &copy; 2026 John Gately. All Rights Reserved. Snuffy and its associated content, design, software, documentation, workflows, and branding are protected by copyright law. No part may be copied, reproduced, modified, distributed, or used without prior written permission from John Gately.
            </p>
          </footer>
        </main>
      </div>
      <PrivacyModeModal open={modeOpen} onClose={() => setModeOpen(false)} />
      <EmergencyOverlay onClear={clearEmergencyStop} />
      {emergencyStop && active !== 'dashboard' && (
        <div className="fixed bottom-4 right-4 z-40 animate-fade-in">
          <button onClick={clearEmergencyStop} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-medium shadow-panel hover:bg-danger/90">
            Resume operations
          </button>
        </div>
      )}
    </div>
  );
}

function Root() {
  const { auth } = useApp();

  if (auth.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center animate-pulse">
            <div className="h-3 w-3 rounded-full bg-accent animate-pulse" />
          </div>
          <p className="text-sm text-ink-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!auth.session) {
    return <LandingPage />;
  }

  if (auth.mustResetPassword) {
    return <PasswordResetScreen />;
  }

  return <Shell />;
}

function PasswordResetScreen() {
  const { auth } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error } = await auth.resetPassword(newPassword);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else {
      setSuccess(true);
      setTimeout(() => auth.clearMustReset(), 1500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-md panel-elevated rounded-2xl shadow-panel p-6 lg:p-8">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Set a new password</h2>
        </div>
        <p className="text-sm text-ink-muted mb-6">
          Your account was created with a temporary password. Please choose a new password to continue.
        </p>

        {success ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-success-soft/20 border border-success/30 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-success">Password updated. Redirecting to your dashboard…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="label-mono">New password</span>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" aria-hidden="true" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  className="pl-10 pr-10"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
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
            <label className="block">
              <span className="label-mono">Confirm new password</span>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" aria-hidden="true" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  className="pl-10"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </label>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-soft/20 border border-danger/30 animate-fade-in">
                <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Updating…</>
              ) : (
                <>Set new password <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
