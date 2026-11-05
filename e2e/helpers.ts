import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Mailpit, or `node scripts/e2e-mailbox.mjs` (the same small API, no Docker). */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** The text of the newest mail to an address that has a match for the pattern; waits for it to arrive. */
export async function latestMatch(request: APIRequestContext, to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
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

/**
 * Signs a person in the way a real one does: asks for the link on the sign-in page, opens the link from the mail, and presses the button of the
 * confirmation page (the link alone never signs in: see `confirmLink`). A new address is a sign-up: it also gives the name.
 */
export async function signInByMail(page: Page, request: APIRequestContext, email: string, opts: { firstName?: string } = {}): Promise<void> {
  await page.goto("/en/sign-in");
  if (opts.firstName) {
    await page.getByTestId("tab-signup").click();
    await page.getByTestId("signup-first").fill(opts.firstName);
  }
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("agree-terms").check();
  await page.getByTestId("signup-submit").click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(await latestMatch(request, email, /http\S+\/sign-in\/confirm\S+/));
  await page.getByTestId("confirm-signin").click();
}
