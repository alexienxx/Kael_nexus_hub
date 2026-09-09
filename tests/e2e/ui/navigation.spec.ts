import { expect, test } from "../support/appFixture";

test.describe("APK navigation smoke", () => {
  test("all primary routes render without a blank screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Kael", exact: true })).toBeVisible();
    await expect(page.getByLabel("Start call")).toBeVisible();

    const routes = [
      { link: "Allegati", heading: "Media" },
      { link: "Workspace", heading: "Workspace" },
      { link: "Settings", heading: "Settings" },
      { link: "Chat", heading: "Kael" },
    ];

    for (const route of routes) {
      await page.getByRole("link", { name: route.link, exact: true }).click();
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    }
  });

  test("media and workspace sub-sections are independently reachable", async ({ page }) => {
    await page.goto("/media");
    for (const tab of ["Foto", "Video", "Musica"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible();
    }

    await page.goto("/workspace");
    for (const tab of ["Servizi", "Progetti", "Obiettivi", "Riflessioni"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
    }
  });

  test("every settings section can open and return", async ({ page }) => {
    await page.goto("/settings");
    const sections = [
      ["Profilo Kael", "Profilo"],
      ["Personalizzazione", "Tema"],
      ["Connessione Backend", "Connessione"],
      ["Agente Esterno", "Agente Esterno"],
      ["Foto Kael & Alexièn", "Foto Kael & Alexièn"],
      ["Funzioni Agentiche", "Funzioni Agentiche"],
      ["Aggiornamenti", "Aggiornamenti"],
    ] as const;

    for (const [button, heading] of sections) {
      await page.getByRole("button", { name: new RegExp(`^${button}`) }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "← Indietro" }).click();
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    }
  });
});
