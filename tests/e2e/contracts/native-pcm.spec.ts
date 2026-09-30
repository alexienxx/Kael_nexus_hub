import { expect, test } from "@playwright/test";

test.describe("native PCM browser boundary", () => {
  test("completes one framed delivery, releases ownership, and stops the next immediately", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click({ position: { x: 2, y: 2 } });

    const result = await page.evaluate(async () => {
      const { NativePcmPlayer } = await import("/src/lib/audio/nativePcmPlayer.ts");
      const reports: Array<{ status: string; played_sample_boundary: number; discontinuity: boolean }> = [];

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

      const second = await NativePcmPlayer.open(
        {
          deliveryId: "delivery-browser-2",
          utteranceId: "utterance-browser-2",
          epoch: 2,
          speechPlanSha256: "b".repeat(64),
        },
        (report) => { reports.push(report); },
      );
      const interrupted = await second.stop();
      await second.receiptDelivery;
      await second.closed;

      return { completed, interrupted, reports };
    });

    expect(result.completed).toMatchObject({
      status: "completed",
      played_sample_boundary: 2400,
      measurement_method: "audio_worklet_render_quantum",
    });
    expect(result.interrupted).toMatchObject({
      status: "interrupted",
      discontinuity: true,
      measurement_method: "audio_worklet_render_quantum",
    });
    expect(result.reports.some((report) => report.status === "completed")).toBe(true);
    expect(result.reports.some((report) => report.status === "interrupted")).toBe(true);
  });
});
