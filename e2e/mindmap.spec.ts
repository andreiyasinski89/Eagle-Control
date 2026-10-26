import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Needs the same stack as onboarding.spec.ts (migrated DB, `npm run dev`, Mailpit on :8025).
// Not run in CI yet: written against the Phase 2 UI and verified manually in the browser.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const list = await (await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    const id: string | undefined = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      const link = (msg.Text as string).match(/http\S+callback\/email\S+/)?.[0];
      if (link) return void (await page.goto(link));
    }
    await page.waitForTimeout(500);
  }
  throw new Error("magic link not delivered");
}

test("create a project from a template, edit the map, undo, heatmap, shareable link", async ({ page, request }) => {
  await signIn(page, request, `map-${Date.now()}@example.com`);
  await page.getByLabel("Workspace name").fill("Map Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Launch");
  await page.getByLabel("Template").selectOption("agile-sprint-map");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // template expanded into epics and sprints
  const map = page.getByTestId("mindmap");
  await expect(map.locator('[data-node-type="EPIC"]')).toHaveCount(2);
  await expect(map.locator('[data-node-type="SPRINT"]')).toHaveCount(2);

  // select a sprint, Tab adds a task and opens inline editing
  await map.locator('[data-node-type="SPRINT"]').first().click();
  await expect(page).toHaveURL(/node=/);
  await page.keyboard.press("Tab");
  await page.keyboard.type("Build login");
  await page.keyboard.press("Enter");
  await expect(map.getByText("Build login")).toBeVisible();

  // heatmap + undo
  await page.getByRole("button", { name: "Heatmap" }).click();
  await expect(page.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(map.getByText("Build login")).toHaveCount(0);

  // the open node is in the URL, so a reload lands on the same drawer
  await map.locator('[data-node-type="EPIC"]').first().click();
  const url = page.url();
  await page.goto(url);
  await expect(page.getByTestId("drawer")).toBeVisible();
});
