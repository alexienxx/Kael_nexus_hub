/**
 * Native notification helper for Kael autonomous messages.
 *
 * Uses @capacitor/local-notifications to show Android-native notifications
 * (like WhatsApp/Telegram) when the app is backgrounded or closed.
 *
 * RULES:
 *   - Only autonomous messages trigger native notifications.
 *   - Normal chat responses do NOT trigger notifications.
 *   - When app is in foreground: use in-app toast (handled by AppShell).
 *   - When app is in background/hidden: fire native notification.
 *
 * Permissions are requested once at app boot via requestNotificationPermission().
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

/** Auto-incrementing notification ID (resets on app restart, that's fine). */
let _nextId = 1;

/**
 * Request notification permission from the OS.
 * Call once at app startup. On Android 13+ (API 33) this shows a system dialog.
 * On older Android versions, permission is granted by default.
 *
 * Safe to call on web (no-op).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const result = await LocalNotifications.requestPermissions();
    const granted = result.display === "granted";
    console.log("[NativeNotif] Permission:", granted ? "granted" : "denied");
    return granted;
  } catch (err) {
    console.warn("[NativeNotif] Permission request failed:", err);
    return false;
  }
}

/**
 * Check if notification permission is currently granted.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const result = await LocalNotifications.checkPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule a native notification for a Kael autonomous message.
 *
 * @param preview - Short preview text for the notification body.
 * @param title  - Notification title (defaults to "Kael").
 */
export async function showAutonomousNotification(
  preview: string,
  title: string = "Kael",
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const id = _nextId++;

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body: preview || "Nuovo messaggio da Kael",
          // Show immediately
          schedule: { at: new Date(Date.now() + 100) },
          // Small icon uses the app icon by default on Android
          smallIcon: "ic_launcher",
          // Sound — use default system notification sound
          sound: undefined,
          // Android notification channel (created automatically by Capacitor)
          channelId: "kael_autonomous",
          // Tap opens the app
          actionTypeId: "",
          extra: { type: "autonomous_message" },
        },
      ],
    });

    console.log("[NativeNotif] Scheduled notification #" + id);
  } catch (err) {
    console.warn("[NativeNotif] Failed to schedule notification:", err);
  }
}

/**
 * Create a dedicated notification channel for Kael autonomous messages.
 * Android 8+ requires channels. Call once at app boot.
 *
 * Safe to call on web (no-op) and on older Android (no-op).
 */
export async function createNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: "kael_autonomous",
      name: "Messaggi di Kael",
      description: "Messaggi autonomi inviati da Kael quando non stai usando l'app",
      importance: 4, // HIGH — shows heads-up notification
      visibility: 1, // PUBLIC
      sound: "default",
      vibration: true,
    });
    console.log("[NativeNotif] Channel 'kael_autonomous' created");
  } catch (err) {
    // Channel may already exist — that's fine
    console.log("[NativeNotif] Channel setup:", err);
  }
}

/**
 * Initialize the native notification system.
 * Call once at app startup (e.g., in App.tsx or AppShell).
 *
 * Creates the notification channel and requests permission.
 */
export async function initNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await createNotificationChannel();
  await requestNotificationPermission();

  // Listen for notification taps to bring user to chat
  LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    console.log("[NativeNotif] Tap:", action.notification.extra);
    // The app will naturally open to the last page.
    // If we want to force navigate to chat, we dispatch a DOM event.
    window.dispatchEvent(
      new CustomEvent("kael-notification-tap", { detail: action.notification.extra }),
    );
  });
}
