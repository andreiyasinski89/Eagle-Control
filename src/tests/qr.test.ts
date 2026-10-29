import { describe, expect, it } from "vitest";
import { qrMatrix, QR_MAX_BYTES } from "@/modules/qr";
import { parseLead, LeadRejected } from "@/modules/crm/lead-intake";
import { answerSoon } from "@/modules/crm/lead-queue";

describe("qrMatrix", () => {
  const finderAt = (m: boolean[][], x: number, y: number) => [0, 1, 2, 3, 4, 5, 6].every((i) => m[y]![x + i] && m[y + 6]![x + i] && m[y + i]![x] && m[y + i]![x + 6]);

  it("grows with the text: 21 modules for a few bytes, 33 for a short link", () => {
    expect(qrMatrix("A")).toHaveLength(21);
    expect(qrMatrix("https://meetowl-app.vercel.app/r/ABCDEFGHJK")).toHaveLength(33);
    expect(qrMatrix("x".repeat(QR_MAX_BYTES))).toHaveLength(41);
  });
  it("is square, with the three finder patterns, timing lines and the dark module", () => {
    const m = qrMatrix("https://example.com/f/abc?ref=ABCDEFGHJK");
    const n = m.length;
    expect(m.every((r) => r.length === n)).toBe(true);
    expect(finderAt(m, 0, 0) && finderAt(m, n - 7, 0) && finderAt(m, 0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) expect(m[6]![i]).toBe(i % 2 === 0);
    expect(m[n - 8]![8]).toBe(true);
  });
  it("is the same for the same text and differs for another", () => {
    expect(qrMatrix("one")).toEqual(qrMatrix("one"));
    expect(qrMatrix("one")).not.toEqual(qrMatrix("two"));
  });
  it("counts bytes, not letters, and refuses what does not fit", () => {
    expect(qrMatrix("Привет")).toHaveLength(21);
    expect(() => qrMatrix("x".repeat(QR_MAX_BYTES + 1))).toThrow();
  });
});

describe("lead intake: Telegram and the label", () => {
  it("takes a Telegram name as a way to reach the person and reads the label", () => {
    const l = parseLead({ name: "Anna", telegram: "https://t.me/Anna_K", ref: "ABCDEFGHJK", answer1: "yes" });
    expect(l).toMatchObject({ telegram: "anna_k", ref: "ABCDEFGHJK", email: null, phone: null });
    expect(l.extra).toEqual({ answer1: "yes" });
  });
  it("still wants some way to reach the person", () => {
    expect(() => parseLead({ name: "Anna", ref: "X" })).toThrow(LeadRejected);
  });
  it("answers in the language of the person who has to reply", () => {
    expect(answerSoon("ru")).toContain("часа");
    expect(answerSoon("pl")).toContain("godziny");
    expect(answerSoon(null)).toContain("hour");
  });
});
