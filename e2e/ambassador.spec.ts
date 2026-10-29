import { expect, test } from "@playwright/test";

// The ambassador's day, from the outside to the plan: a lead arrives through the webhook with somebody's label,
// appears in the touch queue, gets the touch "Meeting set", and the meeting is counted in the plan of the day.
//
// Needs the app in demo mode (DEMO_MODE=true, NEXT_PUBLIC_DEMO_MODE=true) and a database; run it with
//   APP_URL=http://localhost:3100 npx playwright test e2e/ambassador.spec.ts
// The demo button signs in and fills the workspace on the first visit, which takes about twenty seconds.

test("webhook lead → touch queue → Meeting set → meeting in the plan of the day", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const name = `Quiz${stamp}`;

  // 0. sign in to the demo
  await page.goto("/en/sign-in");
  await page.getByRole("button", { name: "Open the demo" }).click();
  await page.waitForURL(/\/w\/demo-studio/, { timeout: 120_000 });

  // 1. the leader's webhook and the ambassador's label (here the same person: the demo owner)
  const workspaces = await (await page.request.get("/api/v1/workspaces")).json();
  const wsId: string = workspaces[0].id;
  const hook = await (await page.request.post(`/api/v1/workspaces/${wsId}/lead-webhook`, { data: {} })).json();
  const referral = await (await page.request.get(`/api/v1/workspaces/${wsId}/referral`)).json();
  expect(hook.token).toMatch(/^mol_/);

  // 2. a quiz sends a lead with the label (no cookies: it is an outside service)
  const sent = await request.post(`${baseURL}/api/public/hooks/leads`, {
    headers: { authorization: `Bearer ${hook.token}`, "idempotency-key": `e2e-${stamp}` },
    data: { name, telegram: `@${name.toLowerCase()}`, ref: referral.code, "Question 1": "I want an extra income" },
  });
  expect(sent.status()).toBe(201);
  expect((await sent.json()).status).toBe("created");

  // 2b. the same person again (the same Telegram name typed another way) is not made twice
  const again = await request.post(`${baseURL}/api/public/hooks/leads`, {
    headers: { authorization: `Bearer ${hook.token}` },
    data: { name, telegram: `https://t.me/${name}`, ref: referral.code },
  });
  expect((await again.json()).status).toBe("duplicate");

  // 3. the person is in today's touch queue, with the reminder to answer within the hour
  const queue = await (await page.request.get(`/api/v1/workspaces/${wsId}/touch-queue`)).json();
  const mine = (queue.items as { firstName: string; nextStep: string | null }[]).find((i) => i.firstName === name);
  expect(mine?.nextStep).toBe("New: reply within the hour");
  await page.goto("/en/w/demo-studio/crm/touches");
  // The queue shows one person at a time, and leads of earlier runs may stand ahead: skip them.
  for (let i = 0; i < 60 && !(await page.getByText(name).first().isVisible()); i++) {
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("reply within the hour").first()).toBeVisible();

  // 4. the touch "Meeting set": a time today, so that the plan of the day counts it
  const day: string = (await (await page.request.get(`/api/v1/workspaces/${wsId}/my-day`)).json()).date;
  await page.getByTestId("touch-meeting").click();
  await page.getByTestId("touch-meeting-day").fill(day);
  await page.getByTestId("touch-meeting-time").fill("23:30");
  await page.getByTestId("touch-meeting-save").click();

  // 5. the meeting is in the plan of the day (the note on the card is shown for a few seconds only, so the plan itself is asked)
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/workspaces/${wsId}/my-day`)).json()).plan.meetings.planned, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);
  await page.goto("/en/w/demo-studio");
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
});
