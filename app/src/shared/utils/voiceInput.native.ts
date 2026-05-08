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
      // ALWAYS Indonesian for the voice recogniser — Compass is an
      // Indonesian banking app, and merchants / numbers / slang are
      // overwhelmingly Indonesian regardless of UI locale. Tying voice
      // to the UI language meant English-locale users (testing, language-
      // toggle accidents) got their Indonesian speech transcribed as
      // English. The `locale` param is still accepted but ignored on
      // native; if a future iteration needs proper bilingual voice,
      // that's a Settings-level toggle, not a UI-locale spillover.
      void locale; // intentionally unused on native
      const recogLang = 'id-ID';
      // Discover available recognition services. We then pick the first
      // one Android exposes — picking explicitly bypasses the device's
      // default routing, which on some Samsung / Xiaomi ROMs prefers a
      // service that silently falls back to the device's primary
      // language when id-ID isn't installed offline. Best candidate is
      // Google's quick search box (universally cloud-backed for id-ID),
      // then the Google text-to-speech recogniser, then anything else.
      let recogServicePackage: string | undefined;
      try {
        const services: string[] =
          (ExpoSpeechRecognitionModule.getSpeechRecognitionServices?.() as string[] | undefined) ??
          [];
        const preferOrder = [
          'com.google.android.googlequicksearchbox',
          'com.google.android.tts',
          'com.google.android.as',
        ];
        for (const candidate of preferOrder) {
          if (services.includes(candidate)) {
            recogServicePackage = candidate;
            break;
          }
        }
        // Falls through to undefined (= use system default) if none of
        // the preferred services are present — better than crashing.
      } catch {
        /* no-op — getSpeechRecognitionServices may throw on older devices */
      }
      ExpoSpeechRecognitionModule.start({
        lang: recogLang,
        // We only consume the FINAL transcript — interim updates
        // would force consumers to debounce, which the parent /transaction/new
        // form isn't built for.
        interimResults: false,
        // Single-utterance mode — stops automatically when the user
        // pauses for a moment.
        continuous: false,
        // Network mode is critical for Indonesian — many devices don't
        // have the offline pack installed, so cloud fallback ensures
        // id-ID actually works.
        requiresOnDeviceRecognition: false,
        // Don't keep the mic alive after stop() — saves battery.
        maxAlternatives: 1,
        // Pin the recogniser to a known service that supports id-ID via
        // cloud, bypassing device-default routing that might pick a
        // service ignoring the BCP-47 lang tag. Undefined falls back to
        // system default if none of our preferred services exist.
        ...(recogServicePackage
          ? { androidRecognitionServicePackage: recogServicePackage }
          : {}),
        // Bias the recogniser toward Indonesian banking + merchant
        // vocabulary so amounts and merchants get transcribed
        // correctly. Without these hints, "rb" was getting heard as
        // "are be" instead of "ribu", and "BCA" as "be see ay".
        contextualStrings: [
          // Top Indonesian banks
          'BCA', 'Mandiri', 'BRI', 'BNI', 'CIMB', 'Permata',
          'Jago', 'Jenius', 'BSI', 'Danamon',
          // E-wallets
          'GoPay', 'OVO', 'Dana', 'ShopeePay', 'LinkAja',
          // Common merchants
          'Indomaret', 'Alfamart', 'Gojek', 'Grab', 'Tokopedia',
          'Shopee', 'Tokpedia', 'Blibli', 'Lazada', 'Traveloka',
          'Starbucks', 'KFC', 'McDonalds',
          // Amount slang + multipliers
          'ribu', 'juta', 'rupiah', 'rb', 'jt',
          'lima', 'sepuluh', 'dua puluh', 'lima puluh', 'seratus',
          // Common spend categories
          'warteg', 'kopi', 'bensin', 'pulsa', 'parkir',
          'ojek', 'taksi', 'belanja', 'makan', 'jajan',
          // Common verbs
          'bayar', 'transfer', 'pakai', 'dari', 'untuk',
        ],
        // Prefer free-form dictation over short web-search queries —
        // banking sentences are longer than typical voice queries.
        // The top-level `lang` field already maps to EXTRA_LANGUAGE
        // internally, so we don't duplicate it here.
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
        },
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
