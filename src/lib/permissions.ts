/**
 * Runtime permission helpers for Android.
 *
 * Wraps Web APIs that trigger the native Android permission dialog
 * when accessing microphone, camera, or location. Should be called
 * BEFORE the feature that needs the permission, at first use.
 *
 * On web (non-Android), these are no-ops that return true.
 */

import { Capacitor } from "@capacitor/core";

/**
 * Request microphone permission by attempting a brief getUserMedia({ audio }).
 * On Android, this triggers the native permission dialog if not yet granted.
 * Returns true if permission was granted, false otherwise.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Got access — immediately release the stream
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    console.warn("[Permissions] Microphone permission denied or unavailable");
    return false;
  }
}

/**
 * Request camera permission by attempting a brief getUserMedia({ video }).
 * On Android, this triggers the native permission dialog if not yet granted.
 * Returns true if permission was granted, false otherwise.
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    console.warn("[Permissions] Camera permission denied or unavailable");
    return false;
  }
}

/**
 * Request location permission via the Geolocation API.
 * On Android, this triggers the native permission dialog if not yet granted.
 * Returns true if permission was granted, false otherwise.
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (!("geolocation" in navigator)) return false;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => {
        console.warn("[Permissions] Location permission denied or unavailable");
        resolve(false);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

/**
 * Check if we're on a native platform (Android/iOS).
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
