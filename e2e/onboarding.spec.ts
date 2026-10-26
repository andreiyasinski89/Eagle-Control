import { expect, test, type APIRequestContext } from "@playwright/test";

// Needs: docker compose up -d, migrated DB, `npm run dev`, Mailpit on :8025.
// Signs in through the magic link delivered to Mailpit, creates a workspace and invites a teammate.

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function latestLink(request: APIRequestContext, to: string, pattern: RegExp) {
  for (let i = 0; i < 20; i++) {
    const list = await (await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
    const id: string | undefined = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
      const m = (msg.Text as string).match(pattern);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No mail for ${to}`);
}

test("sign up, create workspace, invite a member, see empty dashboard", async ({ page, request }) => {
  const stamp = Date.now();
  const owner = `owner-${stamp}@example.com`;
  const guest = `member-${stamp}@example.com`;

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(owner);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(await latestLink(request, owner, /http\S+callback\/email\S+/));

  await page.getByLabel("Workspace name").fill("E2E Studio");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: /Welcome to E2E Studio/ })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Email").fill(guest);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  await expect(page.getByText(guest)).toBeVisible();
});
