import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Camera as CameraIcon, ChevronLeft } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildContextSnapshot } from '@/features/ask/contextSnapshot';
import {
  isConfigured as isGeminiConfigured, scanReceiptWithGemini,
} from '@/features/ask/geminiClient';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Text } from '@/shared/ui/Text';
import { parseReceiptText } from '@/shared/utils/parseReceiptText';
import { useAuthUser, useUserDoc } from '@/stores/authStore';

/**
 * /transaction/scan-receipt — full-screen camera scanner for OCR-driven
 * transaction entry (v3.5 native). Native-only: web shows a 'use the
 * mobile app' alert and back-routes.
 *
 * Flow:
 *   1. Camera permission gate. Permission auto-prompted on mount; if
 *      denied, an explanation card with a 'go to settings' link.
 *   2. Live camera preview filling the screen. Capture button at
 *      bottom (large emerald circle, banking-app style).
 *   3. After capture, brief 'scanning...' overlay. Run ML Kit text
 *      recognition on the photo URI.
 *   4. Parse the OCR text via parseReceiptText helper — best-guess
 *      amount + merchant.
 *   5. Navigate back to /transaction/new with the parsed values as
 *      query params; the entry screen pre-fills.
 */

export default function ScanReceiptScreen() {
  const { t, i18n } = useTranslation(['transactions', 'common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const wid = user ? `solo-${user.uid}` : null;
  const pinnedGoalId = userDoc?.pinnedGoalId ?? null;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  // Web fallback — camera + ML Kit are native-only. Bounce back with
  // a friendly alert. (We could implement a web variant via getUserMedia
  // + Tesseract.js, but that's bloated and out of scope.)
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text className="font-sans-bold text-xl text-center" style={{ color: '#fff' }}>
          {t('transactions:entry.scanReceipt.webUnavailableTitle')}
        </Text>
        <Text className="font-sans text-sm text-center mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {t('transactions:entry.scanReceipt.webUnavailableBody')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{
            marginTop: 24,
            paddingHorizontal: 18,
            paddingVertical: 11,
            borderRadius: 10,
            backgroundColor: tokens.accent.dashboard,
          }}
        >
          <Text className="font-sans-medium text-white">
            {t('common:actions.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Permission state machine. `null` = first probe in flight.
  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <CameraIcon size={48} color="rgba(255,255,255,0.5)" />
        <Text className="font-sans-bold text-xl text-center mt-4" style={{ color: '#fff' }}>
          {t('transactions:entry.scanReceipt.permissionTitle')}
        </Text>
        <Text className="font-sans text-sm text-center mt-2" style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 320 }}>
          {t('transactions:entry.scanReceipt.permissionBody')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void requestPermission();
          }}
          style={{
            marginTop: 24,
            paddingHorizontal: 18,
            paddingVertical: 11,
            borderRadius: 10,
            backgroundColor: tokens.accent.dashboard,
          }}
        >
          <Text className="font-sans-medium text-white">
            {t('transactions:entry.scanReceipt.permissionGrantCta')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ marginTop: 12 }}
          hitSlop={8}
        >
          <Text className="font-sans-medium text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {t('common:actions.cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Take a picture, OCR, navigate back with parsed fields. Two-tier
  // strategy:
  //   1. Try Gemini multimodal vision first (better accuracy, returns
  //      structured fields including category + date in one shot).
  //   2. Fall back to ML Kit OCR + the regex receipt parser if Gemini
  //      isn't configured or the network call fails.
  // The fallback keeps the offline path working — class demo vs.
  // realistic-conditions scenario without any UI choice for the user.
  const handleCapture = async () => {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    try {
      // Quality 0.6 keeps the base64 payload under ~500KB while still
      // giving Gemini enough resolution to read printed receipts. The
      // base64 flag is critical — we send the bytes inline to the
      // Worker rather than uploading the file URI.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        throw new Error('No photo returned');
      }

      // ---- Tier 1: Gemini multimodal vision ----
      const geminiOk = await isGeminiConfigured();
      if (geminiOk && photo.base64 && wid) {
        try {
          const ctx = await buildContextSnapshot(wid, lang, pinnedGoalId);
          const { parsed } = await scanReceiptWithGemini(
            photo.base64,
            'image/jpeg',
            ctx,
          );
          if (parsed.amountMinor != null || parsed.merchant) {
            router.replace({
              pathname: '/transaction/new',
              params: pruneParams({
                ocrAmount:
                  parsed.amountMinor != null
                    ? String(parsed.amountMinor)
                    : undefined,
                ocrMerchant: parsed.merchant ?? undefined,
                ocrCategoryId: parsed.categoryId ?? undefined,
                ocrDate: parsed.date ?? undefined,
              }),
            });
            return;
          }
          // Gemini returned but couldn't parse anything useful — fall
          // through to ML Kit so we get at least raw OCR text.
        } catch (err) {
          // Gemini call failed (offline, server error). Log and fall
          // through to ML Kit; user gets a result either way.
          console.warn('[scan-receipt] gemini failed, falling back to ML Kit', err);
        }
      }

      // ---- Tier 2: ML Kit OCR fallback ----
      // Dynamic import keeps the native module out of the web bundle.
      const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
      const result = await TextRecognition.recognize(photo.uri);
      const parsed = parseReceiptText(result.text);

      if (parsed.amountMinor === null && !parsed.merchant) {
        appAlert(
          t('transactions:entry.scanReceipt.noResultTitle'),
          t('transactions:entry.scanReceipt.noResultBody'),
        );
        return;
      }

      router.replace({
        pathname: '/transaction/new',
        params: pruneParams({
          ocrAmount: parsed.amountMinor != null ? String(parsed.amountMinor) : undefined,
          ocrMerchant: parsed.merchant ?? undefined,
        }),
      });
    } catch (err) {
      console.warn('[scan-receipt] capture/OCR failed', err);
      appAlert(
        t('transactions:entry.scanReceipt.errorTitle'),
        err instanceof Error ? err.message : t('transactions:entry.scanReceipt.errorBody'),
      );
    } finally {
      setScanning(false);
    }
  };

  // Expo Router params are URL strings; `undefined` values produce
  // 'undefined' as a literal in the URL. Strip them before passing.
  function pruneParams(
    raw: Record<string, string | undefined>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        autofocus="on"
      />

      {/* Top-left back button — overlay on the live camera. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.back')}
        onPress={() => router.back()}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ChevronLeft size={22} color="#fff" />
      </Pressable>

      {/* Top label — short hint of what to do. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 64,
          right: 16,
          alignItems: 'flex-start',
          justifyContent: 'center',
          minHeight: 40,
        }}
      >
        <Text
          className="font-sans-medium text-sm"
          style={{
            color: '#fff',
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 4,
          }}
        >
          {t('transactions:entry.scanReceipt.title')}
        </Text>
        <Text
          className="font-sans text-xs"
          style={{
            color: 'rgba(255,255,255,0.85)',
            textShadowColor: 'rgba(0,0,0,0.8)',
            textShadowRadius: 4,
            marginTop: 2,
          }}
        >
          {t('transactions:entry.scanReceipt.hint')}
        </Text>
      </View>

      {/* Bottom capture button — banking-app-large emerald circle. */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 32,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions:entry.scanReceipt.captureCta')}
          accessibilityState={{ disabled: scanning }}
          onPress={handleCapture}
          disabled={scanning}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: tokens.accent.dashboard,
            borderWidth: 4,
            borderColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: scanning ? 0.5 : 1,
          }}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <CameraIcon size={28} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* Scanning overlay — centred status when OCR is running. */}
      {scanning ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          <View
            style={{
              backgroundColor: isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'],
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderRadius: 14,
              alignItems: 'center',
              gap: 12,
            }}
          >
            <ActivityIndicator color={tokens.accent.dashboard} />
            <Text
              className="font-sans-medium text-sm"
              style={{ color: isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'] }}
            >
              {t('transactions:entry.scanReceipt.scanning')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
