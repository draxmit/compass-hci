import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Native (Android / iOS) speech-to-text hook. Wraps
 * `expo-speech-recognition` (community package by jamsch) which talks
 * to SiriKit on iOS and Google Speech Service on Android.
 *
 * Same external shape as the `voiceInput.ts` web variant — Metro picks
 * `.native.ts` on native and `.ts` on web, so callers can just import
 * `useVoiceInput` without platform branching.
 *
 * Permission flow: requests RECORD_AUDIO + speech-recognition on
 * first start. If the user denies, sets `error: 'not-allowed'` and
 * `supported: false`.
 *
 * The hook fires `onResult` with the FINAL transcript when a single
 * utterance ends. `interimResults: false` keeps consumers simple —
 * they don't have to debounce mid-speech updates.
 */

type UseVoiceInputOptions = {
  /** BCP-47 lang tag — pass app's active locale ('id' or 'en'). */
  locale?: 'id' | 'en';
  /** Fired with the final transcript when recognition ends. */
  onResult?: (transcript: string) => void;
};

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const { locale = 'id', onResult } = options;
  // Native always has biscuit (the package). The hook's `supported`
  // returns true unconditionally — actual hardware/permission gates
  // surface as `error` once `start()` is called.
  const [supported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stash the latest onResult in a ref so the start callback closure
  // doesn't capture a stale reference.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Listen for the 'result' event the recognition module fires. Each
  // result event contains a `results` array; the final one is what
  // we hand to consumers. `isFinal` is set on the last event of a
  // single-utterance recognition session.
  useSpeechRecognitionEvent('result', (event) => {
    if (!event.isFinal) return;
    const transcript = event.results?.[0]?.transcript ?? '';
    if (transcript.trim().length > 0) {
      onResultRef.current?.(transcript.trim());
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.error || 'unknown');
    setIsListening(false);
  });

  const start = useCallback(async () => {
    if (isListening) return;
    setError(null);
    try {
      // Request mic + speech-recognition permissions. Cached after
      // the first grant, so this is a no-op on subsequent starts.
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('not-allowed');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: locale === 'id' ? 'id-ID' : 'en-US',
        // We only consume the FINAL transcript — interim updates
        // would force consumers to debounce, which the parent /transaction/new
        // form isn't built for.
        interimResults: false,
        // Single-utterance mode — stops automatically when the user
        // pauses for a moment.
        continuous: false,
        // Android: prefer on-device recognition when available;
        // falls back to network if not.
        requiresOnDeviceRecognition: false,
        // Don't keep the mic alive after stop() — saves battery.
        maxAlternatives: 1,
      });
      setIsListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      setIsListening(false);
    }
  }, [isListening, locale]);

  const stop = useCallback(() => {
    if (!isListening) return;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* no-op — module may already be stopped */
    }
  }, [isListening]);

  // Clean up if the component unmounts mid-listen.
  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* no-op */
      }
    };
  }, []);

  return { supported, isListening, start, stop, error };
}
