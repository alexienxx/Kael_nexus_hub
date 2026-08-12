import { expect, test } from "../support/appFixture";

test.describe("capability truth surfaces", () => {
  test("workspace reports disconnected services and pending/empty modules honestly", async ({ page }) => {
    await page.goto("/workspace");
    for (const service of ["Google Drive", "GitHub", "Google Calendar", "Slack"]) {
      await expect(page.getByText(service, { exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "Progetti", exact: true }).click();
    await expect(page.getByText("Nessun progetto", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Obiettivi", exact: true }).click();
    await expect(page.getByText("Nessun obiettivo", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Riflessioni", exact: true }).click();
    await expect(page.getByText("La sezione riflessioni sarà disponibile quando il backend lo supporterà")).toBeVisible();
  });

  test("Spotify and Observatory never pretend an unavailable capability is active", async ({ page }) => {
    await page.goto("/media");
    await page.getByRole("button", { name: "Musica", exact: true }).click();
    await expect(page.locator("body")).toContainText(/Configura Spotify|Non connesso/);

    await page.goto("/observatory");
    await expect(page.getByText("Overview non ancora wired", { exact: true })).toBeVisible();
  });

  test("agentic settings expose repository unavailability without crashing", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /^Funzioni Agentiche/ }).click();
    await expect(page.getByRole("heading", { name: "Funzioni Agentiche", exact: true })).toBeVisible();
    await expect(page.getByText("Backend OK — servizio non collegato", { exact: true })).toBeVisible();
    await expect(page.getByText("Nessun repository disponibile", { exact: true })).toBeVisible();
  });
});