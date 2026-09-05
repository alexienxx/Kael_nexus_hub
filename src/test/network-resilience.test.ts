/**
 * network-resilience.test.ts
 *
 * Tests for useBackendLifecycle network resilience (cellular->WiFi recovery).
 * Covers the behaviors specified in the network-resilience-parity fix:
 *
 * A. connection.change while state=backend_unreachable -> schedules retry with warmup
 * B. manual reconnect (retry() no args) applies NETWORK_RECONNECT_WARMUP_MS warmup
 * C. superseded probe epoch does NOT overwrite state set by newer probe
 * D. online + connection.change + checkHealth OK -> stays online
 * E. online + connection.change + checkHealth KO -> retry with warmup
 * F. PROBE_TIMEOUT_MS = 6000 (behaviorally proven at t=16001ms)
 * G. degraded state retries automatically without UI or network events
 * H. automatic retry delay is exponential, jittered, and bounded
 * I. unmount cancels the degraded retry timer
 * J. repeated failures keep one bounded backoff chain
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  computeAutoRetryDelayMs,
  useBackendLifecycle,
} from "@/hooks/useBackendLifecycle";

// -- Mocks -------------------------------------------------------------------

vi.mock("@/lib/api/client", () => ({
  checkHealth: vi.fn(),
  probeAndResolveBackend: vi.fn(),
  probeHealthPayload: vi.fn(),
}));

import { checkHealth, probeAndResolveBackend, probeHealthPayload } from "@/lib/api/client";

const mockCheckHealth = vi.mocked(checkHealth);
const mockProbe = vi.mocked(probeAndResolveBackend);
const mockHealthPayload = vi.mocked(probeHealthPayload);

// -- Test helpers ------------------------------------------------------------

let mockConnection: EventTarget;

function setDeviceOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: online,
    writable: true,
    configurable: true,
  });
}

function setupMockConnection() {
  mockConnection = new EventTarget();
  Object.defineProperty(navigator, "connection", {
    value: mockConnection,
    writable: true,
    configurable: true,
  });
}

function fireConnectionChange() {
  mockConnection.dispatchEvent(new Event("change"));
}

// -- Lifecycle ---------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setDeviceOnline(true);
  setupMockConnection();
  // Defaults: health OK (prevents infinite online-recheck loop in tests),
  // probe fails (most tests start from degraded state), healthPayload blank.
  mockCheckHealth.mockResolvedValue(true);
  mockProbe.mockResolvedValue(null);
  mockHealthPayload.mockResolvedValue(null);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  // Clear all pending timers/intervals BEFORE restoring real timers.
  // This prevents the 45s online-recheck setInterval from bleeding across tests.
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// -- Timing constants (mirrored from hook, kept here for test readability) ---
const WARMUP_MS = 800;           // NETWORK_RECONNECT_WARMUP_MS
const MIN_ATTEMPT_MS = 1_200;    // minAttemptDurationMs for manual=true probes
const PROBE_DELAY_MS = 2_000;    // PROBE_RETRY_DELAY_MS between retry attempts
const PROBE_TIMEOUT_MS = 6_000;  // hook constant under test (was 4000)
const AUTO_RETRY_INITIAL_MS = 3_000;

// Total time for initial non-manual probe to exhaust 3 null results:
//   2 inter-attempt delays x 2000ms = 4000ms (each probe resolves instantly via microtask)
const INITIAL_EXHAUSTION_MS = PROBE_DELAY_MS * 2 + 100;

// Total time for a manual probe to complete on first-attempt success:
//   warmup (800ms) + minAttemptDuration (1200ms) + buffer
const MANUAL_SUCCESS_MS = WARMUP_MS + MIN_ATTEMPT_MS + 100;

// -- Tests -------------------------------------------------------------------

describe("network resilience -- useBackendLifecycle", () => {

  // A -----------------------------------------------------------------------

  it("A: connection.change while state=backend_unreachable -> schedules warmup+probe -> online", async () => {
    // Initial probe: 3 attempts all return null (resolves via microtask)
    // Inter-attempt delays: 2 x 2000ms -> advance 4100ms to exhaust
    const { result } = renderHook(() => useBackendLifecycle());
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_EXHAUSTION_MS); });
    expect(result.current.state).toBe("backend_unreachable");

    // Backend comes back up
    mockProbe.mockResolvedValue("http://192.168.0.1:8002");

    // Fire network topology change event
    await act(async () => { fireConnectionChange(); });

    // Assert: warmup pending -> no new probe yet, state still degraded
    const callsAfterEvent = mockProbe.mock.calls.length;
    expect(result.current.state).toBe("backend_unreachable");

    // Advance past warmup (800ms) + manual probe min-visible duration (1200ms)
    await act(async () => { await vi.advanceTimersByTimeAsync(MANUAL_SUCCESS_MS); });

    expect(mockProbe.mock.calls.length).toBeGreaterThan(callsAfterEvent);
    expect(result.current.state).toBe("online");
  });

  // B -----------------------------------------------------------------------

  it("B: retry() with no args applies warmup -- probe does NOT fire before 800ms", async () => {
    const { result } = renderHook(() => useBackendLifecycle());
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_EXHAUSTION_MS); });
    expect(result.current.state).toBe("backend_unreachable");

    mockProbe.mockResolvedValue("http://192.168.0.1:8002");
    const callsBefore = mockProbe.mock.calls.length;

    // retry() with no args -> withWarmup defaults to true
    await act(async () => { result.current.retry(); });

    // Warmup (800ms) not elapsed -> no new probe fired yet
    expect(mockProbe.mock.calls.length).toBe(callsBefore);
    expect(result.current.state).toBe("backend_unreachable");

    // Advance past warmup + probe success
    await act(async () => { await vi.advanceTimersByTimeAsync(MANUAL_SUCCESS_MS); });

    expect(mockProbe.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result.current.state).toBe("online");
  });

  // C -----------------------------------------------------------------------

  it("C: superseded epoch -- stale probe result does NOT overwrite state from newer probe", async () => {
    // epoch-1 probe: hangs indefinitely (never resolves) until 6s timeout fires
    // epoch-2 probe: resolves to URL immediately -> state = online
    // Stale probe fires at t=6000ms, epoch check prevents state overwrite
    mockProbe
      .mockImplementationOnce(() => new Promise(() => {}))  // epoch-1: stale/slow
      .mockResolvedValue("http://192.168.0.1:8002");         // epoch-2+: success

    const { result } = renderHook(() => useBackendLifecycle());

    // Let React effects settle -- epoch-1 probe is stuck awaiting mockProbe
    await act(async () => {});
    expect(result.current.state).toBe("checking");

    // Trigger epoch-2 probe with no warmup (deterministic in test)
    // Then advance: minAttemptDuration (1200ms) for new probe + epoch-1 timeout (6000ms)
    await act(async () => {
      result.current.retry({ withWarmup: false });
      await vi.advanceTimersByTimeAsync(MIN_ATTEMPT_MS + PROBE_TIMEOUT_MS + 500);
    });

    // epoch-2 completes at ~1200ms -> state=online
    // epoch-1 timeout fires at ~6000ms -> epoch check: 1 != 2 -> SUPERSEDED, no state write
    expect(result.current.state).toBe("online");
  });

  // D -----------------------------------------------------------------------

  it("D: online + connection.change + checkHealth OK -> stays online, no new probe", async () => {
    // checkHealth defaults to true in beforeEach
    mockProbe.mockResolvedValue("http://192.168.0.1:8002");

    const { result } = renderHook(() => useBackendLifecycle());
    // Non-manual probe resolves via microtask (no timer needed)
    await act(async () => {});
    await act(async () => {});
    expect(result.current.state).toBe("online");

    const probesBefore = mockProbe.mock.calls.length;

    // Fire connection change: checkHealth returns true -> no retry scheduled
    await act(async () => {
      fireConnectionChange();
      // Flush checkHealth().then() promise chain
      await Promise.resolve();
      await Promise.resolve();
    });

    // Health OK -> no warmup, no new probe, state unchanged
    expect(mockProbe.mock.calls.length).toBe(probesBefore);
    expect(result.current.state).toBe("online");
  });

  // E -----------------------------------------------------------------------

  it("E: online + connection.change + checkHealth KO -> retry with warmup -> re-probe", async () => {
    mockProbe.mockResolvedValue("http://192.168.0.1:8002");

    const { result } = renderHook(() => useBackendLifecycle());
    await act(async () => {});
    await act(async () => {});
    expect(result.current.state).toBe("online");

    // Override: next checkHealth() call (connection change handler) returns false
    mockCheckHealth.mockResolvedValueOnce(false);
    const probesBefore = mockProbe.mock.calls.length;

    // Fire connection change -> checkHealth KO -> warmup scheduled (800ms)
    await act(async () => {
      fireConnectionChange();
      // Flush checkHealth().then() microtask chain
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Before warmup: no new probe yet
    expect(mockProbe.mock.calls.length).toBe(probesBefore);

    // Advance past warmup + manual probe success
    await act(async () => { await vi.advanceTimersByTimeAsync(MANUAL_SUCCESS_MS); });

    expect(mockProbe.mock.calls.length).toBeGreaterThan(probesBefore);
    expect(result.current.state).toBe("online");
  });

  // F -----------------------------------------------------------------------

  it("F: PROBE_TIMEOUT_MS = 6000 -- at t=16001ms probe still running (4000ms would be done)", async () => {
    // Behavioral proof of 6000ms timeout:
    //   With 3 hanging attempts + 2x2000ms inter-attempt delays:
    //   6s timeout: total exhaustion = 3*6000 + 2*2000 = 22000ms
    //   4s timeout: total exhaustion = 3*4000 + 2*2000 = 16000ms
    //
    //   At t=16001ms:
    //     6000ms -> attempt 3 started at 16000ms, timeout at 22000ms -> still "checking" (PASS)
    //     4000ms -> all 3 done at 16000ms -> "backend_unreachable" (FAIL = timeout is wrong)
    mockProbe.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useBackendLifecycle());

    // Advance to 16001ms (= 4000ms*2*delays + 4000ms*3attempts + 1 = old exhaustion point)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS * 2 + PROBE_DELAY_MS * 2 + 1);
    });

    // 6000ms timeout: attempt 3 started at t=16000, still in flight -> "checking"
    // If this were "backend_unreachable", it would prove timeout <= 4000ms (bug)
    expect(result.current.state).toBe("checking");
  });

  // G -----------------------------------------------------------------------

  it("G: backend recovery is detected automatically without reconnect click or browser events", async () => {
    const { result } = renderHook(() => useBackendLifecycle());
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_EXHAUSTION_MS); });
    expect(result.current.state).toBe("backend_unreachable");

    const callsBeforeRecovery = mockProbe.mock.calls.length;
    mockProbe.mockResolvedValue("http://192.168.0.1:8002");

    // No retry(), online, visibilitychange, or connection.change event.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RETRY_INITIAL_MS + 100);
    });

    expect(mockProbe.mock.calls.length).toBeGreaterThan(callsBeforeRecovery);
    expect(result.current.state).toBe("online");
    expect(result.current.message).toBe("Connesso");
  });

  // H -----------------------------------------------------------------------

  it("H: automatic reconnect backoff grows exponentially with bounded jitter and cap", () => {
    expect(computeAutoRetryDelayMs(1, 0.5)).toBe(3_000);
    expect(computeAutoRetryDelayMs(2, 0.5)).toBe(6_000);
    expect(computeAutoRetryDelayMs(3, 0.5)).toBe(12_000);
    expect(computeAutoRetryDelayMs(1, 0)).toBe(2_400);
    expect(computeAutoRetryDelayMs(1, 1)).toBe(3_600);
    expect(computeAutoRetryDelayMs(99, 1)).toBe(30_000);
  });

  // I -----------------------------------------------------------------------

  it("I: unmount cancels automatic reconnect work", async () => {
    const { result, unmount } = renderHook(() => useBackendLifecycle());
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_EXHAUSTION_MS); });
    expect(result.current.state).toBe("backend_unreachable");

    const callsBeforeUnmount = mockProbe.mock.calls.length;
    unmount();
    mockProbe.mockResolvedValue("http://192.168.0.1:8002");

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mockProbe.mock.calls.length).toBe(callsBeforeUnmount);
  });

  // J -----------------------------------------------------------------------

  it("J: repeated automatic failures use the next delay instead of parallel timers", async () => {
    const { result } = renderHook(() => useBackendLifecycle());
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_EXHAUSTION_MS); });
    expect(result.current.state).toBe("backend_unreachable");
    expect(mockProbe).toHaveBeenCalledTimes(3);

    // First automatic retry fires after 3s and exhausts its three probes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RETRY_INITIAL_MS + INITIAL_EXHAUSTION_MS);
    });
    expect(result.current.state).toBe("backend_unreachable");
    expect(mockProbe).toHaveBeenCalledTimes(6);

    // Attempt 2 uses 6s: no early duplicate timer may fire.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockProbe).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(mockProbe.mock.calls.length).toBeGreaterThan(6);
  });

});
