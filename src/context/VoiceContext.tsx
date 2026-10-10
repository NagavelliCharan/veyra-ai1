import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useToast } from './ToastContext';

export interface VoiceLanguage {
  code: string;
  name: string;
  flag: string;
}

export const SUPPORTED_VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'en-IN', name: 'English (India)', flag: '🇮🇳' },
  { code: 'es-ES', name: 'Spanish (Español)', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French (Français)', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German (Deutsch)', flag: '🇩🇪' },
  { code: 'hi-IN', name: 'Hindi (हिंदी)', flag: '🇮🇳' },
  { code: 'ja-JP', name: 'Japanese (日本語)', flag: '🇯🇵' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)', flag: '🇨🇳' },
];

// Auto-finalize the voice prompt after this much silence following recognized speech
const SILENCE_TIMEOUT_MS = 2500;
// After Stop, how long to wait for the speech service to flush its last results
const FLUSH_TIMEOUT_MS = 2000;

// RMS level (0..1) above which the mic monitor counts the input as real sound rather than silence
const MIC_SOUND_THRESHOLD = 0.02;

export interface VoiceSessionInfo {
  /** Whether the speech recognition engine detected any sound during the session */
  heardSound: boolean;
  /** Whether our own level monitor saw audio on the microphone stream (null if monitoring failed) */
  micHadAudio: boolean | null;
  /** Label of the input device the browser is recording from, if known */
  micLabel: string;
}

export interface VoiceSessionHandlers {
  /** Called with the full transcript of this session (final + interim) as the user speaks */
  onTranscript: (transcript: string) => void;
  /** Called exactly once when the session finishes via Stop or silence, with the final transcript */
  onComplete: (transcript: string, info: VoiceSessionInfo) => void;
}

interface VoiceContextType {
  isListening: boolean;
  /** Live microphone input level (0..1) while listening, for the level meter */
  micLevel: number;
  voiceLang: string;
  setVoiceLang: (lang: string) => void;
  isSpeechRecognitionSupported: boolean;
  requestMicrophonePermission: () => Promise<boolean>;
  startListening: (handlers: VoiceSessionHandlers) => Promise<boolean>;
  /** Stops recording and delivers the transcript to onComplete */
  stopListening: () => void;
  /** Stops recording and discards the transcript */
  cancelListening: () => void;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

const getSpeechRecognitionClass = (): any =>
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
    : null;

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();

  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const [voiceLang, setVoiceLangState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('privy_voice_lang') || 'en-US';
    }
    return 'en-US';
  });

  const recognitionRef = useRef<any>(null);
  const handlersRef = useRef<VoiceSessionHandlers | null>(null);
  // Transcript finalized in earlier recognition runs of this session (Chrome may end and restart)
  const committedTranscriptRef = useRef('');
  const currentTranscriptRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionActiveRef = useRef(false);
  const heardSoundRef = useRef(false);
  const micMonitorRef = useRef<{
    stream: MediaStream;
    audioCtx: AudioContext;
    interval: ReturnType<typeof setInterval>;
  } | null>(null);
  const micPeakRef = useRef<number | null>(null);
  const micLabelRef = useRef('');

  const isSpeechRecognitionSupported = Boolean(getSpeechRecognitionClass());

  const setVoiceLang = (lang: string) => {
    setVoiceLangState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('privy_voice_lang', lang);
    }
  };

  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showToast('Microphone access is not available in this browser or context (HTTPS required).', 'error');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop all tracks to avoid holding mic stream open
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: any) {
      console.warn('Microphone permission check error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast(
          'Microphone permission denied. Please allow microphone permissions in your browser.',
          'error'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showToast('No microphone found on your device.', 'error');
      } else {
        showToast('Could not access microphone.', 'error');
      }
      return false;
    }
  };

  const stopMicMonitor = () => {
    const monitor = micMonitorRef.current;
    micMonitorRef.current = null;
    if (monitor) {
      clearInterval(monitor.interval);
      monitor.stream.getTracks().forEach((track) => track.stop());
      monitor.audioCtx.close().catch(() => {});
    }
    setMicLevel(0);
  };

  // Measures the real input level so users can see the mic is live, and so we can tell a silent
  // mic apart from a browser whose speech service isn't receiving audio
  const startMicMonitor = async () => {
    micPeakRef.current = null;
    micLabelRef.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micLabelRef.current = stream.getAudioTracks()[0]?.label || '';
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      micPeakRef.current = 0;
      const interval = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / samples.length);
        micPeakRef.current = Math.max(micPeakRef.current ?? 0, rms);
        setMicLevel(Math.min(1, rms * 5));
      }, 100);
      micMonitorRef.current = { stream, audioCtx, interval };
      console.info('[Voice] Recording from input device:', micLabelRef.current || '(unknown)');
    } catch (err) {
      // Monitoring is diagnostic only; recognition can still work without it
      console.warn('[Voice] Mic level monitor unavailable:', err);
    }
  };

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // Tears down the recognition instance; detaches handlers first so late results can't leak back into the UI
  const teardown = useCallback((mode: 'stop' | 'abort') => {
    clearSilenceTimer();
    stopMicMonitor();
    sessionActiveRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.onsoundstart = null;
      try {
        if (mode === 'stop') recognition.stop();
        else recognition.abort();
      } catch {
        // already stopped
      }
    }
    setIsListening(false);
  }, []);

  const finishSession = useCallback(
    (deliver: boolean) => {
      if (!sessionActiveRef.current) return;
      // Stops the auto-restart in onend; results still in flight keep updating the transcript
      sessionActiveRef.current = false;
      clearSilenceTimer();

      if (!deliver) {
        handlersRef.current = null;
        teardown('abort');
        return;
      }

      let completed = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
      const complete = () => {
        if (completed) return;
        completed = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        const handlers = handlersRef.current;
        handlersRef.current = null;
        teardown('abort');
        const info: VoiceSessionInfo = {
          heardSound: heardSoundRef.current,
          micHadAudio: micPeakRef.current === null ? null : micPeakRef.current > MIC_SOUND_THRESHOLD,
          micLabel: micLabelRef.current,
        };
        console.info('[Voice] Session finished:', { transcript: currentTranscriptRef.current, ...info });
        handlers?.onComplete(currentTranscriptRef.current.trim(), info);
      };

      const recognition = recognitionRef.current;
      if (!recognition) {
        complete();
        return;
      }

      setIsListening(false);
      // stop() (unlike abort()) makes the service deliver pending final results before onend
      recognition.onend = complete;
      recognition.onerror = complete;
      fallbackTimer = setTimeout(complete, FLUSH_TIMEOUT_MS);
      try {
        recognition.stop();
      } catch {
        complete();
      }
    },
    [teardown]
  );

  const stopListening = useCallback(() => finishSession(true), [finishSession]);
  const cancelListening = useCallback(() => finishSession(false), [finishSession]);

  const startListening = async (handlers: VoiceSessionHandlers): Promise<boolean> => {
    if (sessionActiveRef.current) return true;
    // Previous session is still flushing its final results
    if (recognitionRef.current) return false;

    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) {
      showToast(
        'Voice input is not supported in this browser. Please type your message or use Chrome/Edge.',
        'error'
      );
      return false;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return false;

    handlersRef.current = handlers;
    committedTranscriptRef.current = '';
    currentTranscriptRef.current = '';
    heardSoundRef.current = false;
    sessionActiveRef.current = true;
    await startMicMonitor();
    if (!sessionActiveRef.current) {
      stopMicMonitor();
      return false;
    }

    const scheduleSilenceStop = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => finishSession(true), SILENCE_TIMEOUT_MS);
    };

    const startRecognitionRun = () => {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = voiceLang || 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onsoundstart = () => {
        heardSoundRef.current = true;
        console.info('[Voice] Speech engine detected sound');
      };

      recognition.onresult = (event: any) => {
        let runTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          runTranscript += event.results[i][0].transcript;
        }
        const committed = committedTranscriptRef.current;
        const full = [committed, runTranscript.trim()].filter(Boolean).join(' ');
        currentTranscriptRef.current = full;
        handlersRef.current?.onTranscript(full);
        if (full.trim() && sessionActiveRef.current) scheduleSilenceStop();
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        switch (event.error) {
          case 'not-allowed':
          case 'service-not-allowed':
            showToast(
              'Microphone access was denied. Please allow microphone permissions in your browser.',
              'error'
            );
            break;
          case 'audio-capture':
            showToast('No microphone found or microphone is busy.', 'error');
            break;
          case 'network':
            showToast('Network error during voice recognition. Please check your connection.', 'error');
            break;
          case 'language-not-supported':
            showToast('The selected voice language is not supported by this browser.', 'error');
            break;
          default:
            // 'no-speech' and 'aborted' are recoverable; onend decides what happens next
            return;
        }
        handlersRef.current = null;
        teardown('abort');
      };

      recognition.onend = () => {
        if (!sessionActiveRef.current) return;
        // Browser ended the run on its own (e.g. pause/timeout) — keep the session alive
        committedTranscriptRef.current = currentTranscriptRef.current.trim();
        try {
          startRecognitionRun();
        } catch {
          finishSession(true);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    };

    try {
      startRecognitionRun();
      return true;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      handlersRef.current = null;
      teardown('abort');
      showToast('Could not access microphone for voice input.', 'error');
      return false;
    }
  };

  // Release the microphone if the provider unmounts mid-session
  useEffect(() => () => teardown('abort'), [teardown]);

  return (
    <VoiceContext.Provider
      value={{
        isListening,
        micLevel,
        voiceLang,
        setVoiceLang,
        isSpeechRecognitionSupported,
        requestMicrophonePermission,
        startListening,
        stopListening,
        cancelListening,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
};
