import { expect, test } from "@playwright/test";

// "Write in one click": in a person's card the script is changed and each of the three messenger buttons is pressed.
// Checks what the person would see and get: the text in the clipboard, the right address opened, the message in the person's feed, and the undo.
//
// Needs the app in demo mode (see ambassador.spec.ts); run it with
//   APP_URL=http://localhost:3100 PW_CHANNEL=chrome npx playwright test e2e/messengers.spec.ts
// The demo person "Anna Kowalska" has a phone with a country code and a Telegram name, but no Instagram name.

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("script → Telegram, WhatsApp, Instagram: text copied, address opened, message in the feed, undo", async ({ page, context }) => {
  test.setTimeout(180_000);
  // The messengers themselves are not visited: the address the button asks the browser to open is what is checked.
  await context.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    };
  });

  await page.goto("/en/sign-in");
  await page.getByRole("button", { name: "Open the demo" }).click();
  await page.waitForURL(/\/w\/demo-studio/, { timeout: 120_000 });

  const wsId: string = (await (await page.request.get("/api/v1/workspaces")).json())[0].id;
  const found = await (await page.request.get(`/api/v1/workspaces/${wsId}/contacts?q=Anna`)).json();
  const anna = (found.items ?? found)[0];
  // The test types an Instagram name at its end; the next run starts from a person without one again.
  await page.request.patch(`/api/v1/contacts/${anna.id}`, { data: { messengers: { instagram: "" } } });
  await page.goto(`/en/w/demo-studio/crm/contacts?contact=${anna.id}`);

  const text = `E2E hello Anna ${Date.now()}`;
  // The list behind the card has the same buttons in small (one row for each person): only those of the card are meant.
  const block = page.getByTestId("script-block");
  const box = block.getByTestId("script-text");
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.fill(text);

  const feed = async () => ((await (await page.request.get(`/api/v1/workspaces/${wsId}/activities?contactId=${anna.id}&type=MESSAGE&pageSize=50`)).json()).items as { id: string; subject: string; body: string | null }[]).filter((a) => a.body === text);
  const press = async (channel: "telegram" | "whatsapp" | "instagram") => {
    await page.evaluate(() => ((window as unknown as { __opened: string[] }).__opened.length = 0));
    await block.getByTestId(`messenger-${channel}`).click();
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    expect(opened).toHaveLength(1);
    const url = opened[0] as string;
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await expect(block.getByText("Script copied")).toBeVisible();
    return url;
  };

  // Telegram: the chat by the name (the text goes by the clipboard)
  expect(await press("telegram")).toBe("https://t.me/annak");
  await expect.poll(async () => (await feed()).map((a) => a.subject), { timeout: 20_000 }).toContain("Message sent via Telegram");

  // WhatsApp: the chat by the phone, with the text in the link
  expect(await press("whatsapp")).toBe(`https://wa.me/48600111222?text=${encodeURIComponent(text)}`);
  await expect.poll(async () => (await feed()).map((a) => a.subject), { timeout: 20_000 }).toContain("Message sent via WhatsApp");

  // Instagram: no name is known, so the list of conversations opens, and the person is offered a way to add the name
  await expect(block.getByTestId("messenger-edit-instagram")).toBeVisible();
  expect(await press("instagram")).toBe("https://www.instagram.com/direct/inbox/");
  await expect.poll(async () => (await feed()).map((a) => a.subject), { timeout: 20_000 }).toContain("Message sent via Instagram");

  // "Did not send it: undo" takes the last note back
  await block.getByTestId("messenger-undo").click();
  await expect.poll(async () => (await feed()).map((a) => a.subject), { timeout: 20_000 }).not.toContain("Message sent via Instagram");

  // The pencil: type the name on the spot, and the next press opens the conversation with the person
  await block.getByTestId("messenger-edit-instagram").click();
  await block.getByTestId("messenger-quick-input").fill("https://www.instagram.com/anna.k?igsh=abc");
  await block.getByTestId("messenger-quick-save").click();
  await expect(block.getByTestId("messenger-instagram")).toHaveAttribute("data-direct", "yes", { timeout: 15_000 });
  expect(await press("instagram")).toBe("https://ig.me/m/anna.k");
});
