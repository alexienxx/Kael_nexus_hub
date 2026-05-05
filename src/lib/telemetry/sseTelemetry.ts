/**
 * FASE 4 D3 — Minimal client-side SSE/resume telemetry.
 *
 * Lightweight structured console logger for diagnostics. No new UI.
 * No backend calls (yet). Single source of truth for resume/pending
 * tracing on the APK. Each event is a single console line tagged
 * `[KaelTelemetry]` so logcat / chrome://inspect filtering is trivial.
 *
 * Events:
 *   - sse.forceReconnect       { reason }
 *   - sse.visibilitychange     { state }
 *   - softResync.started       { afterTs }
 *   - softResync.merged        { received, appended }
 *   - softResync.failed        { error }
 *
 * Contract: metadata-only. NEVER log raw user text or message bodies.
 * Keep payloads small (numbers, booleans, short enums, error names).
 */

type TelemetryEvent =
  | "sse.forceReconnect"
  | "sse.visibilitychange"
  | "softResync.started"
  | "softResync.merged"
  | "softResync.failed";

export function emitTelemetry(event: TelemetryEvent, payload: Record<string, unknown> = {}): void {
  try {
    const entry = {
      t: Date.now(),
      ev: event,
      ...payload,
    };
    // Single-line JSON-ish — easy to grep / filter in logcat & chrome devtools.
    console.log(`[KaelTelemetry] ${event}`, entry);
  } catch {
    // Telemetry must never throw.
  }
}
