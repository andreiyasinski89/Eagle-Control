import { expect, test } from "@playwright/test";
import { signInByMail } from "./helpers";

// Needs a migrated database, `npm run dev` (not in demo mode) and a mailbox: Mailpit on :8025 or `node scripts/e2e-mailbox.mjs`
// (the playwright config starts the latter by itself). Signs up through the e-mailed link, creates a workspace and invites a teammate.

test("sign up, create workspace, invite a member, see empty dashboard", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const owner = `owner-${stamp}@example.com`;
  const guest = `member-${stamp}@example.com`;

  await signInByMail(page, request, owner, { firstName: "Eva" });

  // the form is a plain one until the page has loaded its scripts: wait for them, or the press submits it the old way
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Workspace name").fill("E2E Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  // a first workspace takes the person to Start (the first steps); the first visit of a page may be slow while the dev server builds it
  await expect(page).toHaveURL(/\/w\/[^/]+\/start/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Getting started", exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Email").fill(guest);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(page.getByText(guest)).toBeVisible();
});
