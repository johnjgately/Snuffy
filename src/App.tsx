import { useState } from 'react';
import { AppProvider, useApp } from '@/state/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { PrivacyModeModal } from '@/components/PrivacyModeModal';
import { EmergencyOverlay } from '@/components/EmergencyOverlay';
import { LandingPage } from '@/sections/LandingPage';
import type { SectionId } from '@/types';
import { Dashboard } from '@/sections/Dashboard';
import { AIChat } from '@/sections/AIChat';
import { Documents } from '@/sections/Documents';
import { Databases } from '@/sections/Databases';
import { AIConnections } from '@/sections/AIConnections';
import { VoiceKeyboard } from '@/sections/VoiceKeyboard';
import { Automations } from '@/sections/Automations';
import { AuditLogs } from '@/sections/AuditLogs';
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

  return <Shell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
