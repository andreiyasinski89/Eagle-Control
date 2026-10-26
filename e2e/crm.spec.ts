import { expect, test } from "@playwright/test";

// Phase 3 scenario: a lead from the public web form becomes a deal, is won, and a project grows out of it.
// Needs the seeded demo workspace (npm run db:seed) and a session cookie for demo@meetowl.local
// (npx tsx scripts/dev-session.ts) exported as SESSION_TOKEN. Written against the UI and verified by hand;
// not yet run in CI.

const token = process.env.SESSION_TOKEN;
test.skip(!token, "SESSION_TOKEN not set");

test("web-form lead → won → project from template → Client Map", async ({ page, context, request, baseURL }) => {
  await context.addCookies([{ name: "authjs.session-token", value: token as string, url: baseURL as string }]);

  // 1. the lead arrives through the hosted public form
  await page.goto("/w/demo-studio/settings/lead-capture");
  const formUrl = (await page.getByLabel("Link to the hosted form").inputValue()) as string;
  const stamp = Date.now();
  await page.goto(formUrl);
  await page.getByRole("textbox").nth(0).fill(`E2E Lead ${stamp}`);
  await page.getByRole("textbox").nth(1).fill(`e2e-${stamp}@example.com`);
  await page.getByRole("textbox").nth(2).fill(`E2E Company ${stamp}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  // 2. it shows up on the board, in the first stage
  await page.goto("/w/demo-studio/crm");
  const card = page.getByRole("button", { name: new RegExp(`E2E Company ${stamp}`) });
  await expect(card).toBeVisible();
  await card.click();

  // 3. mark it won → the dialog offers a project from a template
  await page.getByRole("button", { name: "Mark won" }).click();
  await expect(page.getByRole("dialog", { name: "Create a project for this client?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Project created")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).first().click();

  // 4. the client's map shows the project, linked to the deal
  await page.goto("/w/demo-studio/crm/companies");
  await page.getByText(`E2E Company ${stamp}`).click();
  await page.getByRole("tab", { name: "Client Map" }).click();
  const map = page.getByTestId("client-map");
  await expect(map.locator('[data-kind="project"]')).toHaveCount(1);
  await expect(map.locator('[data-kind="company"]')).toHaveCount(1);
  void request;
});
