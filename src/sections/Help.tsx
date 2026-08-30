import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, SectionHeader, Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  HelpCircle,
  BookOpen,
  Volume2,
  Square,
  Pause,
  Play,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Database,
  Cpu,
  Mic,
  Workflow,
  ScrollText,
  Users,
  Flag,
  Plug,
  ShieldCheck,
  Rocket,
  Search,
  Globe,
  GraduationCap,
  Library,
  FolderSearch,
  Settings2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface HelpChapter {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  content: string[];
}

const chapters: HelpChapter[] = [
  {
    id: 'overview',
    title: 'What is Snuffy?',
    icon: HelpCircle,
    description: 'A high-level introduction to the system',
    content: [
      'Snuffy is a secure, AI-powered operations assistant. It brings together artificial intelligence, document management, database access, workflow automation, and governance into a single, unified workspace.',
      'The system is designed for teams that need to work with sensitive data while maintaining strict oversight. Every action is logged, every automation requires approval, and every user has a clearly defined role.',
      'You interact with Snuffy through a conversational AI chat, voice commands, or a traditional point-and-click interface. Behind the scenes, it can connect to your databases, read and summarize your documents, run scheduled reports, and send alerts — all under your control.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Your mission control overview',
    content: [
      'The Dashboard is your starting point. It gives you a real-time snapshot of everything happening across the system: active AI sessions, running automations, recent activity, system health, and pending approvals.',
      'From the Dashboard, you can quickly navigate to any section by clicking on the relevant card or summary. It is designed to surface what needs your attention right now — failed automations, flagged documents, or security alerts.',
      'The summary cards at the top show key metrics at a glance. Use these to monitor the overall health and activity of your workspace without diving into individual sections.',
    ],
  },
  {
    id: 'chat',
    title: 'AI Chat',
    icon: MessageSquare,
    description: 'Conversational AI for tasks and questions',
    content: [
      'The AI Chat section lets you interact directly with your connected AI models. You can ask questions, request summaries, generate text, analyze documents, or get help with complex tasks — all through a natural conversation.',
      'Your chat history is saved per session. You can reference uploaded documents, and the AI can pull context from your connected knowledge base. Each response shows which model was used and how many tokens were consumed.',
      'AI connections must be configured in the AI and Local Servers section before chat is available. You can switch between cloud providers and local models depending on your privacy and cost requirements.',
      'Snuffy can also search the Internet automatically when you ask about current events, latest news, or anything that needs up-to-date information. When a web search is performed, the AI includes numbered source citations so you can verify where the information came from. A badge in the chat shows which search provider was used.',
      'In addition, Snuffy automatically searches your local Knowledge Base for relevant information every time you ask a question. If matching documents are found, the AI includes them as context and cites the exact source — document name, page number, slide number, or sheet name. A green Knowledge Base badge in the chat shows how many local sources were used.',
    ],
  },
  {
    id: 'ai-training-dashboard',
    title: 'AI Training Dashboard',
    icon: GraduationCap,
    description: 'Overview of the local AI knowledge and training system',
    content: [
      'The AI Training Dashboard is your command center for the local AI knowledge system. It shows a real-time snapshot of how many knowledge bases exist, how many documents have been indexed, how many text chunks are stored, and whether your local embedding model and vector database are connected.',
      'The dashboard displays the health of two critical services: the embedding service (which converts text into searchable vectors) and the vector database (which stores and searches those vectors). If either service is unreachable, the status will show as unavailable so you can fix the problem before uploading documents.',
      'A visual pipeline shows the stages every document goes through: Upload, Validate, Parse, OCR, Extract, Chunk, Embed, Index, and Ready. The dashboard also shows the implementation roadmap — Phase 1 (Local Knowledge and RAG) is active, while Phases 2 through 5 (Dataset Builder, Model Training, Evaluation and Deployment, and Multimodal) are planned for the future.',
    ],
  },
  {
    id: 'knowledge-bases',
    title: 'Knowledge Bases',
    icon: Library,
    description: 'Create and organize separate knowledge libraries',
    content: [
      'Knowledge Bases are separate libraries that organize your documents by department, topic, or classification. For example, you might create one for Cybersecurity Policies, another for Human Resources, and a third for Technical Manuals.',
      'Each knowledge base has a classification level — Public, Internal, Sensitive, Confidential, or Restricted. This classification is inherited by the documents you upload into it, helping Snuffy enforce access control and ensure the AI never retrieves information a user does not have permission to see.',
      'You can create, rename, and delete knowledge bases at any time. Deleting a knowledge base also deletes all documents and chunks within it. Each knowledge base card shows how many documents have been uploaded to it.',
    ],
  },
  {
    id: 'knowledge-docs',
    title: 'Knowledge Documents',
    icon: FolderSearch,
    description: 'Upload, process, and index files for AI retrieval',
    content: [
      'The Knowledge Documents section is where you upload files to be processed and indexed for AI retrieval. Supported formats include PDF, Word, PowerPoint, Excel, CSV, images (JPG, PNG, TIFF, BMP, WebP), JSON, XML, YAML, HTML, and email files.',
      'Every uploaded file goes through a multi-stage pipeline: Upload, Parse, OCR (if needed), Extract Structure, Chunk, Generate Embeddings, Index, and Ready. The document card shows the current stage in real time, so you always know what is happening. If processing fails, the error message tells you exactly which stage failed.',
      'Before a document can be used by the AI, it must be approved. Click the checkmark button on a Ready document to approve it. Approved documents become part of the knowledge base that Snuffy searches when you ask questions in AI Chat. You can also reprocess a document if it failed or if you want to regenerate its embeddings.',
      'Duplicate detection is built in. When you upload a file, Snuffy calculates a cryptographic hash and checks it against existing documents. If the same file has already been uploaded, it is skipped to prevent duplicate indexing.',
      'When privacy mode is set to Local, all processing happens on your infrastructure. No document content, embeddings, or queries are sent to any external service. The page displays a PRIVATE AI MODE banner to confirm this.',
    ],
  },
  {
    id: 'training-settings',
    title: 'Training Settings',
    icon: Settings2,
    description: 'Configure embedding models and vector database',
    content: [
      'The Training Settings section controls how Snuffy generates embeddings and stores them for search. The embedding model is separate from the chat model — you can use Qwen for chat and nomic-embed-text for embeddings, for example. They are independently configurable.',
      'The default embedding provider is Ollama, which runs entirely on your local machine. You can also use any OpenAI-compatible local embedding server. Enter the endpoint URL (such as http://localhost:11434 for Ollama), the model name, and the embedding dimension.',
      'The vector database uses pgvector, which is built into the PostgreSQL database that Snuffy already uses. No additional setup is needed. You can also configure chunk size (how large each text chunk is) and chunk overlap (how much adjacent chunks share text for context preservation).',
      'Use the Test Connection button to verify that your local embedding server is reachable. The health status cards at the top show whether the embedding service and vector database are currently connected.',
    ],
  },
  {
    id: 'internet-search',
    title: 'Internet Search',
    icon: Globe,
    description: 'Brave Search with DuckDuckGo fallback for live web results',
    content: [
      'The Internet Search section controls how Snuffy searches the web. Brave Search is the primary provider, with DuckDuckGo available as an optional fallback. All searches run through Snuffy\'s backend — your API keys never leave the server and are never exposed to the browser.',
      'When Brave encounters an error — such as authentication failure, a timeout, or rate limiting — Snuffy can automatically fall back to DuckDuckGo if you have enabled automatic fallback. A valid zero-result response from Brave (no results found, but the request succeeded) is not treated as a failure and will not trigger a fallback.',
      'You can configure the maximum number of results (5, 10, or 20), the safe search level (off, moderate, or strict), and a search timeout. The Test Brave Connection and Test DuckDuckGo Fallback buttons perform real searches so you can verify that each provider is working.',
      'Every search is logged with the query, the provider that was used, whether a fallback occurred, the number of results, and how long the search took. You can review recent searches at the bottom of the page. When the AI uses search results, it includes numbered citations referencing the sources — it never fabricates URLs.',
      'When privacy mode is set to Local, all Internet search is disabled. No queries leave your environment, regardless of which AI provider or search provider is configured. This ensures that sensitive information stays private when you need it to.',
    ],
  },
  {
    id: 'documents',
    title: 'Documents & Knowledge',
    icon: FileText,
    description: 'Upload, organize, and search your files',
    content: [
      'The Documents section is your knowledge library. Upload PDFs, text files, spreadsheets, and other documents, and Snuffy will process them — extracting text, generating summaries, and making them searchable.',
      'Documents are organized into folders and can be tagged for easy filtering. Each document shows a processing status: queued, processing, processed, or flagged. Flagged documents may need your review before they become available to the AI.',
      'Processed documents become part of the knowledge base that the AI can reference during chat sessions, making your assistant smarter and more context-aware over time.',
    ],
  },
  {
    id: 'databases',
    title: 'Database Connections',
    icon: Database,
    description: 'Connect and query external databases',
    content: [
      'The Database Connections section lets you connect Snuffy to your external databases. Once connected, the AI can query your data, and automations can pull information on a schedule.',
      'Each connection has an access level: read-only, read-write, or admin. This controls what the system is allowed to do with your data. For safety, most connections should be read-only unless you specifically need write access.',
      'Connection status is monitored continuously. If a database becomes unreachable, the status will change to disconnected or error, and any automations depending on it will be notified.',
    ],
  },
  {
    id: 'ai-connections',
    title: 'AI & Local Servers',
    icon: Cpu,
    description: 'Manage AI providers and local model servers',
    content: [
      'The AI and Local Servers section is where you configure which AI models Snuffy can use. You can connect to cloud providers like OpenAI or Anthropic, or run your own local models using Ollama or LM Studio.',
      'Each connection shows its health status, the models available, and usage statistics including token counts and estimated cost. This helps you monitor spending and switch to cheaper or more private options when needed.',
      'Local servers give you complete privacy — your data never leaves your machine. Cloud providers may offer better quality but require an API key and send data over the internet.',
    ],
  },
  {
    id: 'voice-keyboard',
    title: 'Voice & Keyboard',
    icon: Mic,
    description: 'Hands-free interaction and input settings',
    content: [
      'The Voice and Keyboard section lets you control Snuffy hands-free. You can enable push-to-talk, set a wake word, adjust microphone sensitivity, and configure text-to-speech so the assistant reads responses aloud.',
      'Voice transcripts and keyboard history can be stored for reference or automatically deleted after a set period. This is controlled by the auto-delete setting, which helps protect privacy.',
      'You can also choose which microphone and which text-to-speech voice the system uses. These settings are especially useful in environments where typing is impractical or when accessibility is a priority.',
    ],
  },
  {
    id: 'automations',
    title: 'Automations & Tasks',
    icon: Workflow,
    description: 'Scheduled workflows, reminders, and AI tasks',
    content: [
      'The Automations section lets you create workflows that run on a schedule or in response to events. Common uses include daily reports, data monitoring, threshold alerts, and repeatable AI tasks.',
      'Each automation has a trigger (what starts it), an action (what it does), and a schedule (when it runs). You can enable or pause automations individually, run them on demand, and view detailed results from each execution.',
      'For safety, consequential actions require explicit approval. The Emergency Stop button halts all automations instantly. You can also delete any automation — both custom ones you created and the built-in examples — using the trash button on each card.',
    ],
  },
  {
    id: 'audit-logs',
    title: 'Activity & Audit',
    icon: ScrollText,
    description: 'Complete log of every action taken',
    content: [
      'The Activity and Audit section records every action taken in the system: who did what, when, and from where. This is essential for compliance, security investigations, and understanding how your team uses the platform.',
      'Each entry shows the actor, the action, the target, the section it occurred in, the severity level, and the IP address. You can filter by severity to focus on warnings and critical events.',
      'Audit logs cannot be deleted or modified by regular users. They provide a tamper-resistant record that supports accountability and trust.',
    ],
  },
  {
    id: 'users-roles',
    title: 'Users & Roles',
    icon: Users,
    description: 'Team members, permissions, and access control',
    content: [
      'The Users and Roles section manages who has access to the system and what they can do. Each user is assigned a role — Administrator, Operator, Analyst, Auditor, or Viewer — which determines their permissions.',
      'Administrators have full control. Operators can run and manage automations. Analysts can access data and AI features. Auditors can view logs and settings but cannot make changes. Viewers have read-only access.',
      'You can invite new users, suspend accounts, and track when each user was last active. Multi-factor authentication can be enabled per user for additional security.',
    ],
  },
  {
    id: 'feature-flags',
    title: 'Feature Flags',
    icon: Flag,
    description: 'Toggle features without redeploying',
    content: [
      'Feature Flags let you turn individual capabilities on or off across different environments — development, test, staging, and production — without deploying new code.',
      'Each flag can be controlled globally, per environment, per role, per test group, or for individual users. This gives you fine-grained control over who sees what and when.',
      'Flags are categorized by area (AI, Data, Documents, Voice, and more) and track who last modified them and when. Use them to safely roll out new features or quickly disable problematic ones.',
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: Plug,
    description: 'Connect external services and tools',
    content: [
      'The Integrations section connects Snuffy to external services like Slack, email, calendars, and other tools. Connected integrations can send notifications, sync data, or trigger actions in other systems.',
      'Each integration shows its connection status, the permissions it has been granted, and when it last synced. You can connect or disconnect integrations at any time.',
      'Available integrations that are not yet connected are listed separately, so you can browse what is supported and enable the ones your team needs.',
    ],
  },
  {
    id: 'security',
    title: 'Security & Settings',
    icon: ShieldCheck,
    description: 'Privacy modes, emergency stop, and system configuration',
    content: [
      'The Security and Settings section controls the overall safety posture of the system. This includes privacy modes, the emergency stop, data retention policies, and branding.',
      'Privacy modes determine how data flows through the system. In Local mode, everything stays on your machine. In Connected mode, data may be sent to cloud AI providers. Custom mode lets you choose exactly what is shared.',
      'The Emergency Stop button instantly halts all automations and AI activity. It is always accessible from the top bar. Use it if something unexpected happens and you need to stop everything immediately.',
    ],
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Rocket,
    description: 'Quick-start guide for new users',
    content: [
      'First, visit the AI and Local Servers section to connect at least one AI model. You can use a cloud provider with an API key, or run a local model for complete privacy.',
      'Next, upload some documents in the Documents section so the AI has context to work with. Tag and organize them into folders for easier management.',
      'Then, explore the AI Chat to start asking questions. If you need repetitive tasks handled automatically, create an automation in the Automations section. Finally, review the Security and Settings to make sure your privacy mode and permissions match your needs.',
      'If you want Snuffy to search the Internet for current information, visit the Internet Search section to verify that Brave Search is connected and enable automatic search. The AI will then automatically perform web searches when you ask about current events, latest news, or anything needing up-to-date information — with cited sources in every answer.',
      'To build a local knowledge base, go to the AI Training section in the sidebar. Create a Knowledge Base, then upload documents to it in the Knowledge Documents section. Once documents are processed and approved, Snuffy will automatically search your knowledge base when you ask questions in AI Chat and cite the exact source — document name, page, slide, or sheet.'
    ],
  },
];

export function Help() {
  const [activeChapter, setActiveChapter] = useState<string>('overview');
  const [search, setSearch] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const filteredChapters = chapters.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.content.some((p) => p.toLowerCase().includes(search.toLowerCase())),
  );

  const chapter = chapters.find((c) => c.id === activeChapter) ?? chapters[0];

  const cancelSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeakingId(null);
    setPaused(false);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback(
    (c: HelpChapter) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      if (speakingId === c.id && !paused) {
        window.speechSynthesis.cancel();
        utteranceRef.current = null;
        setSpeakingId(null);
        setPaused(false);
        return;
      }

      if (speakingId === c.id && paused) {
        window.speechSynthesis.resume();
        setPaused(false);
        return;
      }

      window.speechSynthesis.cancel();
      const text = `${c.title}. ${c.description}. ${c.content.join(' ')}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => {
        setSpeakingId(null);
        setPaused(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setSpeakingId(null);
        setPaused(false);
        utteranceRef.current = null;
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setSpeakingId(c.id);
      setPaused(false);
    },
    [speakingId, paused],
  );

  const pauseSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setPaused(true);
  };

  const resumeSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setPaused(false);
  };

  const isSpeaking = (id: string) => speakingId === id && !paused;
  const isPaused = (id: string) => speakingId === id && paused;

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Help & Guide"
        description="Learn what Snuffy can do and how each part works. Click any chapter to read it, then press the speaker icon to have it read aloud."
      />

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search chapters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-bg-base border border-bg-border pl-9 pr-3 py-2 text-sm text-ink-primary placeholder:text-ink-faint focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors"
          aria-label="Search help chapters"
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        {/* Chapter list */}
        <Card className="lg:col-span-4 p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Chapters ({filteredChapters.length})</h3>
          </div>
          <div className="divide-y divide-bg-border max-h-[600px] overflow-y-auto scrollbar-thin">
            {filteredChapters.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-ink-muted">No chapters match your search.</p>
              </div>
            ) : (
              filteredChapters.map((c) => {
                const Icon = c.icon;
                const active = c.id === activeChapter;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setActiveChapter(c.id); cancelSpeech(); }}
                    className={cn(
                      'w-full text-left p-3 flex items-start gap-3 transition-colors',
                      active ? 'bg-accent/5' : 'hover:bg-bg-hover',
                    )}
                  >
                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border', active ? 'bg-accent/15 border-accent/30' : 'bg-bg-base border-bg-border')}>
                      <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-ink-muted')} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm truncate', active ? 'text-ink-primary font-medium' : 'text-ink-secondary')}>{c.title}</p>
                      <p className="text-xs text-ink-muted truncate mt-0.5">{c.description}</p>
                    </div>
                    {isSpeaking(c.id) && <span className="flex items-center gap-1 shrink-0"><span className="h-2 w-2 rounded-full bg-accent animate-pulse" /><Volume2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" /></span>}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Chapter content */}
        <Card className="lg:col-span-8 p-6">
          <div className="animate-fade-in" key={chapter.id}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <chapter.icon className="h-5 w-5 text-accent" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink-primary">{chapter.title}</h2>
                  <p className="text-xs text-ink-muted mt-0.5">{chapter.description}</p>
                </div>
              </div>
              <Badge tone="accent">Chapter {chapters.findIndex((c) => c.id === chapter.id) + 1} of {chapters.length}</Badge>
            </div>

            {/* Audio controls */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-bg-border">
              {!isSpeaking(chapter.id) && !isPaused(chapter.id) && (
                <Button size="sm" variant="outline" onClick={() => speak(chapter)} aria-label={`Read ${chapter.title} aloud`}>
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Read aloud
                </Button>
              )}
              {isSpeaking(chapter.id) && (
                <>
                  <Button size="sm" variant="outline" onClick={pauseSpeech} aria-label="Pause reading">
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pause
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => speak(chapter)} aria-label="Stop reading">
                    <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
                  </Button>
                </>
              )}
              {isPaused(chapter.id) && (
                <>
                  <Button size="sm" variant="outline" onClick={resumeSpeech} aria-label="Resume reading">
                    <Play className="h-3.5 w-3.5" aria-hidden="true" /> Resume
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelSpeech} aria-label="Stop reading">
                    <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
                  </Button>
                </>
              )}
              <span className="text-xs text-ink-muted ml-1">
                {isSpeaking(chapter.id) ? 'Reading...' : isPaused(chapter.id) ? 'Paused' : 'Click to have this chapter read aloud'}
              </span>
            </div>

            {/* Content paragraphs */}
            <div className="space-y-4">
              {chapter.content.map((paragraph, i) => (
                <p key={i} className="text-sm text-ink-secondary leading-relaxed">{paragraph}</p>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-bg-border">
              {(() => {
                const idx = chapters.findIndex((c) => c.id === chapter.id);
                const prev = idx > 0 ? chapters[idx - 1] : null;
                const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
                return (
                  <>
                    <div>
                      {prev && (
                        <button
                          onClick={() => { setActiveChapter(prev.id); cancelSpeech(); }}
                          className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        >
                          <span className="truncate max-w-[140px]">← {prev.title}</span>
                        </button>
                      )}
                    </div>
                    <div>
                      {next && (
                        <button
                          onClick={() => { setActiveChapter(next.id); cancelSpeech(); }}
                          className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-primary transition-colors"
                        >
                          <span className="truncate max-w-[140px]">{next.title} →</span>
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
