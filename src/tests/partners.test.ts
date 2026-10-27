import { describe, expect, it } from "vitest";
import { handoffText, sponsorWouldLoop, teamSizes, type HandoffCard, type HandoffLabels } from "@/modules/crm/partners";

const n = (id: string, parentId: string | null = null) => ({ id, parentId });
const line = [n("a"), n("b", "a"), n("c", "b"), n("d", "a")];

describe("sponsor tree", () => {
  it("refuses a sponsor that would put someone above themselves", () => {
    expect(sponsorWouldLoop(line, "a", "a")).toBe(true);
    expect(sponsorWouldLoop(line, "a", "c")).toBe(true);
    expect(sponsorWouldLoop(line, "c", "a")).toBe(false);
    expect(sponsorWouldLoop(line, "b", "d")).toBe(false);
    expect(sponsorWouldLoop(line, "b", null)).toBe(false);
  });
  it("counts everyone below a person, not the person", () => {
    const t = teamSizes(line);
    expect(t.get("a")).toBe(3);
    expect(t.get("b")).toBe(1);
    expect(t.get("c")).toBe(0);
  });
});

const labels: HandoffLabels = { stage: "Stage", warmth: "Warmth", phone: "Phone", email: "Email", country: "Country", source: "Source", interests: "Interests", nextStep: "Next step", group: "Group", notes: "Notes" };
const card: HandoffCard = { name: "Anna Kowalska", stage: "WARMING", temperature: "WARM", phones: ["+48 600 111 222"], emails: [], telegram: "@annak", whatsapp: null, instagram: null, country: "Poland", source: "Instagram", interests: ["Travel", "Wellness"], nextStep: "Call", nextStepAt: "2026-11-05T00:00:00.000Z", group: "Gym", notes: [{ at: "2026-10-01T10:00:00.000Z", text: "Asked about  the\nincome" }] };

describe("handoff card", () => {
  it("writes the person for a messenger, leaving out what is empty", () => {
    const t = handoffText(card, labels, "Warming up", "Warm");
    expect(t.split("\n")).toEqual(["Anna Kowalska", "Stage: Warming up", "Warmth: Warm", "Phone: +48 600 111 222", "Telegram: @annak", "Country: Poland", "Source: Instagram", "Interests: Travel, Wellness", "Group: Gym", "Next step: Call, 2026-11-05", "", "Notes:", "• 2026-10-01 Asked about the income"]);
  });
  it("is short for a bare person", () => {
    const t = handoffText({ ...card, temperature: null, phones: [], telegram: null, country: null, source: null, interests: [], nextStep: null, nextStepAt: null, group: null, notes: [] }, labels, "New lead", null);
    expect(t).toBe("Anna Kowalska\nStage: New lead");
  });
});
