import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Web-only speech-to-text hook for v2 launch. Wraps the browser's
 * SpeechRecognition / webkitSpeechRecognition API. Native (Android /
 * iOS) returns `supported: false` — full native support requires
 * `expo-speech-recognition` which can't ship in Expo Go (needs an EAS
 * dev client). v2.5 polish will add the native side once the dev
 * client lands.
 *
 * Usage:
 *   const { supported, isListening, start, stop, error } = useVoiceInput({
 *     locale: 'id',
 *     onResult: (text) => setNlpInput(text),
 *   });
 *
 * The hook calls `onResult` with the FINAL transcript when recognition
 * ends (browsers fire interim results too but we only push the final
 * one to keep the consumer state simple).
 *
 * Browser support: Chrome, Edge, Safari. Firefox does NOT support
 * SpeechRecognition; the hook returns `supported: false` there.
 */

type UseVoiceInputOptions = {
  /** BCP-47 lang tag — pass app's active locale ('id' or 'en'). */
  locale?: 'id' | 'en';
  /** Fired with the final transcript when recognition ends. */
  onResult?: (transcript: string) => void;
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal: boolean }>>;
  resultIndex: number;
};

type SpeechRecognitionErrorLike = Event & { error: string };

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { locale = 'id', onResult } = options;
  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Stash the latest onResult in a ref so the start callback closure
  // doesn't capture a stale reference.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* no-op */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    if (isListening) return;
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('not-supported');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = locale === 'id' ? 'id-ID' : 'en-US';
      rec.continuous = false;     // single-utterance mode
      rec.interimResults = false;  // we only consume the final transcript
      rec.onresult = (e: SpeechRecognitionEventLike) => {
        // Walk the results from resultIndex; pick the final transcript.
        let text = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (!result) continue;
          const alt = result[0];
          if (alt && (alt as { isFinal?: boolean }).isFinal !== false) {
            text += alt.transcript;
          }
        }
        if (text.trim().length > 0) {
          onResultRef.current?.(text.trim());
        }
      };
      rec.onerror = (e: SpeechRecognitionErrorLike) => {
        setError(e.error || 'unknown');
        setIsListening(false);
      };
      rec.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = rec;
      setIsListening(true);
      rec.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      setIsListening(false);
    }
  }, [isListening, locale]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* no-op */ }
    }
  }, []);

  return { supported, isListening, start, stop, error };
}
