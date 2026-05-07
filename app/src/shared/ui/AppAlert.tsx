import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Themed in-app alert dialog. Drop-in replacement for `Alert.alert` from
 * `react-native` — same positional signature `appAlert(title, body?, buttons?)`
 * — but rendered with the app's tokens (Card surface + Mercury × Raycast
 * typography + danger / accent colours) instead of the OS-native dialog.
 *
 * Why custom: `Alert.alert()` ships the platform's native dialog (Android
 * Material on Android, iOS UIAlertController on iOS, browser
 * `window.confirm` on web) and exposes zero styling API. The native
 * dialogs are visually loud against our flat Mercury surfaces — they
 * read as a different app momentarily showing through.
 *
 * Usage:
 *   const appAlert = useAppAlert();
 *   appAlert('Delete budget?', 'Spending stays logged.', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Delete', style: 'destructive', onPress: doDelete },
 *   ]);
 *
 * Mounted once at the root via `<AppAlertProvider />` in `app/_layout.tsx`.
 *
 * Behaviour parity with Alert.alert:
 *  - Single-button alerts default to `[{ text: t('common:actions.ok') }]`
 *    if no buttons array is passed.
 *  - Android hardware back fires the cancel button if any (else closes).
 *  - Tap-outside-to-dismiss fires the cancel button if any (else closes).
 *  - Buttons render side-by-side when ≤2, stacked when ≥3.
 *  - 'destructive' style → semantic.danger background + white text.
 *  - 'cancel' style → outlined neutral.
 *  - 'default' style → filled accent (or primary if no destructive present).
 */

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppAlertFn = (
  title: string,
  body?: string,
  buttons?: readonly AppAlertButton[],
) => void;

type ActiveAlert = {
  title: string;
  body: string | undefined;
  buttons: readonly AppAlertButton[];
};

const AppAlertContext = createContext<AppAlertFn | null>(null);

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['common']);
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [active, setActive] = useState<ActiveAlert | null>(null);

  const show: AppAlertFn = useCallback(
    (title, body, buttons) => {
      const resolvedButtons: readonly AppAlertButton[] =
        buttons && buttons.length > 0
          ? buttons
          : [{ text: t('common:actions.ok'), style: 'default' }];
      setActive({ title, body, buttons: resolvedButtons });
    },
    [t],
  );

  const handleButtonPress = (btn: AppAlertButton) => {
    setActive(null);
    // Defer to a microtask so the modal unmount completes before any nav
    // the callback might trigger — otherwise on web the modal can briefly
    // re-render over the new screen.
    queueMicrotask(() => btn.onPress?.());
  };

  // Android hardware back / tap-outside dismiss: prefer firing the cancel
  // button (preserves user intent), fall back to silent close.
  const dismissByOutsideOrBack = () => {
    if (!active) return;
    const cancel = active.buttons.find((b) => b.style === 'cancel');
    if (cancel) handleButtonPress(cancel);
    else setActive(null);
  };

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];

  return (
    <AppAlertContext.Provider value={show}>
      {children}
      <Modal
        visible={active !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissByOutsideOrBack}
      >
        <Pressable
          accessibilityElementsHidden
          accessibilityLabel="Close"
          onPress={dismissByOutsideOrBack}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* Inner Pressable swallows tap propagation so tapping the card
              doesn't dismiss via the backdrop handler. */}
          <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 380 }}>
            {active ? (
              <Card padding="lg">
                <Text
                  className="font-sans-bold text-xl mb-2"
                  style={{ color: fgColor }}
                  accessibilityRole="header"
                >
                  {active.title}
                </Text>
                {active.body ? (
                  <Text
                    className="font-sans text-sm mb-6"
                    style={{ color: mutedColor, lineHeight: 22 }}
                  >
                    {active.body}
                  </Text>
                ) : (
                  <View style={{ marginBottom: 16 }} />
                )}
                <ButtonRow
                  buttons={active.buttons}
                  isDark={isDark}
                  fgColor={fgColor}
                  onPress={handleButtonPress}
                />
              </Card>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </AppAlertContext.Provider>
  );
}

/**
 * Hook returning the imperative `appAlert` function. Throws (in dev) if
 * called outside the provider — fail-loud beats silent no-op.
 */
export function useAppAlert(): AppAlertFn {
  const ctx = useContext(AppAlertContext);
  if (!ctx) {
    throw new Error('useAppAlert: must be used inside <AppAlertProvider>');
  }
  return ctx;
}

// ---------- ButtonRow ----------

type ButtonRowProps = {
  buttons: readonly AppAlertButton[];
  isDark: boolean;
  fgColor: string;
  onPress: (btn: AppAlertButton) => void;
};

function ButtonRow({ buttons, isDark, fgColor, onPress }: ButtonRowProps) {
  const stacked = buttons.length > 2;
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <View
      className={stacked ? 'flex-col' : 'flex-row'}
      style={{ gap: 8 }}
    >
      {buttons.map((btn) => {
        const style = btn.style ?? 'default';
        const isDestructive = style === 'destructive';
        const isCancel = style === 'cancel';
        const bg = isDestructive
          ? tokens.semantic.danger
          : isCancel
            ? 'transparent'
            : tokens.accent.dashboard;
        const textColor = isCancel ? fgColor : '#fff';

        return (
          <Pressable
            key={btn.text}
            accessibilityRole="button"
            accessibilityLabel={btn.text}
            onPress={() => onPress(btn)}
            style={{
              flex: stacked ? undefined : 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: bg,
              borderWidth: isCancel ? 1 : 0,
              borderColor: isCancel ? borderColor : undefined,
            }}
          >
            <Text
              className="font-sans-medium text-sm text-center"
              style={{ color: textColor }}
              numberOfLines={1}
            >
              {btn.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
