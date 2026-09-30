import { expect, test } from "@playwright/test";

test.describe("native PCM browser boundary", () => {
  test("completes one framed delivery, releases ownership, and stops the next immediately", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click({ position: { x: 2, y: 2 } });

    const result = await page.evaluate(async () => {
      const { NativePcmPlayer } = await import("/src/lib/audio/nativePcmPlayer.ts");
      type Report = {
        sequence: number;
        status: string;
        played_sample_boundary: number;
        measured_at: string;
        discontinuity: boolean;
        schema_version: string;
        timing_method: string;
        player_open_to_first_frame_ms: number | null;
        player_open_to_first_quantum_ms: number | null;
        stop_to_local_mute_command_ms: number | null;
        stop_to_worklet_ack_ms: number | null;
      };
      const reports: Report[] = [];

      const first = await NativePcmPlayer.open(
        {
          deliveryId: "delivery-browser-1",
          utteranceId: "utterance-browser-1",
          epoch: 1,
          speechPlanSha256: "a".repeat(64),
        },
        (report) => { reports.push(report); },
      );
      const samples = new Int16Array(2400);
      for (let index = 0; index < samples.length; index++) {
        samples[index] = Math.round(Math.sin(index / 12) * 1200);
      }
      await first.feed({
        utteranceId: "utterance-browser-1",
        epoch: 1,
        sequence: 0,
        sampleStart: 0,
        pcmS16le: samples.buffer,
      });
      const completed = await first.finish(2400);
      await first.receiptDelivery;
      await first.closed;
      const completedReports = reports.slice();

      const second = await NativePcmPlayer.open(
        {
          deliveryId: "delivery-browser-2",
          utteranceId: "utterance-browser-2",
          epoch: 2,
          speechPlanSha256: "b".repeat(64),
        },
        (report) => { reports.push(report); },
      );
      const stopStartedAt = performance.now();
      const interrupted = await second.stop();
      const stopResolvedMs = performance.now() - stopStartedAt;
      await second.receiptDelivery;
      await second.closed;
      const interruptedReports = reports.slice(completedReports.length);

      return {
        completed,
        interrupted,
        completedReports,
        interruptedReports,
        stopResolvedMs,
      };
    });

    expect(result.completed).toMatchObject({
      status: "completed",
      played_sample_boundary: 2400,
      measurement_method: "audio_worklet_render_quantum",
      schema_version: "arrakis.playout-report.v2",
      timing_method: "client_performance_now",
      stop_to_local_mute_command_ms: null,
      stop_to_worklet_ack_ms: null,
    });
    const firstQuantum = result.completedReports[0];
    expect(firstQuantum).toMatchObject({
      status: "playing",
      played_sample_boundary: 128,
      discontinuity: false,
      schema_version: "arrakis.playout-report.v2",
      timing_method: "client_performance_now",
      stop_to_local_mute_command_ms: null,
      stop_to_worklet_ack_ms: null,
    });
    expect(firstQuantum.player_open_to_first_frame_ms).not.toBeNull();
    expect(firstQuantum.player_open_to_first_quantum_ms).not.toBeNull();
    expect(firstQuantum.player_open_to_first_frame_ms!).toBeGreaterThanOrEqual(0);
    expect(firstQuantum.player_open_to_first_quantum_ms!).toBeGreaterThanOrEqual(
      firstQuantum.player_open_to_first_frame_ms!,
    );
    expect(firstQuantum.player_open_to_first_quantum_ms!).toBeLessThan(10_000);
    expect(result.completed.player_open_to_first_frame_ms).toBe(
      firstQuantum.player_open_to_first_frame_ms,
    );
    expect(result.completed.player_open_to_first_quantum_ms).toBe(
      firstQuantum.player_open_to_first_quantum_ms,
    );
    expect(result.completedReports).toHaveLength(2);
    expect(result.completedReports.map((report) => report.sequence)).toEqual([0, 1]);
    expect(result.completedReports.at(-1)).toEqual(result.completed);
    expect(Date.parse(result.completed.measured_at)).toBeGreaterThanOrEqual(
      Date.parse(firstQuantum.measured_at),
    );
    expect(result.interrupted).toMatchObject({
      status: "interrupted",
      discontinuity: true,
      measurement_method: "audio_worklet_render_quantum",
      schema_version: "arrakis.playout-report.v2",
      timing_method: "client_performance_now",
      player_open_to_first_frame_ms: null,
      player_open_to_first_quantum_ms: null,
    });
    expect(result.interruptedReports).toHaveLength(1);
    expect(result.interruptedReports[0]).toEqual(result.interrupted);
    expect(result.interrupted.sequence).toBe(0);
    expect(result.interrupted.stop_to_local_mute_command_ms).not.toBeNull();
    expect(result.interrupted.stop_to_worklet_ack_ms).not.toBeNull();
    expect(result.interrupted.stop_to_local_mute_command_ms!).toBeGreaterThanOrEqual(0);
    expect(result.interrupted.stop_to_worklet_ack_ms!).toBeGreaterThanOrEqual(
      result.interrupted.stop_to_local_mute_command_ms!,
    );
    expect(result.interrupted.stop_to_worklet_ack_ms!).toBeLessThanOrEqual(1000);
    expect(result.stopResolvedMs).toBeGreaterThanOrEqual(
      result.interrupted.stop_to_worklet_ack_ms!,
    );
    expect(result.stopResolvedMs).toBeLessThan(1500);
  });
});
