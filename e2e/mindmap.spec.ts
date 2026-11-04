import { expect, test } from "@playwright/test";
import { signInByMail } from "./helpers";

// Needs the same stack as onboarding.spec.ts (migrated database, `npm run dev` outside demo mode, a mailbox on :8025).

test("create a project from a template, edit the map, undo, heatmap, shareable link", async ({ page, request }) => {
  test.setTimeout(240_000);
  await signInByMail(page, request, `map-${Date.now()}@example.com`, { firstName: "Mia" });
  // the form is a plain one until the page has loaded its scripts: wait for them, or the press submits it the old way
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace name").fill("Map Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/start/, { timeout: 90_000 });

  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Launch");
  await page.getByLabel("Template").selectOption("agile-sprint-map");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // template expanded into epics and sprints
  const map = page.getByTestId("mindmap");
  await expect(map.locator('[data-node-type="EPIC"]')).toHaveCount(2);
  // two goals, two sprints in each
  await expect(map.locator('[data-node-type="SPRINT"]')).toHaveCount(4);

  // select a sprint, Tab adds a task and opens inline editing
  await map.locator('[data-node-type="SPRINT"]').first().click();
  await expect(page).toHaveURL(/node=/);
  await page.keyboard.press("Tab");
  // the task is made on the server first and then opens for its title: typing before the box is there would be lost
  const title = map.getByRole("textbox", { name: "Title" });
  await expect(title).toBeVisible();
  await title.fill("Build login");
  await page.keyboard.press("Enter");
  await expect(map.getByText("Build login")).toBeVisible();

  // heatmap + undo
  await page.getByRole("button", { name: "Heatmap" }).click();
  await expect(page.getByRole("button", { name: "Heatmap" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(map.getByText("Build login")).toHaveCount(0);

  // the open node is in the URL, so a reload lands on the same drawer
  // (the map only draws what is in view, and the view was left where the undone task had been: bring everything back into it first)
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await map.locator('[data-node-type="EPIC"]').first().click();
  const url = page.url();
  await page.goto(url);
  await expect(page.getByTestId("drawer")).toBeVisible();
});
