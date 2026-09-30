import { expect, test, type Page } from "@playwright/test";

const SPEECH_PLAN_SHA256 = "a".repeat(64);

async function requireAudioWorklet(page: Page): Promise<void> {
  const supported = await page.evaluate(() => (
    typeof AudioContext === "function" &&
    typeof AudioWorkletNode === "function" &&
    "audioWorklet" in AudioContext.prototype
  ));
  test.skip(!supported, "This Chromium runtime does not expose AudioWorklet");
}

async function installPlayerCase(
  page: Page,
  stopContext: { interruptionOrigin: string; echoCancellationReported: boolean | null },
  conflictingContext: { interruptionOrigin: string; echoCancellationReported: boolean | null },
  invalidContext?: { interruptionOrigin: string; echoCancellationReported: boolean | null },
): Promise<{
  report: Record<string, unknown>;
  deliveredReport: Record<string, unknown>;
  reportFrozen: boolean;
  invalidError: string | null;
  conflictError: string | null;
}> {
  await page.evaluate(async ({ stopContext, conflictingContext, invalidContext }) => {
    const module = await import("/src/lib/audio/nativePcmPlayer.ts");
    const button = document.createElement("button");
    button.id = "open-audio-player";
    button.textContent = "open audio player";
    document.body.appendChild(button);
    (window as any).__audioPlayerResult = new Promise((resolve, reject) => {
      button.onclick = () => {
        void (async () => {
          const delivered: Record<string, unknown>[] = [];
          const player = await module.NativePcmPlayer.open({
            deliveryId: "delivery-worklet",
            utteranceId: "utterance-worklet",
            epoch: 7,
            speechPlanSha256: "a".repeat(64),
          }, (report) => { delivered.push(report as unknown as Record<string, unknown>); });
          let invalidError: string | null = null;
          if (invalidContext) {
            try {
              player.stop(invalidContext as any);
            } catch (error) {
              invalidError = error instanceof Error ? error.message : String(error);
            }
          }
          const terminal = player.stop(stopContext as any);
          let conflictError: string | null = null;
          try {
            player.stop(conflictingContext as any);
          } catch (error) {
            conflictError = error instanceof Error ? error.message : String(error);
          }
          const report = await terminal;
          await player.receiptDelivery;
          await player.closed;
          return {
            report,
            deliveredReport: delivered[delivered.length - 1],
            reportFrozen: Object.isFrozen(report),
            invalidError,
            conflictError,
          };
        })().then(resolve, reject);
      };
    });
  }, { stopContext, conflictingContext, invalidContext });

  await page.click("#open-audio-player");
  const result = await page.evaluate(() => (window as any).__audioPlayerResult);
  await page.locator("#open-audio-player").evaluate((element) => element.remove());
  return result;
}

test.describe("native AudioWorklet playout contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await requireAudioWorklet(page);
  });

  test("emits immutable v3 manual interruption provenance from a real Worklet acknowledgement", async ({ page }) => {
    const result = await installPlayerCase(
      page,
      { interruptionOrigin: "manual", echoCancellationReported: false },
      { interruptionOrigin: "call_end", echoCancellationReported: false },
    );

    expect(result.invalidError).toBeNull();
    expect(result.conflictError).toBe("AUDIO_PLAYER_STOP_CONTEXT_CONFLICT");
    expect(result.reportFrozen).toBe(true);
    expect(result.report).toMatchObject({
      schema_version: "arrakis.playout-report.v3",
      status: "interrupted",
      measurement_method: "audio_worklet_render_quantum",
      interruption_origin: "manual",
      echo_cancellation_reported: false,
    });
    expect(result.deliveredReport).toEqual(result.report);
  });

  test("accepts acoustic barge-in only with reported AEC true and preserves that cause", async ({ page }) => {
    const result = await installPlayerCase(
      page,
      { interruptionOrigin: "acoustic_barge_in", echoCancellationReported: true },
      { interruptionOrigin: "manual", echoCancellationReported: true },
      { interruptionOrigin: "acoustic_barge_in", echoCancellationReported: false },
    );

    expect(result.invalidError).toBe("AUDIO_PLAYER_STOP_CONTEXT_INVALID");
    expect(result.conflictError).toBe("AUDIO_PLAYER_STOP_CONTEXT_CONFLICT");
    expect(result.report).toMatchObject({
      schema_version: "arrakis.playout-report.v3",
      status: "interrupted",
      interruption_origin: "acoustic_barge_in",
      echo_cancellation_reported: true,
    });
  });
});
