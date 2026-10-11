import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { rolldown } from "rolldown";

// Direct production store in Chromium's real IndexedDB, isolated browser context.
// No dev server, backend, transport interception or fake IndexedDB. This proves
// transaction ordering/reopen only, not Android or delivery to Arrakis.
test("defer/claim atomicity and persistence on native IndexedDB", async () => {
  const bundle = await rolldown({ input: resolve("src/lib/chat/durableExchangeStore.ts") });
  const { output } = await bundle.generate({ format: "iife", name: "StoreContract" });
  await bundle.close();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const localDocument = pathToFileURL(resolve("README.md")).href;
    await page.goto(localDocument);
    await page.addScriptTag({ content: output[0].code });
    const result = await page.evaluate(async () => {
      const store = globalThis.StoreContract;
      const initial = await store.enqueueTextExchange({ timelineKey: "isolated", sessionId: "contract", text: "native transaction contract" });
      const id = initial.clientMessageId;
      const [deferred, staleClaim] = await Promise.all([
        store.deferTextExchangeManually(id, store.MANUAL_OUTBOX_CONFIRMATION),
        store.markTextExchangeSending(id, Date.now(), { snapshot: initial }),
      ]);
      const plainClaim = await store.markTextExchangeSending(id, Date.now(), { snapshot: deferred });
      const [sending, forbiddenDefer] = await Promise.allSettled([
        store.markTextExchangeSending(id, Date.now(), { snapshot: deferred, deferredRevision: deferred.updatedAtMs }),
        store.deferTextExchangeManually(id, store.MANUAL_OUTBOX_CONFIRMATION),
      ]);
      await store.patchTextExchange(id, { state: "in_progress", exchangeStatus: "processing" });
      const rejectedProcessing = await store.deferTextExchangeManually(id, store.MANUAL_OUTBOX_CONFIRMATION).then(() => false, () => true);
      const processing = (await store.listTextExchanges())[0];
      // Exercise the historical persisted state with the real writer; no
      // alternate storage or backend is substituted for the production store.
      const legacy = await store.patchTextExchange(id, { state: "queued_by_user" });
      const legacyClaim = await store.markTextExchangeSending(id, Date.now(), { snapshot: legacy, deferredRevision: legacy.updatedAtMs });
      const recovered = (await store.listTextExchanges())[0];
      return {
        id, originalBody: initial.requestBody, deferredState: deferred.state,
        staleClaim, plainClaim, sending: sending.status === "fulfilled" ? sending.value.state : null,
        forbiddenDefer: forbiddenDefer.status, rejectedProcessing, processing, legacyClaim, recovered,
      };
    });
    assert.equal(result.deferredState, "queued_by_user");
    assert.equal(result.staleClaim, null);
    assert.equal(result.plainClaim, null);
    assert.equal(result.sending, "sending");
    assert.equal(result.forbiddenDefer, "rejected");
    assert.equal(result.rejectedProcessing, true);
    assert.equal(result.processing.state, "in_progress");
    assert.deepEqual(result.processing.requestBody, result.originalBody);
    assert.equal(result.legacyClaim, null);
    assert.equal(result.recovered.state, "recovery_required");
    assert.equal(result.recovered.errorCode, "deferred_cognition_receipt_requires_reconciliation");
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(localDocument);
    await reopened.addScriptTag({ content: output[0].code });
    const persisted = await reopened.evaluate(() => globalThis.StoreContract.listTextExchanges());
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].clientMessageId, result.id);
    assert.equal(persisted[0].state, "recovery_required");
    assert.equal(persisted[0].exchangeStatus, "processing");
    assert.deepEqual(persisted[0].requestBody, result.originalBody);
  } finally {
    await context.close();
    await browser.close();
  }
});
