/**
 * Timestamp normalization and validation for chat messages.
 *
 * Ensures consistent millisecond-based timestamps across all message sources
 * (backend DB fields, ISO strings, local optimistic sends).
 *
 * Key rule: Normalization happens ONCE at message ingestion time,
 * never again during sort/merge. This guarantees stable ordering.
 */

/**
 * Normalize any message time field to milliseconds (stable).
 *
 * Supports:
 * - timestamp (number, seconds or ms)
 * - ts (number, seconds or ms)
 * - created_at (ISO string or number)
 * - createdAt (ISO string or number)
 * - server_created_at (ISO string or number)
 *
 * @param data - Object containing potential time fields
 * @returns Milliseconds since epoch, or 0 if invalid/missing
 *
 * Rules:
 * - If number < 10_000_000_000 → treat as seconds, convert to ms
 * - If number >= 10_000_000_000 → treat as ms
 * - If string (ISO) → Date.parse()
 * - If 0 or falsy → return 0 (invalid, caller must use fallback)
 */
export function normalizeMessageTimeMs(data: Record<string, unknown>): number {
  // Priority order of fields to check
  const fields = ["timestamp", "ts", "created_at", "createdAt", "server_created_at"];

  for (const field of fields) {
    const value = data[field];

    if (value === null || value === undefined) continue;

    if (typeof value === "number") {
      // Empty or negative timestamps are invalid
      if (value <= 0) continue;

      // Seconds vs milliseconds: threshold is 10 billion (Sep 2286 in seconds)
      if (value < 10_000_000_000) {
        // Seconds: convert to ms
        return Math.round(value * 1000);
      } else {
        // Already in milliseconds
        return Math.round(value);
      }
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;

      // Try ISO parsing
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  // No valid time found
  return 0;
}

/**
 * Stable timestamp for a message.
 *
 * Returns the canonical time in milliseconds:
 * - Normalizes from any field with normalizeMessageTimeMs()
 * - If result is 0 (invalid), uses current time as fallback (ONCE)
 * - Stores as canonicalTimeMs in the message
 *
 * @param data - Message data object
 * @returns Canonical timestamp in milliseconds (never 0)
 */
export function getCanonicalTimeMs(data: Record<string, unknown>): number {
  let timeMs = normalizeMessageTimeMs(data);

  // Fallback: if no valid timestamp found, use current time
  // This is assigned ONCE at ingestion and never called again during sort
  if (timeMs === 0) {
    timeMs = Date.now();
  }

  return timeMs;
}
