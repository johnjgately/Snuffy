import { useState, useEffect } from 'react';
import { Card, SectionHeader, Badge, Button, Toggle, Field, Select, Input } from '@/components/ui';
import { useApp } from '@/state/AppContext';
import { Mic, Keyboard, ShieldCheck, AlertTriangle, Trash2, Clock, Ear, Type, Radio, Gauge, Timer, Sparkles } from 'lucide-react';

export function VoiceKeyboard() {
  const { voice, setVoice, emergencyStop } = useApp();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'audioinput'))).catch(() => {});
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const load = () => setVoices(window.speechSynthesis.getVoices());
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  return (
    <div className="animate-fade-in">
      <SectionHeader
        title="Voice, Keyboard & Dictation"
        description="Configure speech-to-text, text-to-speech, microphone selection, and AI-powered dictation. All voice features respect your privacy mode."
        actions={<Badge tone={emergencyStop ? 'danger' : 'success'}><Mic className="h-3 w-3" aria-hidden="true" /> {emergencyStop ? 'Halted' : 'Ready'}</Badge>}
      />

      {/* Mic status indicator */}
      <Card className="mb-4 p-4 flex items-center gap-4">
        <div className="relative h-12 w-12 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
          {voice.wakeWord ? <Radio className="h-5 w-5 text-accent" aria-hidden="true" /> : <Mic className="h-5 w-5 text-accent" aria-hidden="true" />}
          {!emergencyStop && (voice.pushToTalk || voice.wakeWord) && <span className="absolute inset-0 rounded-full border border-accent animate-pulse-ring" aria-hidden="true" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Microphone status</p>
          <p className="text-xs text-ink-muted">
            {emergencyStop ? 'Microphone disabled by emergency stop'
              : voice.wakeWord ? `Hands-free active — say "${voice.wakeWordPhrase}" to activate the assistant`
              : voice.pushToTalk ? 'Push-to-talk active — click the mic icon in AI Chat'
              : 'Continuous listening mode'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${emergencyStop ? 'bg-danger' : 'bg-success'} ${!emergencyStop && 'animate-blink'}`} aria-hidden="true" />
          <span className="text-xs font-mono uppercase text-ink-muted">{emergencyStop ? 'off' : voice.wakeWord ? 'wake-ready' : 'standby'}</span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Voice settings */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Mic className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">Voice Settings</h3></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Push-to-talk</p><p className="text-xs text-ink-muted">Hold to speak, release to send</p></div>
              <Toggle checked={voice.pushToTalk} onChange={(v) => setVoice({ pushToTalk: v })} disabled={emergencyStop} aria-label="Toggle push-to-talk" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Wake-word activation</p><p className="text-xs text-ink-muted">Enable hands-free voice activation from standby</p></div>
              <Toggle checked={voice.wakeWord} onChange={(v) => setVoice({ wakeWord: v })} disabled={emergencyStop} aria-label="Toggle wake-word activation" />
            </div>
            {voice.wakeWord && (
              <div className="space-y-3 p-3 rounded-lg bg-accent/5 border border-accent/20 animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <Radio className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Hands-free configuration</p>
                </div>
                <Field label="Wake word" hint="Speak this phrase to activate the assistant from standby.">
                  <Input value={voice.wakeWordPhrase} onChange={(e) => setVoice({ wakeWordPhrase: e.target.value.toLowerCase() })} placeholder="hey snuffy" disabled={emergencyStop} />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {['hey snuffy', 'snuffy', 'hey assistant', 'computer'].map((w) => (
                    <button key={w} onClick={() => setVoice({ wakeWordPhrase: w })} aria-pressed={voice.wakeWordPhrase === w} className={`text-xs px-2 py-1 rounded-md border transition-colors ${voice.wakeWordPhrase === w ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-bg-base border-bg-border text-ink-muted hover:text-ink-primary'}`}>
                      {w}
                    </button>
                  ))}
                </div>
                <Field label={`Microphone sensitivity: ${Math.round(voice.micSensitivity * 100)}%`} hint="Higher values detect quieter speech but may pick up background noise.">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-ink-muted shrink-0" aria-hidden="true" />
                    <input type="range" min="0" max="1" step="0.05" value={voice.micSensitivity} onChange={(e) => setVoice({ micSensitivity: Number(e.target.value) })} className="w-full accent-accent" disabled={emergencyStop} aria-label="Microphone sensitivity" />
                  </div>
                </Field>
                <Field label={`Speech-end silence: ${(voice.speechEndSilence / 1000).toFixed(1)}s`} hint="How long the assistant waits after you stop speaking before submitting.">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-ink-muted shrink-0" aria-hidden="true" />
                    <input type="range" min="500" max="4000" step="100" value={voice.speechEndSilence} onChange={(e) => setVoice({ speechEndSilence: Number(e.target.value) })} className="w-full accent-accent" disabled={emergencyStop} aria-label="Speech-end silence duration" />
                  </div>
                </Field>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-bg-base border border-bg-border">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-ink-primary">Auto-submit</p>
                      <p className="text-xs text-ink-muted">Submit automatically after speech ends, or hold for confirmation</p>
                    </div>
                  </div>
                  <Toggle checked={voice.autoSubmitVoice} onChange={(v) => setVoice({ autoSubmitVoice: v })} disabled={emergencyStop} aria-label="Toggle auto-submit voice commands" />
                </div>
                {!voice.autoSubmitVoice && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning-soft/20 border border-warning/30 animate-fade-in">
                    <ShieldCheck className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-xs text-warning">Confirmation required: Snuffy will show your spoken request and wait for your approval before sending.</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Text-to-speech</p><p className="text-xs text-ink-muted">Read responses aloud</p></div>
              <Toggle checked={voice.ttsEnabled} onChange={(v) => setVoice({ ttsEnabled: v })} aria-label="Toggle text-to-speech" />
            </div>
            <Field label="Microphone device">
              <Select value={voice.micDeviceId ?? ''} onChange={(e) => setVoice({ micDeviceId: e.target.value || null })}>
                <option value="">System default</option>
                {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </Select>
            </Field>
            <Field label="TTS voice">
              <Select value={voice.ttsVoice ?? ''} onChange={(e) => setVoice({ ttsVoice: e.target.value || null })}>
                <option value="">System default</option>
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </Select>
            </Field>
            <Field label={`Speech rate: ${voice.ttsRate.toFixed(1)}x`}>
              <input type="range" min="0.5" max="2" step="0.1" value={voice.ttsRate} onChange={(e) => setVoice({ ttsRate: Number(e.target.value) })} className="w-full accent-accent" />
            </Field>
          </div>
        </Card>

        {/* Keyboard & dictation */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Keyboard className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-semibold">AI Keyboard & Dictation</h3></div>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
              <Type className="h-4 w-4 text-ink-secondary mt-0.5" aria-hidden="true" />
              <div className="flex-1"><p className="text-sm text-ink-primary">Dictation insertion</p><p className="text-xs text-ink-muted mt-0.5">Convert speech to text and insert into selected fields, documents, or forms. Requires approval before submitting.</p></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
              <Ear className="h-4 w-4 text-ink-secondary mt-0.5" aria-hidden="true" />
              <div className="flex-1"><p className="text-sm text-ink-primary">Optional processing</p><p className="text-xs text-ink-muted mt-0.5">Spelling correction, punctuation, grammar cleanup, tone adjustment, summarization, translation, and autocomplete.</p></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-soft/20 border border-warning/30">
              <ShieldCheck className="h-4 w-4 text-warning mt-0.5" aria-hidden="true" />
              <div className="flex-1"><p className="text-sm text-warning">Approval required</p><p className="text-xs text-ink-muted mt-0.5">Snuffy will not submit forms, send emails, or click buttons without your explicit approval.</p></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-base border border-bg-border">
              <AlertTriangle className="h-4 w-4 text-ink-secondary mt-0.5" aria-hidden="true" />
              <div className="flex-1"><p className="text-sm text-ink-primary">System-wide access</p><p className="text-xs text-ink-muted mt-0.5">Full keyboard control requires the optional browser extension or desktop companion. The web app alone does not have unrestricted system-wide control.</p></div>
            </div>
          </div>
        </Card>

        {/* Privacy controls */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4"><ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /><h3 className="text-sm font-semibold">Privacy & Retention</h3></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Store transcripts</p><p className="text-xs text-ink-muted">Retain voice transcripts</p></div>
              <Toggle checked={voice.storeTranscripts} onChange={(v) => setVoice({ storeTranscripts: v })} aria-label="Toggle storing transcripts" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-base border border-bg-border">
              <div><p className="text-sm text-ink-primary">Keyboard history</p><p className="text-xs text-ink-muted">Store dictation history</p></div>
              <Toggle checked={voice.storeKeyboardHistory} onChange={(v) => setVoice({ storeKeyboardHistory: v })} aria-label="Toggle storing keyboard history" />
            </div>
            <div className="p-3 rounded-lg bg-bg-base border border-bg-border">
              <p className="text-sm text-ink-primary mb-2">Auto-delete after</p>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                <Select value={String(voice.autoDeleteHours)} onChange={(e) => setVoice({ autoDeleteHours: Number(e.target.value) })}>
                  <option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="0">Never</option>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="danger" size="sm"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete all transcripts</Button>
            <Button variant="outline" size="sm"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete keyboard history</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
