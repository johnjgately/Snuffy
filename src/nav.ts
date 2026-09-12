import type { SectionId } from '@/types';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Database,
  Cpu,
  Mic,
  Workflow,
  ScrollText,
  Users,
  HardDrive,
  Flag,
  Plug,
  ShieldCheck,
  HelpCircle,
  Info,
  Globe,
  GraduationCap,
  Library,
  FolderSearch,
  Settings2,
  OctagonAlert,
  Grid3x3,
  Network,
  Scale,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  group: string;
}

export const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare, group: 'Workspace' },
  { id: 'documents', label: 'Documents & Knowledge', icon: FileText, group: 'Workspace' },
  { id: 'databases', label: 'Database Connections', icon: Database, group: 'Workspace' },
  { id: 'ai-connections', label: 'AI & Local Servers', icon: Cpu, group: 'Workspace' },
  { id: 'voice-keyboard', label: 'Voice & Keyboard', icon: Mic, group: 'Workspace' },
  { id: 'automations', label: 'Automations & Tasks', icon: Workflow, group: 'Workspace' },
  { id: 'internet-search', label: 'Internet Search', icon: Globe, group: 'Workspace' },
  { id: 'ai-training', label: 'AI Training Dashboard', icon: GraduationCap, group: 'AI Training' },
  { id: 'ai-knowledge-bases', label: 'Knowledge Bases', icon: Library, group: 'AI Training' },
  { id: 'ai-knowledge-docs', label: 'Knowledge Documents', icon: FolderSearch, group: 'AI Training' },
  { id: 'ai-training-settings', label: 'Training Settings', icon: Settings2, group: 'AI Training' },
  { id: 'audit-logs', label: 'Activity & Audit', icon: ScrollText, group: 'Governance' },
  { id: 'storage-review', label: 'Storage Review', icon: HardDrive, group: 'Governance' },
  { id: 'users-roles', label: 'Users & Roles', icon: Users, group: 'Governance' },
  { id: 'feature-flags', label: 'Feature Flags', icon: Flag, group: 'Governance' },
  { id: 'integrations', label: 'Integrations', icon: Plug, group: 'Governance' },
  { id: 'security-settings', label: 'Security & Settings', icon: ShieldCheck, group: 'Governance' },
  { id: 'emergency-stop', label: 'Emergency Stop', icon: OctagonAlert, group: 'Governance' },
  { id: 'authorization-matrix', label: 'Authorization Matrix', icon: Grid3x3, group: 'Governance' },
  { id: 'local-ai-connectors', label: 'Local AI Connectors', icon: Network, group: 'Governance' },
  { id: 'data-governance', label: 'Data Governance', icon: Scale, group: 'Governance' },
  { id: 'help', label: 'Help & Guide', icon: HelpCircle, group: 'Support' },
  { id: 'about', label: 'About', icon: Info, group: 'Support' },
];
