import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSettings } from '@/types';

export type WakeState = 'idle' | 'listening' | 'wake-detected' | 'command' | 'submitting';

export interface DebugEvent {
  id: number;
  timestamp: string;
  type: string;
  detail: string;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultListLike {
  length: number;
  item(index: number): ArrayLike<SpeechRecognitionResult>;
  [index: number]: ArrayLike<SpeechRecognitionResult>;
  isFinal?(index: number): boolean;
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
  resultIndex: number;
}

interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getSR(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Normalize text: lowercase, strip punctuation, collapse whitespace
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}\-_/\\@#$%^&*+=|~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Known wake phrase aliases — all normalize to "hey snuffy"
const WAKE_ALIASES: string[] = [
  'hey snuffy',
  'hey suffy',
  'hey sgt suffy',
  'hey snuff',
  'hey snuffi',
  'hey snuffie',
  'hey snoofi',
  'hey snoofie',
];

// Check if the normalized transcript contains a wake phrase at a word boundary.
// Returns the character index (in the normalized string) right after the matched phrase,
// or -1 if no match.
function findWakePhrase(normalized: string): number {
  for (const alias of WAKE_ALIASES) {
    const normAlias = normalize(alias);
    if (!normAlias) continue;
    // Word-boundary match
    const re = new RegExp(`\\b${normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(normalized);
    if (m) {
      return m.index + normAlias.length;
    }
  }
  return -1;
}

interface Options {
  voice: VoiceSettings;
  enabled: boolean;
  disabled?: boolean;
  onCommand: (transcript: string) => void;
  onDebug?: (event: DebugEvent) => void;
}

const WAKE_GRACE_MS = 5000;
const RESTART_DELAY_MS = 250;
const MAX_CONSECUTIVE_ERRORS = 10;

function playBeep() {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {
    /* noop */
  }
}

export function useWakeWord({ voice, enabled, disabled, onCommand, onDebug }: Options) {
  const [state, setState] = useState<WakeState>('idle');
  const [restartCount, setRestartCount] = useState(0);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastError, setLastError] = useState<string>('');

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const isStartingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');
  const onCommandRef = useRef(onCommand);
  const voiceRef = useRef(voice);
  const stateRef = useRef<WakeState>('idle');
  const enabledRef = useRef(enabled);
  const disabledRef = useRef(disabled);
  const errorCountRef = useRef(0);
  const intentionalStopRef = useRef(false);
  const debugIdRef = useRef(0);
  const onDebugRef = useRef(onDebug);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { voiceRef.current = voice; }, [voice]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onDebugRef.current = onDebug; }, [onDebug]);

  const emitDebug = useCallback((type: string, detail: string) => {
    const evt: DebugEvent = {
      id: debugIdRef.current++,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
      type,
      detail,
    };
    onDebugRef.current?.(evt);
  }, []);

  const updateState = useCallback((next: WakeState) => {
    stateRef.current = next;
    setState(next);
    emitDebug('state', `→ ${next}`);
  }, [emitDebug]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const startGraceTimer = useCallback(() => {
    clearGraceTimer();
    graceTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'wake-detected') {
        transcriptRef.current = '';
        updateState('listening');
      }
    }, WAKE_GRACE_MS);
  }, [clearGraceTimer, updateState]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    clearGraceTimer();
    const ms = voiceRef.current.speechEndSilence;
    silenceTimerRef.current = setTimeout(() => {
      const transcript = transcriptRef.current.trim();
      if (transcript) {
        updateState('submitting');
        onCommandRef.current(transcript);
      }
      transcriptRef.current = '';
      updateState('listening');
    }, ms);
  }, [clearSilenceTimer, clearGraceTimer, updateState]);

  const cleanup = useCallback(() => {
    intentionalStopRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    clearSilenceTimer();
    clearGraceTimer();
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* noop */ }
      recRef.current = null;
    }
    isStartingRef.current = false;
  }, [clearSilenceTimer, clearGraceTimer]);

  const startCycle = useCallback(() => {
    const SR = getSR();
    if (!SR || disabledRef.current || !enabledRef.current) return;

    // Prevent duplicate instances
    if (recRef.current || isStartingRef.current) {
      emitDebug('skip', `startCycle skipped — recognizer active or starting (rec=${!!recRef.current}, starting=${isStartingRef.current})`);
      return;
    }

    intentionalStopRef.current = false;
    isStartingRef.current = true;

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onstart = () => {
      isStartingRef.current = false;
      emitDebug('onstart', 'Recognition started');
      if (stateRef.current === 'idle') updateState('listening');
    };

    rec.onspeechstart = () => {
      emitDebug('onspeechstart', 'Speech detected');
    };

    rec.onspeechend = () => {
      emitDebug('onspeechend', 'Speech ended');
      const cur = stateRef.current;
      if (cur === 'command' || cur === 'wake-detected') {
        resetSilenceTimer();
      }
    };

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = '';
      let final = '';
      // Process ALL results from index 0, not just from resultIndex,
      // so we never miss a finalized wake phrase that Chrome already advanced past.
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result[0];
        if (!alt) continue;
        // Chrome puts isFinal on each SpeechRecognitionResult item, not on the list.
        const isFinal = (result as unknown as { isFinal?: boolean }).isFinal === true;
        const transcriptPiece = alt.transcript;
        if (isFinal) {
          final += transcriptPiece;
        } else {
          interim += transcriptPiece;
        }
      }

      const combined = (final + ' ' + interim).trim();
      if (!combined) return;

      emitDebug('onresult', `interim="${interim}" | final="${final}" | combined="${combined}"`);

      setLastTranscript(combined);

      const norm = normalize(combined);
      const cur = stateRef.current;

      if (cur === 'idle' || cur === 'listening') {
        const wakeIdx = findWakePhrase(norm);
        if (wakeIdx >= 0) {
          // Extract the command after the wake phrase from the normalized string
          const afterWake = norm.slice(wakeIdx).trim();
          transcriptRef.current = afterWake;
          emitDebug('wake-detected', `phrase matched in "${norm}" | afterWake="${afterWake}"`);
          playBeep();
          if (afterWake) {
            updateState('command');
            resetSilenceTimer();
          } else {
            updateState('wake-detected');
            startGraceTimer();
          }
        }
      } else if (cur === 'wake-detected') {
        // User is speaking their command after the wake phrase
        const wakeIdx = findWakePhrase(norm);
        const afterWake = wakeIdx >= 0 ? norm.slice(wakeIdx).trim() : norm;
        if (afterWake) {
          transcriptRef.current = afterWake;
          emitDebug('command-partial', `afterWake="${afterWake}"`);
          updateState('command');
          resetSilenceTimer();
        } else {
          emitDebug('wake-detected', `Final result was wake phrase only, staying in wake-detected`);
        }
      } else if (cur === 'command') {
        const wakeIdx = findWakePhrase(norm);
        const afterWake = wakeIdx >= 0 ? norm.slice(wakeIdx).trim() : norm;
        transcriptRef.current = afterWake;
        emitDebug('command-continue', `afterWake="${afterWake}"`);
        resetSilenceTimer();
      }
    };

    rec.onend = () => {
      isStartingRef.current = false;
      if (recRef.current === rec) {
        recRef.current = null;
      }
      emitDebug('onend', `Recognition ended (state was ${stateRef.current})`);
      clearSilenceTimer();
      const cur = stateRef.current;

      if (cur === 'command') {
        const transcript = transcriptRef.current.trim();
        if (transcript) {
          updateState('submitting');
          onCommandRef.current(transcript);
        }
        transcriptRef.current = '';
        updateState('listening');
      } else if (cur === 'submitting') {
        updateState('listening');
      } else if (cur === 'wake-detected') {
        // Keep wake-detected across restart cycles; grace timer handles timeout
        emitDebug('onend', 'Preserving wake-detected state across restart');
      } else if (cur === 'idle') {
        updateState('listening');
      }

      if (!intentionalStopRef.current && !disabledRef.current && enabledRef.current) {
        setRestartCount((c) => c + 1);
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = setTimeout(() => startCycle(), RESTART_DELAY_MS);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      isStartingRef.current = false;
      if (recRef.current === rec) {
        recRef.current = null;
      }
      const errMsg = e?.error ?? 'unknown';
      const msg = e?.message ?? '';
      setLastError(`${errMsg}${msg ? ': ' + msg : ''}`);
      emitDebug('onerror', `error="${errMsg}" message="${msg}"`);
      clearSilenceTimer();

      if (errMsg === 'not-allowed' || errMsg === 'service-not-allowed') {
        errorCountRef.current = MAX_CONSECUTIVE_ERRORS;
        updateState('idle');
        return;
      }

      if (errMsg === 'no-speech' || errMsg === 'aborted') {
        // Normal for continuous listening — don't count as errors
        errorCountRef.current = 0;
        if (!intentionalStopRef.current && !disabledRef.current && enabledRef.current) {
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current);
          }
          restartTimerRef.current = setTimeout(() => startCycle(), RESTART_DELAY_MS);
        }
        return;
      }

      errorCountRef.current += 1;
      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        emitDebug('error-limit', `Reached ${MAX_CONSECUTIVE_ERRORS} consecutive errors, stopping`);
        updateState('idle');
        return;
      }

      if (!intentionalStopRef.current && !disabledRef.current && enabledRef.current) {
        const delay = 300 * Math.min(errorCountRef.current, 4);
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = setTimeout(() => startCycle(), delay);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      errorCountRef.current = 0;
      emitDebug('start-call', 'rec.start() called');
    } catch (err) {
      isStartingRef.current = false;
      emitDebug('start-error', `rec.start() threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [clearSilenceTimer, resetSilenceTimer, startGraceTimer, updateState, emitDebug]);

  useEffect(() => {
    if (!enabled || disabled) {
      cleanup();
      updateState('idle');
      return;
    }
    startCycle();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, disabled]);

  const stop = useCallback(() => {
    cleanup();
    updateState('idle');
  }, [cleanup, updateState]);

  return { state, stop, restartCount, lastTranscript, lastError };
}
