import { expect, test } from "../support/appFixture";

test.describe("chat end-to-end", () => {
  test("send, receive and reload preserve exactly one copy of each turn", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Scrivi a Kael...");
    await expect(input).toBeEnabled();

    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === "/chat" && request.method() === "POST");
    await input.fill("Messaggio E2E memoria");
    await input.press("Enter");
    const request = await requestPromise;
    const payload = request.postDataJSON();

    expect(payload.text).toBe("Messaggio E2E memoria");
    expect(payload.session_id).toBe("mobile_kael");
    expect(payload.client_message_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number.isNaN(Date.parse(payload.client_time))).toBe(false);

    await expect(page.getByText("Messaggio E2E memoria", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Risposta E2E: Messaggio E2E memoria", { exact: true })).toHaveCount(1);

    await page.reload();
    await expect(page.getByText("Messaggio E2E memoria", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Risposta E2E: Messaggio E2E memoria", { exact: true })).toHaveCount(1);
  });
});