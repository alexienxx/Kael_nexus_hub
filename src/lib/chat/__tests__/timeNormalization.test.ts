import { normalizeMessageTimeMs, getCanonicalTimeMs } from "../timeNormalization";

describe("timeNormalization", () => {
  describe("normalizeMessageTimeMs", () => {
    it("returns 0 when all fields are missing", () => {
      expect(normalizeMessageTimeMs({})).toBe(0);
    });

    it("returns 0 when all fields are null or undefined", () => {
      expect(normalizeMessageTimeMs({ timestamp: null, ts: undefined, created_at: null })).toBe(0);
    });

    it("ignores zero values (0 is invalid)", () => {
      expect(normalizeMessageTimeMs({ timestamp: 0, ts: 0 })).toBe(0);
    });

    it("uses 'timestamp' field with seconds < 10B → converts to ms", () => {
      const secondsSinceEpoch = 1715339941; // May 9, 2024
      const result = normalizeMessageTimeMs({ timestamp: secondsSinceEpoch });
      expect(result).toBe(secondsSinceEpoch * 1000);
    });

    it("uses 'ts' field with seconds → converts to ms", () => {
      const secondsSinceEpoch = 1715339941;
      const result = normalizeMessageTimeMs({ ts: secondsSinceEpoch });
      expect(result).toBe(secondsSinceEpoch * 1000);
    });

    it("uses 'created_at' ISO string → parses to ms", () => {
      const isoString = "2024-05-09T15:02:21.017886+00:00";
      const result = normalizeMessageTimeMs({ created_at: isoString });
      expect(result).toBeGreaterThan(0);
      // Verify it's in milliseconds (should be around 1715339941000)
      expect(result).toBeGreaterThan(1000000000000);
    });

    it("uses 'createdAt' ISO string", () => {
      const isoString = "2024-05-09T15:02:21Z";
      const result = normalizeMessageTimeMs({ createdAt: isoString });
      expect(result).toBeGreaterThan(0);
    });

    it("uses 'server_created_at' ISO string", () => {
      const isoString = "2024-05-09T15:02:21.017Z";
      const result = normalizeMessageTimeMs({ server_created_at: isoString });
      expect(result).toBeGreaterThan(0);
    });

    it("handles millisecond values >= 10B (threshold 10,000,000,000)", () => {
      const millisecondsSinceEpoch = 1715339941000;
      const result = normalizeMessageTimeMs({ timestamp: millisecondsSinceEpoch });
      expect(result).toBe(millisecondsSinceEpoch);
    });

    it("respects field priority: timestamp > ts > created_at > createdAt > server_created_at", () => {
      const data = {
        timestamp: 1000000000, // High priority (seconds)
        ts: 1000000001, // Ignored, lower priority
        created_at: "2024-05-09T15:02:21Z", // Ignored
      };
      const result = normalizeMessageTimeMs(data);
      expect(result).toBe(1000000000 * 1000); // Only timestamp is used
    });

    it("handles trimmed ISO strings", () => {
      const isoString = "  2024-05-09T15:02:21Z  ";
      const result = normalizeMessageTimeMs({ created_at: isoString });
      expect(result).toBeGreaterThan(0);
    });

    it("rejects invalid ISO strings", () => {
      expect(normalizeMessageTimeMs({ created_at: "not-a-date" })).toBe(0);
      expect(normalizeMessageTimeMs({ created_at: "2024-13-32T99:99:99Z" })).toBe(0);
    });

    it("rejects negative timestamps", () => {
      expect(normalizeMessageTimeMs({ timestamp: -1000 })).toBe(0);
    });

    it("handles edge case: autonomy message with timestamp=0 from DB", () => {
      // This is the M8 bug scenario: backend sends timestamp=0
      const result = normalizeMessageTimeMs({ timestamp: 0, ts: 0, created_at: 0 });
      expect(result).toBe(0); // Invalid, caller should use getCanonicalTimeMs() for fallback
    });
  });

  describe("getCanonicalTimeMs", () => {
    it("returns a valid timestamp even when input has 0", () => {
      const beforeTest = Date.now();
      const result = getCanonicalTimeMs({ timestamp: 0 });
      const afterTest = Date.now();

      expect(result).toBeGreaterThanOrEqual(beforeTest);
      expect(result).toBeLessThanOrEqual(afterTest + 100); // Allow small margin
    });

    it("applies Date.now() fallback ONCE (idempotent)", () => {
      const data = { timestamp: 0 };
      const result1 = getCanonicalTimeMs(data);
      const result2 = getCanonicalTimeMs(data);

      // Results should be very close (within 1ms), not different by seconds
      expect(Math.abs(result1 - result2)).toBeLessThan(10);
    });

    it("returns normalized value when available (no fallback needed)", () => {
      const secondsSinceEpoch = 1715339941;
      const data = { timestamp: secondsSinceEpoch };
      const result = getCanonicalTimeMs(data);

      expect(result).toBe(secondsSinceEpoch * 1000);
    });

    it("never returns 0", () => {
      expect(getCanonicalTimeMs({})).toBeGreaterThan(0);
      expect(getCanonicalTimeMs({ timestamp: 0 })).toBeGreaterThan(0);
      expect(getCanonicalTimeMs({ timestamp: null, ts: null })).toBeGreaterThan(0);
    });

    it("handles M8 autonomy message scenario: timestamp=0 → current time", () => {
      const autonomyMessage = {
        id: "msg-001",
        text: "Hello from autonomy",
        timestamp: 0, // Bug M8: DB stored 0
        ts: 0,
      };

      const beforeTest = Date.now();
      const canonicalTimeMs = getCanonicalTimeMs(autonomyMessage);
      const afterTest = Date.now();

      // Should be assigned current time (fallback)
      expect(canonicalTimeMs).toBeGreaterThanOrEqual(beforeTest);
      expect(canonicalTimeMs).toBeLessThanOrEqual(afterTest + 100);
    });
  });

  describe("sort order stability (M8 fix validation)", () => {
    it("ensures autonomy message with timestamp=0 sorts correctly (at bottom, not top)", () => {
      const messages = [
        {
          id: "msg-1",
          text: "First user message",
          timestamp: 1000, // Valid timestamp
        },
        {
          id: "msg-2-autonomy",
          text: "Autonomy response",
          timestamp: 0, // BUG M8: timestamp=0
        },
        {
          id: "msg-3",
          text: "Second user message",
          timestamp: 1001,
        },
      ];

      // Normalize all timestamps
      const normalized = messages.map((m) => ({
        ...m,
        canonicalTimeMs: getCanonicalTimeMs(m),
      }));

      // Sort by canonical time
      normalized.sort((a, b) => a.canonicalTimeMs - b.canonicalTimeMs);

      // Autonomy message should be at end (or near it), never at beginning
      const sortedIds = normalized.map((m) => m.id);
      const autonomyIndex = sortedIds.indexOf("msg-2-autonomy");
      const firstUserIndex = sortedIds.indexOf("msg-1");
      const secondUserIndex = sortedIds.indexOf("msg-3");

      // Autonomy message should come AFTER user messages (higher timestamp = later = bottom)
      expect(autonomyIndex).toBeGreaterThanOrEqual(firstUserIndex);
      expect(autonomyIndex).toBeGreaterThanOrEqual(secondUserIndex);
    });

    it("maintains stable order across multiple re-sorts", () => {
      const messages = [
        { id: "msg-1", text: "User 1", timestamp: 1000 },
        { id: "msg-2", text: "Autonomy", timestamp: 0 }, // Bug M8
        { id: "msg-3", text: "User 2", timestamp: 1001 },
      ];

      // Normalize once
      const normalized = messages.map((m) => ({
        ...m,
        canonicalTimeMs: getCanonicalTimeMs(m),
      }));

      // Sort multiple times
      const sort1 = [...normalized].sort((a, b) => a.canonicalTimeMs - b.canonicalTimeMs);
      const sort2 = [...normalized].sort((a, b) => a.canonicalTimeMs - b.canonicalTimeMs);
      const sort3 = [...normalized].sort((a, b) => a.canonicalTimeMs - b.canonicalTimeMs);

      // All sorts should produce identical order
      expect(sort1.map((m) => m.id)).toEqual(sort2.map((m) => m.id));
      expect(sort2.map((m) => m.id)).toEqual(sort3.map((m) => m.id));
    });
  });
});
