/** Presentation lease only; expiry says unknown, never completed/delivered. */
export const GENERATION_HINT_MAX_AGE_MS = 90_000;
export function generationHint(value: unknown): { activity_id: string; active: boolean; ts: number } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.surface !== "human_chat" || typeof v.active !== "boolean"
    || typeof v.activity_id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v.activity_id)
    || typeof v.ts !== "number" || !Number.isFinite(v.ts)) return null;
  return { activity_id: v.activity_id, active: v.active, ts: v.ts };
}

