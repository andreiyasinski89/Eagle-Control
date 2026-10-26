import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLead } from "@/modules/crm/lead-intake";

interface Mail {
  subject: string;
  from: string;
  replyTo?: string;
  to?: string;
  body: string;
}
type Parsed = Record<string, string> | null;

// The script is plain Apps Script text; load it the way Google would, with `module` available for the test.
const source = readFileSync(join(process.cwd(), "docs", "integrations", "gmail-leads.gs"), "utf8");
const exported: { parseLeadEmail_: (m: Mail) => Parsed; fieldOf_: (l: string) => string | null } = (() => {
  const sandbox = { exports: {} as Record<string, unknown> };
  new Function("module", source)(sandbox);
  return sandbox.exports as never;
})();
const parse = (m: Partial<Mail> & { body: string }) => exported.parseLeadEmail_({ subject: "New request", from: "Clever Travel <noreply@clever-travel.club>", to: "me@gmail.com", ...m });

describe("Gmail lead script: reading a form e-mail", () => {
  it("reads labelled fields in English", () => {
    const lead = parse({ body: "Name: Anna Kowalska\nEmail: anna@example.com\nPhone: +48 600 100 200\nMessage: Family trip to Lisbon in May\n" });
    expect(lead).toMatchObject({ name: "Anna Kowalska", email: "anna@example.com", phone: "+48 600 100 200", message: "Family trip to Lisbon in May", source: "email", subject: "New request" });
  });

  it("reads Russian labels and a message that continues on the next lines", () => {
    const lead = parse({ body: "Имя: Иван Петров\nПочта: ivan@example.ru\nТелефон: +7 999 123-45-67\nСообщение: Нужен тур в Грузию\nна двоих, в июне.\nБюджет: 2000 EUR\n" });
    expect(lead).toMatchObject({ name: "Иван Петров", email: "ivan@example.ru", phone: "+7 999 123-45-67" });
    expect(lead!.message).toBe("Нужен тур в Грузию\nна двоих, в июне.");
    expect(lead!["Бюджет"]).toBe("2000 EUR");
  });

  it("reads Polish labels and ignores a colon in the middle of other text", () => {
    const lead = parse({ body: "Imię: Ola\nAdres e-mail: ola@example.pl\nWiadomość: Czy macie ofertę: Chorwacja?\n" });
    expect(lead).toMatchObject({ name: "Ola", email: "ola@example.pl", message: "Czy macie ofertę: Chorwacja?" });
  });

  it("falls back to Reply-To for the e-mail and its display name", () => {
    const lead = parse({ replyTo: "Maria Silva <maria@example.com>", body: "Phone: 600 700 800\nMessage: Hi" });
    expect(lead).toMatchObject({ email: "maria@example.com", name: "Maria Silva" });
  });

  it("falls back to an address and a phone number found anywhere in the text, never the sender's or your own", () => {
    const lead = parse({ body: "Hello, please write to tom@example.com or call +44 20 7946 0958. Sent from noreply@clever-travel.club to me@gmail.com" });
    expect(lead).toMatchObject({ email: "tom@example.com", phone: "+44 20 7946 0958" });
  });

  it("keeps the whole text as the message when it has no labels", () => {
    const lead = parse({ body: "I want a trip to Rome.\nReach me: rome@example.com" });
    expect(lead!.message).toContain("I want a trip to Rome.");
    expect(lead!.email).toBe("rome@example.com");
  });

  it("returns null when there is nothing to follow up", () => {
    expect(parse({ body: "Name: Someone\nMessage: just saying hi" })).toBeNull();
    expect(parse({ body: "" })).toBeNull();
  });

  it("takes only the first address of a field and lower-cases it", () => {
    expect(parse({ body: "Email: Anna@Example.COM, other@example.com" })!.email).toBe("anna@example.com");
  });

  it("limits what it sends", () => {
    const lead = parse({ subject: "x".repeat(500), body: `Email: a@b.io\nMessage: ${"y".repeat(5000)}` })!;
    expect(lead.message?.length).toBe(3000);
    expect(lead.subject?.length).toBe(200);
  });

  it("recognises the label words the script advertises", () => {
    expect(exported.fieldOf_("E-mail *")).toBe("email");
    expect(exported.fieldOf_("Телефон")).toBe("phone");
    expect(exported.fieldOf_("Favourite colour")).toBeNull();
  });
});

describe("what the script sends is what MeetOwl's webhook understands", () => {
  it("is accepted by the lead parser with the right fields", () => {
    const sent = parse({ body: "Name: Anna Kowalska\nEmail: anna@example.com\nPhone: +48 600 100 200\nMessage: Lisbon\nCountry: Poland\n" })!;
    const lead = parseLead(sent);
    expect(lead).toMatchObject({ firstName: "Anna", lastName: "Kowalska", email: "anna@example.com", message: "Lisbon" });
    expect(lead.phone).toBe("+48 600 100 200");
    expect(JSON.stringify(lead.extra)).toContain("Poland");
  });
});
