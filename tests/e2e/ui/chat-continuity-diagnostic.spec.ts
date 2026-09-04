import { expect, test } from "../support/appFixture";

type CapturedChatRequest = {
  text: string;
  session_id: string;
  client_time: string;
  client_message_id: string;
  quoted_message?: unknown;
};

test.describe("chat continuity diagnostics (browser IndexedDB; not live acceptance)", () => {
  test("the exact envelope exists durably before the HTTP exchange can complete", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Scrivi a Kael...");
    const requestPromise = page.waitForRequest((request) =>
      new URL(request.url()).pathname === "/chat" && request.method() === "POST"
    );
    await input.fill("E2E_DURABLE_BEFORE_FETCH");
    await input.press("Enter");
    const request = await requestPromise;
    const sent = request.postDataJSON() as CapturedChatRequest;

    const durable = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("kael-chat-continuity", 1);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      return new Promise<{ requestBody: CapturedChatRequest; state: string }>((resolve, reject) => {
        const read = db.transaction("text_outbox", "readonly").objectStore("text_outbox").getAll();
        read.onsuccess = () => resolve({
          requestBody: read.result[0]?.requestBody,
          state: read.result[0]?.state,
        });
        read.onerror = () => reject(read.error);
      });
    });

    expect(durable.requestBody).toEqual(sent);
    expect(durable.state).toBe("sending");
    expect(sent.client_message_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("missing IndexedDB fails closed before any text POST", async ({ page }) => {
    let posts = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/chat" && request.method() === "POST") posts += 1;
    });
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    });
    await page.goto("/");
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await expect(input).toBeDisabled();
    await page.waitForTimeout(250);
    expect(posts).toBe(0);
  });

  test("rapid sends remain FIFO and never overlap HTTP dispatch", async ({ page }) => {
    const events: Array<{ phase: "request" | "response"; text: string; at: number }> = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/chat" || request.method() !== "POST") return;
      events.push({
        phase: "request",
        text: (request.postDataJSON() as CapturedChatRequest).text,
        at: performance.now(),
      });
    });
    page.on("response", async (response) => {
      if (new URL(response.url()).pathname !== "/chat") return;
      const request = response.request();
      events.push({
        phase: "response",
        text: (request.postDataJSON() as CapturedChatRequest).text,
        at: performance.now(),
      });
    });

    await page.goto("/");
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await input.fill("E2E_FIFO_FIRST");
    await input.press("Enter");
    await input.fill("E2E_FIFO_SECOND");
    await input.press("Enter");

    await expect(page.getByText("Risposta E2E: E2E_FIFO_FIRST", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Risposta E2E: E2E_FIFO_SECOND", { exact: true })).toHaveCount(1);

    const firstRequest = events.findIndex((event) => event.phase === "request" && event.text === "E2E_FIFO_FIRST");
    const firstResponse = events.findIndex((event) => event.phase === "response" && event.text === "E2E_FIFO_FIRST");
    const secondRequest = events.findIndex((event) => event.phase === "request" && event.text === "E2E_FIFO_SECOND");
    expect(firstRequest).toBeGreaterThanOrEqual(0);
    expect(firstResponse).toBeGreaterThan(firstRequest);
    expect(secondRequest).toBeGreaterThan(firstResponse);
  });

  test("reload retries an in-progress exchange with the exact same UUID and body", async ({ page }) => {
    const requests: CapturedChatRequest[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/chat" || request.method() !== "POST") return;
      const body = request.postDataJSON() as CapturedChatRequest;
      if (body.text === "E2E_IN_PROGRESS_ONCE") requests.push(body);
    });

    await page.goto("/");
    const firstResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" && response.status() === 202
    );
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await input.fill("E2E_IN_PROGRESS_ONCE");
    await input.press("Enter");
    await firstResponse;

    const replayResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" && response.status() === 200
    );
    await page.reload();
    await replayResponse;

    await expect(page.getByText("E2E_IN_PROGRESS_ONCE", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Risposta E2E: E2E_IN_PROGRESS_ONCE", { exact: true })).toHaveCount(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);

    const outboxCount = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("kael-chat-continuity", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise<number>((resolve, reject) => {
        const request = db.transaction("text_outbox", "readonly").objectStore("text_outbox").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    expect(outboxCount).toBe(0);
  });

  test("recovery-required remains durable and is not blindly resent after reload", async ({ page }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/chat" || request.method() !== "POST") return;
      if ((request.postDataJSON() as CapturedChatRequest).text === "E2E_RECOVERY_REQUIRED") requests += 1;
    });

    await page.goto("/");
    const recoveryResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" && response.status() === 409
    );
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await input.fill("E2E_RECOVERY_REQUIRED");
    await input.press("Enter");
    await recoveryResponse;
    await page.reload();
    await page.waitForTimeout(1_250);

    expect(requests).toBe(1);
    await expect(
      page.locator('[data-testid^="message-bubble-"]').filter({ hasText: "E2E_RECOVERY_REQUIRED" }),
    ).toHaveCount(1);
    const state = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("kael-chat-continuity", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise<string>((resolve, reject) => {
        const request = db.transaction("text_outbox", "readonly").objectStore("text_outbox").getAll();
        request.onsuccess = () => resolve(request.result[0]?.state ?? "missing");
        request.onerror = () => reject(request.error);
      });
    });
    expect(state).toBe("recovery_required");
    await expect(page.getByTestId("outbox-attention-panel")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const manualReceipt = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" && response.status() === 409
    );
    await page.getByRole("button", { name: "Riprova stesso invio" }).click();
    await manualReceipt;
    expect(requests).toBe(2);
    await expect(page.getByTestId("outbox-attention-panel")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Rimuovi" }).click();
    await expect(page.getByTestId("outbox-attention-panel")).toHaveCount(0);
  });

  test("recovery-required A is a FIFO barrier for queued B until explicit removal", async ({ page }) => {
    let bRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname !== "/chat" || request.method() !== "POST") return;
      if ((request.postDataJSON() as CapturedChatRequest).text === "E2E_FIFO_AFTER_RECOVERY") {
        bRequests += 1;
      }
    });

    await page.goto("/");
    const input = page.getByPlaceholder("Scrivi a Kael...");
    const recoveryResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" && response.status() === 409
    );
    await input.fill("E2E_RECOVERY_REQUIRED");
    await input.press("Enter");
    await recoveryResponse;

    await input.fill("E2E_FIFO_AFTER_RECOVERY");
    await input.press("Enter");
    await page.waitForTimeout(300);
    expect(bRequests).toBe(0);
    await expect(page.getByText(/successivi restano fermi/i)).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const bResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/chat" &&
      (response.request().postDataJSON() as CapturedChatRequest).text === "E2E_FIFO_AFTER_RECOVERY"
    );
    await page.getByRole("button", { name: "Rimuovi" }).click();
    await bResponse;
    expect(bRequests).toBe(1);
    await expect(page.getByText("Risposta E2E: E2E_FIFO_AFTER_RECOVERY", { exact: true })).toHaveCount(1);
  });

  test("SILENCE completes the user exchange without an empty assistant bubble", async ({ page }) => {
    await page.goto("/");
    const response = page.waitForResponse((item) =>
      new URL(item.url()).pathname === "/chat" && item.status() === 200
    );
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await input.fill("E2E_SILENCE");
    await input.press("Enter");
    await response;

    await expect(page.getByText("E2E_SILENCE", { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-testid^="message-bubble-"]')).toHaveCount(1);
  });

  test("a staged inbox WAL page is recovered after reload before its cursor is used", async ({ page }) => {
    await page.goto("/");
    const cursorBeforeCommit = await page.evaluate(async () => {
      const store = await import("/src/lib/chat/durableExchangeStore.ts");
      await store.stageInboxBatch({
        timelineKey: "kael-main",
        fromCursor: 0,
        nextCursor: 9001,
        cursorKind: "conversation_turn_id",
        batchId: "diagnostic-crash-window",
        messages: [{
          id: 9001,
          backend_turn_id: 9001,
          text: "E2E_WAL_RECOVERED",
          sender: "user",
          timestamp: 1_788_500_000,
        }],
      });
      return store.getTimelineCursor("kael-main");
    });
    expect(cursorBeforeCommit).toBe(0);

    await page.reload();
    await expect(page.getByText("E2E_WAL_RECOVERED", { exact: true })).toHaveCount(1);

    const cursor = await page.evaluate(async () => {
      const store = await import("/src/lib/chat/durableExchangeStore.ts");
      return store.getTimelineCursor("kael-main");
    });
    expect(cursor).toBeGreaterThanOrEqual(9001);
  });
});
