export type SectionId =
  | 'dashboard'
  | 'chat'
  | 'documents'
  | 'databases'
  | 'ai-connections'
  | 'voice-keyboard'
  | 'automations'
  | 'audit-logs'
  | 'users-roles'
  | 'feature-flags'
  | 'integrations'
  | 'security-settings'
  | 'help'
  | 'about'
  | 'internet-search'
  | 'ai-training'
  | 'ai-knowledge-bases'
  | 'ai-knowledge-docs'
  | 'ai-training-settings';

export type PrivacyMode = 'local' | 'connected' | 'custom';

export type Role = 'Administrator' | 'Operator' | 'Analyst' | 'Auditor' | 'Viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended' | 'invited';
  mfa: boolean;
  lastActive: string;
  permissions: string[];
  oauthProvider?: string;
  oauthId?: string;
  avatarUrl?: string;
}

export interface AIConnection {
  id: string;
  name: string;
  kind: 'cloud' | 'local';
  provider: string;
  endpoint: string;
  models: string[];
  enabled: boolean;
  status: 'healthy' | 'degraded' | 'offline';
  usageTokens: number;
  usageCost: number;
  keyMasked?: string;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  host: string;
  access: 'read-only' | 'read-write' | 'admin';
  status: 'connected' | 'disconnected' | 'error';
  tables: number;
  lastChecked: string;
}

export interface DocRecord {
  id: string;
  name: string;
  type: string;
  size: string;
  folder: string;
  tags: string[];
  uploaded: string;
  status: 'processed' | 'processing' | 'queued' | 'flagged';
  pages: number;
  summary: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  schedule: string;
  enabled: boolean;
  lastRun: string;
  runs: number;
  status: 'idle' | 'running' | 'paused' | 'failed';
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  section: string;
  severity: 'info' | 'warning' | 'critical';
  ip: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: {
    global: boolean;
    dev: boolean;
    test: boolean;
    staging: boolean;
    prod: boolean;
  };
  roles: Role[];
  testGroups: string[];
  users: string[];
  tenants: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: 'connected' | 'available' | 'disabled';
  description: string;
  permissions: string[];
  lastSync?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  provider?: string;
  citations?: string[];
  pending?: boolean;
}

export interface VoiceSettings {
  pushToTalk: boolean;
  wakeWord: boolean;
  wakeWordPhrase: string;
  micSensitivity: number;
  speechEndSilence: number;
  autoSubmitVoice: boolean;
  ttsEnabled: boolean;
  micDeviceId: string | null;
  ttsVoice: string | null;
  ttsRate: number;
  storeTranscripts: boolean;
  storeKeyboardHistory: boolean;
  autoDeleteHours: number;
}

export interface CustomToggle {
  key: string;
  label: string;
  enabled: boolean;
}

export interface SearchSettings {
  enabled: boolean;
  primaryProvider: 'brave' | 'duckduckgo';
  fallbackProvider: 'duckduckgo' | 'none';
  autoFallback: boolean;
  allowAutoSearch: boolean;
  maxResults: 5 | 10 | 20;
  safeSearch: 'off' | 'moderate' | 'strict';
  timeoutMs: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedDate: string | null;
  provider: 'brave' | 'duckduckgo';
  isFallback: boolean;
}

export interface SearchLogEntry {
  id: string;
  timestamp: string;
  user: string;
  query: string;
  searchType: string;
  primaryProvider: string;
  providerUsed: string;
  isFallback: boolean;
  fallbackReason: string | null;
  resultCount: number;
  resultUrls: string[];
  aiProvider: string | null;
  aiModel: string | null;
  executionTimeMs: number;
  success: boolean;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  classification: string;
  documentCount: number;
  createdAt: string;
}

export type KnowledgeDocStatus =
  | 'uploaded' | 'parsing' | 'ocr' | 'extracting'
  | 'chunking' | 'embedding' | 'indexing' | 'ready' | 'failed';

export interface KnowledgeDoc {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName?: string;
  filename: string;
  fileType: string;
  fileSize: number;
  classification: string;
  version: number;
  status: KnowledgeDocStatus;
  processingStage: string | null;
  processingError: string | null;
  ocrStatus: string;
  ocrConfidence: number | null;
  embeddingStatus: string;
  chunkCount: number;
  pageCount: number | null;
  uploadedBy: string | null;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  fileHash: string | null;
  storagePath: string | null;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  documentName: string;
  chunkText: string;
  pageNumber: number | null;
  slideNumber: number | null;
  sheetName: string | null;
  section: string | null;
  cellRange: string | null;
  similarity: number;
}

export interface KnowledgeSettings {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingEndpoint: string;
  embeddingDim: number;
  vectorProvider: string;
  chunkSize: number;
  chunkOverlap: number;
}
