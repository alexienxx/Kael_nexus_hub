import { useEffect } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import {
  PushNotifications,
  type PushNotificationSchema,
} from "@capacitor/push-notifications";
import {
  fetchMobilePushStatus,
  registerMobilePushDevice,
} from "@/lib/api/push";

const INSTALLATION_KEY = "kael-mobile-installation-id";

function installationId(): string {
  const existing = localStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `kael-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(INSTALLATION_KEY, generated);
  return generated;
}

function signalDurableTimeline(notification: PushNotificationSchema): void {
  const rawTurnId = notification.data?.turn_id;
  const turnId = Number(rawTurnId);
  window.dispatchEvent(
    new CustomEvent("kael-new-message", {
      detail: {
        turn_id: Number.isSafeInteger(turnId) ? turnId : undefined,
        source: notification.data?.source ?? "autonomy_loop",
        delivery: "native_push",
      },
    }),
  );
}

/**
 * Registers this Android installation with the backend FCM outbox.
 * The hook is inert on web and while the backend is offline.
 */
export function useNativePush(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;
    // Both halves must be configured deliberately. Without Android Firebase
    // resources the native plugin can crash on its own HandlerThread before a
    // JavaScript try/catch can run.
    if (import.meta.env.VITE_KAEL_FIREBASE_PUSH_ENABLED !== "true") {
      console.warn(
        "[NativePush] This APK was built without Firebase push; plugin remains inert",
      );
      return;
    }

    let disposed = false;
    const handles: PluginListenerHandle[] = [];

    const addHandle = async (
      promise: Promise<PluginListenerHandle>,
    ): Promise<void> => {
      const handle = await promise;
      if (disposed) {
        await handle.remove();
      } else {
        handles.push(handle);
      }
    };

    const setup = async () => {
      // The native plugin throws on its own HandlerThread when Firebase has
      // no Android resources, so a JavaScript try/catch cannot contain it.
      // Check backend capability truth before invoking any plugin method.
      const capability = await fetchMobilePushStatus();
      if (!capability.configured) {
        console.warn("[NativePush] Firebase is not configured; plugin remains inert");
        return;
      }

      await addHandle(
        PushNotifications.addListener("registration", async ({ value }) => {
          try {
            const app = await CapacitorApp.getInfo();
            await registerMobilePushDevice({
              installation_id: installationId(),
              token: value,
              platform: "android",
              app_version: `${app.version} (${app.build})`,
            });
          } catch (error) {
            console.warn(
              "[NativePush] Device registration failed:",
              error instanceof Error ? error.message : "unknown error",
            );
          }
        }),
      );

      await addHandle(
        PushNotifications.addListener("registrationError", (error) => {
          console.warn("[NativePush] FCM registration unavailable:", error.error);
        }),
      );

      await addHandle(
        PushNotifications.addListener(
          "pushNotificationReceived",
          signalDurableTimeline,
        ),
      );

      await addHandle(
        PushNotifications.addListener(
          "pushNotificationActionPerformed",
          ({ notification }) => {
            signalDurableTimeline(notification);
            window.dispatchEvent(
              new CustomEvent("kael-notification-tap", {
                detail: notification.data,
              }),
            );
          },
        ),
      );

      const current = await PushNotifications.checkPermissions();
      const permission =
        current.receive === "prompt" || current.receive === "prompt-with-rationale"
          ? await PushNotifications.requestPermissions()
          : current;
      if (permission.receive !== "granted") {
        console.warn("[NativePush] Notification permission denied");
        return;
      }
      await PushNotifications.register();
    };

    setup().catch((error) => {
      console.warn(
        "[NativePush] Initialization failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    });

    return () => {
      disposed = true;
      for (const handle of handles) void handle.remove();
    };
  }, [enabled]);
}
