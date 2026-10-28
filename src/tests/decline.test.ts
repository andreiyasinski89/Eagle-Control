import { describe, expect, it } from "vitest";
import { DECLINE_REASONS, declineStats } from "@/modules/crm/decline";

describe("decline reasons", () => {
  it("has seven reasons", () => {
    expect(DECLINE_REASONS).toHaveLength(7);
  });

  it("counts reasons, most frequent first, unknown codes and blanks as not specified", () => {
    const s = declineStats([{ declineReason: "NO_TIME" }, { declineReason: "NO_MONEY" }, { declineReason: "NO_MONEY" }, { declineReason: null }, { declineReason: "made-up" }]);
    expect(s.total).toBe(5);
    expect(s.reasons).toEqual([{ reason: "NO_MONEY", count: 2 }, { reason: null, count: 2 }, { reason: "NO_TIME", count: 1 }].sort((a, b) => b.count - a.count || 0));
  });

  it("is empty when nobody declined", () => {
    expect(declineStats([])).toEqual({ total: 0, reasons: [] });
  });
});
