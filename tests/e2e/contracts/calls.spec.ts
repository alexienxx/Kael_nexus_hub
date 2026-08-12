import { expect, test } from "../support/appFixture";

test.describe("APK ↔ backend call contract", () => {
  test("active-call backend shape enables the page and visible copy is valid UTF-8", async ({ page }) => {
    await page.goto("/calls");
    await expect(page.getByRole("heading", { name: "Videochiamata", exact: true })).toBeVisible();
    await expect(page.getByText("Videochiamata — Kael ti vedrà attraverso la videocamera")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/â|Ã|�/);
    await expect(page.getByRole("button", { name: "Avvia videochiamata" })).toBeEnabled();
  });

  test("start call uses the backend query contract and no obsolete JSON body", async ({ page }) => {
    await page.goto("/calls");
    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === "/mobile/call/start");
    await page.getByRole("button", { name: "Avvia videochiamata" }).click();
    const request = await requestPromise;
    const url = new URL(request.url());

    expect(request.method()).toBe("POST");
    expect(url.searchParams.get("user_id")).toBe("mobile_kael");
    expect(request.postData()).toBeNull();
    await expect(page.getByText("Connessione in corso...")).toBeVisible();
  });
});