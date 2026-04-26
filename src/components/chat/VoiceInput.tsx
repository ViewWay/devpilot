import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { useI18n } from "../../i18n";
import type { Locale } from "../../i18n";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  locale?: string;
}

/** Map i18n locale to Web Speech API BCP-47 language tag. */
function toSpeechLocale(locale: Locale | undefined): string {
  if (!locale) {return "en-US";}
  const map: Record<string, string> = {
    en: "en-US",
    zh: "zh-CN",
  };
  return map[locale] ?? locale;
}

// Typed interface for the Web Speech API Recognition (not yet in lib.dom)
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInput({ onTranscript, locale }: VoiceInputProps) {
  const { t, locale: i18nLocale } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [supported] = useState(() => !!getSpeechRecognition());
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    lastSpeechTimeRef.current = Date.now();
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop after 3s silence
      recognitionRef.current?.stop();
    }, 3000);
  }, [clearSilenceTimer]);

  const stopRecording = useCallback(() => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, [clearSilenceTimer]);

  const startRecording = useCallback(() => {
    if (!supported) {return;}

    const SpeechRecognitionCtor = getSpeechRecognition()!;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = toSpeechLocale((locale as Locale) ?? i18nLocale);
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        } else {
          interim += result[0]?.transcript ?? "";
        }
      }

      // Show interim transcript while recording
      if (interim) {
        setInterimTranscript(finalTranscript + interim);
      }

      // Reset silence timer on any speech activity
      if (interim || finalTranscript) {
        resetSilenceTimer();
      }
    };

    recognition.onerror = () => {
      // If we have accumulated text, deliver it before stopping
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim());
      }
      clearSilenceTimer();
      setIsRecording(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      // Deliver final transcript
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim());
      }
      clearSilenceTimer();
      setIsRecording(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    setInterimTranscript("");
    setIsRecording(true);
    recognition.start();

    // Start silence timer
    resetSilenceTimer();
  }, [supported, locale, i18nLocale, onTranscript, clearSilenceTimer, resetSilenceTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      recognitionRef.current?.abort();
    };
  }, [clearSilenceTimer]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const tooltipText = !supported
    ? t("voiceInput.notSupported")
    : isRecording
      ? t("voiceInput.listening")
      : t("voiceInput.micTooltip");

  return (
    <div className="relative flex items-center">
      {/* Interim transcript display */}
      {isRecording && interimTranscript && (
        <div className="absolute bottom-full right-0 mb-2 max-w-[260px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-lg z-50 break-words">
          <span className="text-[10px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider block mb-1">
            {t("voiceInput.transcript")}
          </span>
          {interimTranscript}
        </div>
      )}

      <button
        onClick={toggleRecording}
        disabled={!supported}
        title={tooltipText}
        className={`
          group relative mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors
          ${!supported
            ? "cursor-not-allowed text-[var(--color-text-secondary)]/40"
            : isRecording
              ? "text-[var(--color-error)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          }
        `}
        aria-label={tooltipText}
      >
        {/* Pulsing red ring when recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-md animate-pulse-ring" />
        )}

        {isRecording ? (
          <MicOff size={15} className="relative z-10" />
        ) : (
          <Mic size={15} />
        )}
      </button>
    </div>
  );
}
