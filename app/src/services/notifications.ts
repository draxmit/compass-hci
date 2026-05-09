import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Wrapper around `expo-notifications` for local notifications. We only
 * use ON-DEVICE scheduling here — no FCM, no APNs, no Cloud Functions.
 * That keeps Compass on the Spark plan and avoids the iOS APNs key
 * setup pain. Trade-off: notifications can't fire when the app has
 * been force-killed for >24h on Android (the system-side reminder
 * registry expires); for class-demo scenarios this is fine.
 *
 * Web is a no-op — Push API + service worker setup is out of scope
 * for v3 launch. The service exposes a `supported` flag so callers
 * can hide the Settings UI on platforms that can't honour it.
 *
 * Native crash defence: every native call is wrapped in try/catch
 * because dev-client APKs built BEFORE `expo-notifications` was
 * added to the app are missing the native module entirely. Calling
 * into the missing module throws "cannot find native module
 * ExpoPushTokenManager" which cascades into a render error. The
 * defensive wrappers degrade to a silent no-op — same behaviour as
 * web — until the user rebuilds the dev client.
 */

/**
 * `true` when local notifications might work on the current platform.
 * Web returns `false`; iOS / Android both return `true` even though
 * the dev client APK might still be missing the native module — the
 * try/catch in each function handles that gracefully.
 */
export const notificationsSupported = Platform.OS !== 'web';

/**
 * Foreground behaviour: even when the app is open, surface scheduled
 * notifications as a banner + sound. Without this, scheduled
 * notifications silently fire and the user only sees them when they
 * pull down the tray (confusing during demo scenarios).
 *
 * Set once at module load. Safe to call on web — the package no-ops.
 * Wrapped in try/catch so a missing native module on a stale dev
 * client doesn't crash the app at boot.
 */
if (notificationsSupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (err) {
    console.warn('[notifications] setNotificationHandler failed (rebuild dev client?):', err);
  }
}

/**
 * Request OS permission to display notifications. iOS shows a system
 * prompt the first time; Android 13+ also requires runtime permission
 * (handled by expo-notifications under the hood).
 *
 * Returns `true` if permission is granted, `false` otherwise. Caller
 * should surface the negative result with a friendly message and a
 * link to Settings → Notifications for the user to flip it manually.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('[notifications] permission check failed:', err);
    return false;
  }
}

/**
 * Cancel every notification we've scheduled. Used when:
 *   - User flips ALL notification toggles off
 *   - User signs out (we don't want a stale reminder firing on the
 *     next user's device)
 */
export async function cancelAllScheduled(): Promise<void> {
  if (!notificationsSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[notifications] cancelAllScheduled failed:', err);
  }
}

/**
 * Cancel notifications matching a specific category prefix in their
 * identifier. We use prefixes ('daily:', 'budget:', 'goal:') so the
 * scheduler can rebuild one category without nuking the others.
 */
export async function cancelByPrefix(prefix: string): Promise<void> {
  if (!notificationsSupported) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith(prefix)) {
        try {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        } catch {
          /* per-id failure is non-fatal */
        }
      }
    }
  } catch (err) {
    console.warn('[notifications] cancelByPrefix failed:', err);
  }
}

/**
 * Schedule a daily notification at `HH:MM` local time. Passes `repeats:
 * true` so the trigger re-arms every 24h without us having to manually
 * reschedule.
 */
export async function scheduleDaily(
  identifier: string,
  hh: number,
  mm: number,
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsSupported) return;
  try {
    // Cancel any existing daily reminder with this id before scheduling
    // a fresh one — `expo-notifications` allows duplicate ids and would
    // silently double-fire otherwise.
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      /* not previously scheduled — fine */
    }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hh,
        minute: mm,
      },
    });
  } catch (err) {
    console.warn('[notifications] scheduleDaily failed:', err);
  }
}

/**
 * Schedule a one-shot notification at a specific date/time. Used for
 * goal-deadline reminders ("3 days until Lebaran 2027").
 */
export async function scheduleAtDate(
  identifier: string,
  date: Date,
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsSupported) return;
  if (date.getTime() < Date.now()) return; // past — skip
  try {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      /* fine */
    }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
  } catch (err) {
    console.warn('[notifications] scheduleAtDate failed:', err);
  }
}

/**
 * Fire an immediate notification ("you just hit 80% of your transport
 * budget"). No trigger means it shows right away.
 */
export async function fireImmediate(
  identifier: string,
  title: string,
  body: string,
): Promise<void> {
  if (!notificationsSupported) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: 'default' },
      trigger: null, // immediate
    });
  } catch (err) {
    console.warn('[notifications] fireImmediate failed:', err);
  }
}
