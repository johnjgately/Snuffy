import type {
  AIConnection,
  AuditEntry,
  Automation,
  DatabaseConnection,
  DocRecord,
  FeatureFlag,
  Integration,
  User,
  VoiceSettings,
} from '@/types';

export const demoUsers: User[] = [
  { id: 'u1', name: 'Commander Reyes', email: 'reyes@sufft.local', role: 'Administrator', status: 'active', mfa: true, lastActive: '2 min ago', permissions: ['*'] },
  { id: 'u2', name: 'Lt. Mara Chen', email: 'mchen@sufft.local', role: 'Operator', status: 'active', mfa: true, lastActive: '14 min ago', permissions: ['chat', 'documents', 'automations', 'voice'] },
  { id: 'u3', name: 'Sgt. Daniel Voss', email: 'dvoss@sufft.local', role: 'Analyst', status: 'active', mfa: false, lastActive: '1 hr ago', permissions: ['chat', 'documents', 'databases:read'] },
  { id: 'u4', name: 'Pfc. Rina Okafor', email: 'rokafor@sufft.local', role: 'Auditor', status: 'active', mfa: true, lastActive: '3 hr ago', permissions: ['audit-logs', 'feature-flags:read'] },
  { id: 'u5', name: 'Civ. Theo Park', email: 'tpark@sufft.local', role: 'Viewer', status: 'invited', mfa: false, lastActive: 'never', permissions: ['dashboard:read'] },
  { id: 'u6', name: 'Maj. Lina Hart', email: 'lhart@sufft.local', role: 'Operator', status: 'suspended', mfa: true, lastActive: '2 days ago', permissions: ['chat', 'voice'] },
];

export const demoAIConnections: AIConnection[] = [
  { id: 'ai1', name: 'OpenAI Primary', kind: 'cloud', provider: 'OpenAI', endpoint: 'api.openai.com', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'], enabled: true, status: 'healthy', usageTokens: 1284500, usageCost: 42.18, keyMasked: 'sk-••••••••••3a9f' },
  { id: 'ai2', name: 'Anthropic Claude', kind: 'cloud', provider: 'Anthropic', endpoint: 'api.anthropic.com', models: ['claude-3-7-sonnet', 'claude-3-5-haiku'], enabled: true, status: 'healthy', usageTokens: 642300, usageCost: 28.74, keyMasked: 'sk-ant-••••••77b1' },
  { id: 'ai3', name: 'Google Gemini', kind: 'cloud', provider: 'Google', endpoint: 'generativelanguage.googleapis.com', models: ['gemini-2.0-flash', 'gemini-1.5-pro'], enabled: false, status: 'offline', usageTokens: 0, usageCost: 0, keyMasked: 'AIza••••••••2c' },
  { id: 'ai4', name: 'Ollama Lab Server', kind: 'local', provider: 'Ollama', endpoint: 'http://10.0.4.12:11434', models: ['llama3.1:8b', 'mistral-nemo', 'qwen2.5:7b'], enabled: true, status: 'healthy', usageTokens: 318900, usageCost: 0, keyMasked: 'none' },
  { id: 'ai5', name: 'vLLM Inference', kind: 'local', provider: 'vLLM', endpoint: 'http://10.0.4.20:8000', models: ['mixtral-8x7b', 'deepseek-coder-33b'], enabled: true, status: 'degraded', usageTokens: 92100, usageCost: 0, keyMasked: 'none' },
  { id: 'ai6', name: 'LM Studio Desktop', kind: 'local', provider: 'LM Studio', endpoint: 'http://127.0.0.1:1234', models: ['phi-3-mini', 'gemma-2-9b'], enabled: false, status: 'offline', usageTokens: 0, usageCost: 0, keyMasked: 'none' },
];

export const demoDatabases: DatabaseConnection[] = [
  { id: 'db1', name: 'Operations Postgres', type: 'PostgreSQL', host: 'ops-db.internal:5432', access: 'read-only', status: 'connected', tables: 48, lastChecked: '1 min ago' },
  { id: 'db2', name: 'Personnel MySQL', type: 'MySQL', host: 'hr-db.internal:3306', access: 'read-only', status: 'connected', tables: 22, lastChecked: '3 min ago' },
  { id: 'db3', name: 'Field Reports SQLite', type: 'SQLite', host: '/data/field.db', access: 'read-write', status: 'connected', tables: 9, lastChecked: '5 min ago' },
  { id: 'db4', name: 'Supabase Project', type: 'Supabase', host: 'suffy.supabase.co', access: 'read-only', status: 'connected', tables: 14, lastChecked: '30 sec ago' },
  { id: 'db5', name: 'Logistics Mongo', type: 'MongoDB', host: 'mongo.internal:27017', access: 'read-only', status: 'error', tables: 0, lastChecked: '12 min ago' },
  { id: 'db6', name: 'Finance SQL Server', type: 'MS SQL Server', host: 'fin-sql.internal:1433', access: 'admin', status: 'disconnected', tables: 31, lastChecked: '2 hr ago' },
];

export const demoDocuments: DocRecord[] = [
  { id: 'd1', name: 'Q3 Operations Brief.pdf', type: 'PDF', size: '2.4 MB', folder: 'Operations', tags: ['briefing', 'q3'], uploaded: '2 days ago', status: 'processed', pages: 18, summary: 'Quarterly operations summary covering deployment status, resource allocation, and readiness metrics across three regional commands.' },
  { id: 'd2', name: 'Field Report 22-Alpha.docx', type: 'Word', size: '880 KB', folder: 'Field Reports', tags: ['classified', 'alpha'], uploaded: '4 days ago', status: 'processed', pages: 6, summary: 'After-action report from exercise Alpha detailing timeline, participant observations, and recommended corrective actions.' },
  { id: 'd3', name: 'Supply Inventory.xlsx', type: 'Excel', size: '1.1 MB', folder: 'Logistics', tags: ['inventory', 'logistics'], uploaded: '6 days ago', status: 'processed', pages: 4, summary: 'Current supply inventory with stock levels, reorder thresholds, and supplier contact information across 12 categories.' },
  { id: 'd4', name: 'Comms Log.csv', type: 'CSV', size: '320 KB', folder: 'Comms', tags: ['log', 'comms'], uploaded: '1 day ago', status: 'processed', pages: 1, summary: 'Chronological communications log with timestamps, channels, and message classification flags for 1,240 entries.' },
  { id: 'd5', name: 'Aerial Survey.png', type: 'Image', size: '5.6 MB', folder: 'Imagery', tags: ['aerial', 'ocr'], uploaded: '3 hr ago', status: 'processing', pages: 1, summary: 'Aerial survey image undergoing OCR and object detection to extract coordinate annotations.' },
  { id: 'd6', name: 'Intercept Message.eml', type: 'Email', size: '64 KB', folder: 'Comms', tags: ['email', 'review'], uploaded: '5 hr ago', status: 'flagged', pages: 3, summary: 'Email message flagged for review pending malware scan clearance. Contains attachments requiring verification.' },
];

export const demoAutomations: Automation[] = [
  { id: 'a1', name: 'Morning Briefing Digest', description: 'Compile overnight activity into a summary brief delivered at 0600.', trigger: 'Schedule: 0600 daily', action: 'Generate report + notify', schedule: 'Daily 06:00', enabled: true, lastRun: '6 hr ago', runs: 142, status: 'idle' },
  { id: 'a2', name: 'Supply Threshold Monitor', description: 'Watch inventory levels and alert when any item drops below reorder point.', trigger: 'Database poll: every 15 min', action: 'Alert + draft order', schedule: 'Every 15 min', enabled: true, lastRun: '8 min ago', runs: 2880, status: 'idle' },
  { id: 'a3', name: 'Document Ingestion', description: 'Process newly uploaded documents through OCR, tagging, and knowledge-base indexing.', trigger: 'New document event', action: 'OCR + index + summarize', schedule: 'On event', enabled: true, lastRun: '3 min ago', runs: 540, status: 'running' },
  { id: 'a4', name: 'Weekly Audit Export', description: 'Export immutable audit log to encrypted backup every Monday 0500.', trigger: 'Schedule: Mon 0500', action: 'Export + sign + archive', schedule: 'Weekly Mon 05:00', enabled: false, lastRun: '6 days ago', runs: 24, status: 'paused' },
  { id: 'a5', name: 'Comms Anomaly Watch', description: 'Scan comms log for anomaly patterns and raise a flagged review task.', trigger: 'Log pattern match', action: 'Flag + create task', schedule: 'Continuous', enabled: true, lastRun: '1 hr ago', runs: 96, status: 'idle' },
];

export const demoAudit: AuditEntry[] = [
  { id: 'l1', timestamp: '2026-08-23 14:42:11', actor: 'Lt. Mara Chen', action: 'Sent chat message', target: 'AI Chat / gpt-4o', section: 'AI Chat', severity: 'info', ip: '10.0.4.31' },
  { id: 'l2', timestamp: '2026-08-23 14:38:02', actor: 'Sgt. Daniel Voss', action: 'Executed read-only query', target: 'Operations Postgres / deployments', section: 'Databases', severity: 'info', ip: '10.0.4.55' },
  { id: 'l3', timestamp: '2026-08-23 14:30:55', actor: 'Commander Reyes', action: 'Approved automation run', target: 'Supply Threshold Monitor', section: 'Automations', severity: 'warning', ip: '10.0.4.10' },
  { id: 'l4', timestamp: '2026-08-23 14:22:18', actor: 'System', action: 'Malware scan blocked upload', target: 'intercept.exe', section: 'Documents', severity: 'critical', ip: '10.0.4.12' },
  { id: 'l5', timestamp: '2026-08-23 14:15:40', actor: 'Commander Reyes', action: 'Changed privacy mode', target: 'Connected → Local/Private', section: 'Security', severity: 'warning', ip: '10.0.4.10' },
  { id: 'l6', timestamp: '2026-08-23 14:02:09', actor: 'Pfc. Rina Okafor', action: 'Exported audit report', target: 'audit-2026-08.csv', section: 'Audit Logs', severity: 'info', ip: '10.0.4.71' },
  { id: 'l7', timestamp: '2026-08-23 13:55:31', actor: 'System', action: 'Feature flag toggled', target: 'experimental.rag_v2', section: 'Feature Flags', severity: 'info', ip: 'internal' },
  { id: 'l8', timestamp: '2026-08-23 13:41:00', actor: 'Lt. Mara Chen', action: 'Activated push-to-talk', target: 'Voice settings', section: 'Voice', severity: 'info', ip: '10.0.4.31' },
  { id: 'l9', timestamp: '2026-08-23 13:30:12', actor: 'Commander Reyes', action: 'Revoked integration', target: 'Slack connector', section: 'Integrations', severity: 'warning', ip: '10.0.4.10' },
  { id: 'l10', timestamp: '2026-08-23 13:18:44', actor: 'System', action: 'Emergency stop triggered', target: 'All automations + mic', section: 'System', severity: 'critical', ip: '10.0.4.10' },
];

export const demoFeatureFlags: FeatureFlag[] = [
  { id: 'f1', key: 'cloud.ai.access', name: 'Cloud AI Access', description: 'Allow connections to external cloud AI providers.', category: 'AI', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-22 09:12' },
  { id: 'f2', key: 'local.ai.access', name: 'Local AI Access', description: 'Allow connections to local/self-hosted AI servers.', category: 'AI', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-21 16:40' },
  { id: 'f3', key: 'db.connectors', name: 'Database Connectors', description: 'Enable database connection management and queries.', category: 'Data', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-20 11:05' },
  { id: 'f4', key: 'doc.uploads', name: 'Document Uploads', description: 'Allow document upload and knowledge-base ingestion.', category: 'Documents', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-19 08:30' },
  { id: 'f5', key: 'voice.interaction', name: 'Voice Interaction', description: 'Enable speech-to-text, push-to-talk, and TTS.', category: 'Voice', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Lt. Mara Chen', updatedAt: '2026-08-22 13:15' },
  { id: 'f6', key: 'ai.keyboard', name: 'AI Keyboard', description: 'AI-powered dictation and keyboard insertion assistant.', category: 'Keyboard', enabled: { global: false, dev: true, test: true, staging: false, prod: false }, roles: ['Administrator', 'Operator'], testGroups: ['keyboard-beta'], users: ['u2'], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-23 10:22' },
  { id: 'f7', key: 'external.api', name: 'External API Access', description: 'Allow outbound calls to approved external APIs.', category: 'Integrations', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-18 14:50' },
  { id: 'f8', key: 'automations', name: 'Automations', description: 'Enable user-approved workflow automations.', category: 'Automation', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-17 09:00' },
  { id: 'f9', key: 'internet.research', name: 'Internet Research', description: 'Allow web search and external content retrieval.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: false }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-21 17:20' },
  { id: 'f9a', key: 'feature.web.search', name: 'Web Search', description: 'Enable the web_search tool for Internet queries via Brave and DuckDuckGo.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9b', key: 'feature.auto.web.search', name: 'Automatic Web Search', description: 'Let the AI automatically trigger web searches when current information is needed.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9c', key: 'feature.brave.search', name: 'Brave Search Provider', description: 'Enable Brave Search API as the primary search provider.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9d', key: 'feature.duckduckgo.search', name: 'DuckDuckGo Fallback', description: 'Enable DuckDuckGo as a fallback search provider.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9e', key: 'feature.search.fallback', name: 'Search Auto-Fallback', description: 'Automatically fall back to the secondary provider when the primary fails.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9f', key: 'feature.search.citations', name: 'Search Citations', description: 'Require cited sources in AI answers based on web search results.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9g', key: 'feature.news.search', name: 'News Search', description: 'Allow searching for current news and time-sensitive information.', category: 'Research', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f9h', key: 'feature.image.search', name: 'Image Search', description: 'Allow searching for images via the web search system.', category: 'Research', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-26 09:00' },
  { id: 'f11', key: 'feature.ai.knowledge', name: 'AI Knowledge Center', description: 'Enable the local AI knowledge ingestion and RAG system.', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f12', key: 'feature.local.rag', name: 'Local RAG', description: 'Enable retrieval-augmented generation using the local vector database.', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f13', key: 'feature.document.ingestion', name: 'Document Ingestion', description: 'Allow uploading and processing documents into the knowledge base.', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f14', key: 'feature.ocr', name: 'OCR', description: 'Enable optical character recognition for scanned documents and images.', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f15', key: 'feature.local.embeddings', name: 'Local Embeddings', description: 'Generate text embeddings using a local embedding model (Ollama or compatible).', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f16', key: 'feature.vector.search', name: 'Vector Search', description: 'Enable semantic similarity search over the local vector database.', category: 'AI Training', enabled: { global: true, dev: true, test: true, staging: true, prod: true }, roles: ['Administrator', 'Operator', 'Analyst'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f17', key: 'feature.training.datasets', name: 'Training Datasets', description: 'Create and manage training datasets for model fine-tuning. (Phase 2)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f18', key: 'feature.model.training', name: 'Model Training', description: 'Fine-tune local models using LoRA/QLoRA. (Phase 3)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f19', key: 'feature.lora.training', name: 'LoRA Training', description: 'Enable LoRA adapter training method. (Phase 3)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f20', key: 'feature.qlora.training', name: 'QLoRA Training', description: 'Enable QLoRA quantized training method. (Phase 3)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f21', key: 'feature.model.evaluation', name: 'Model Evaluation', description: 'Evaluate and compare fine-tuned models against base models. (Phase 4)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f22', key: 'feature.model.deployment', name: 'Model Deployment', description: 'Deploy approved models to a local inference server. (Phase 4)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f23', key: 'feature.multimodal.knowledge', name: 'Multimodal Knowledge', description: 'Understand images, charts, and diagrams in documents. (Phase 5)', category: 'AI Training', enabled: { global: false, dev: false, test: false, staging: false, prod: false }, roles: ['Administrator'], testGroups: [], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-28 09:00' },
  { id: 'f10', key: 'experimental.rag_v2', name: 'RAG v2 (Experimental)', description: 'Next-gen retrieval-augmented generation pipeline.', category: 'Experimental', enabled: { global: false, dev: true, test: true, staging: false, prod: false }, roles: ['Administrator'], testGroups: ['rag-v2'], users: [], tenants: [], updatedBy: 'Commander Reyes', updatedAt: '2026-08-23 07:45' },
];

export const demoIntegrations: Integration[] = [
  { id: 'i1', name: 'Slack', category: 'Messaging', status: 'connected', description: 'Send alerts and briefings to Slack channels.', permissions: ['channels:read', 'chat:write'], lastSync: '5 min ago' },
  { id: 'i2', name: 'Microsoft Teams', category: 'Messaging', status: 'available', description: 'Post updates and summaries to Teams channels.', permissions: ['channel.read', 'channel.post'] },
  { id: 'i3', name: 'Google Calendar', category: 'Calendar', status: 'connected', description: 'Schedule reminders and sync briefing times.', permissions: ['calendar.read', 'calendar.events'], lastSync: '1 hr ago' },
  { id: 'i4', name: 'Outlook Mail', category: 'Email', status: 'available', description: 'Draft and send approved email messages.', permissions: ['mail.read', 'mail.send'] },
  { id: 'i5', name: 'Dropbox', category: 'Cloud Storage', status: 'disabled', description: 'Sync documents to and from Dropbox storage.', permissions: ['files.read', 'files.write'] },
  { id: 'i6', name: 'Custom Webhook', category: 'Developer', status: 'connected', description: 'Generic webhook receiver for custom pipelines.', permissions: ['webhook.receive'], lastSync: '2 hr ago' },
  { id: 'i7', name: 'Smart Home Hub', category: 'IoT', status: 'available', description: 'Control approved smart-home devices via routines.', permissions: ['devices.read', 'devices.control'] },
  { id: 'i8', name: 'Embedded Widget', category: 'Deployment', status: 'connected', description: 'Embed Snuffy as a widget on parent sites.', permissions: ['widget.embed'], lastSync: 'live' },
];

export const defaultVoiceSettings: VoiceSettings = {
  pushToTalk: true,
  wakeWord: true,
  wakeWordPhrase: 'hey snuffy',
  micSensitivity: 0.5,
  speechEndSilence: 1500,
  autoSubmitVoice: true,
  ttsEnabled: true,
  micDeviceId: null,
  ttsVoice: null,
  ttsRate: 1,
  storeTranscripts: true,
  storeKeyboardHistory: false,
  autoDeleteHours: 24,
};

export const defaultCustomToggles = [
  { key: 'cloud.openai', label: 'OpenAI (cloud)', enabled: true },
  { key: 'cloud.anthropic', label: 'Anthropic (cloud)', enabled: true },
  { key: 'cloud.google', label: 'Google Gemini (cloud)', enabled: false },
  { key: 'local.ollama', label: 'Ollama (local)', enabled: true },
  { key: 'local.vllm', label: 'vLLM (local)', enabled: true },
  { key: 'local.lmstudio', label: 'LM Studio (local)', enabled: false },
  { key: 'db.postgres', label: 'Operations Postgres', enabled: true },
  { key: 'db.supabase', label: 'Supabase Project', enabled: true },
  { key: 'db.mongo', label: 'Logistics Mongo', enabled: false },
  { key: 'docs.knowledge', label: 'Knowledge Base', enabled: true },
  { key: 'docs.uploads', label: 'Document Uploads', enabled: true },
  { key: 'web.search', label: 'Internet Search', enabled: false },
  { key: 'web.fetch', label: 'Outbound Web Fetch', enabled: false },
  { key: 'voice.stt', label: 'Speech-to-Text', enabled: true },
  { key: 'voice.tts', label: 'Text-to-Speech', enabled: true },
  { key: 'integ.slack', label: 'Slack Integration', enabled: true },
  { key: 'integ.calendar', label: 'Google Calendar', enabled: true },
  { key: 'integ.webhook', label: 'Custom Webhook', enabled: true },
];
