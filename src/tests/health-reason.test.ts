import { describe, expect, it } from "vitest";
import { healthReason } from "@/lib/health-reason";

describe("healthReason", () => {
  it("names the usual ways a database stops answering", () => {
    expect(healthReason({ code: "P1001", message: "Can't reach database server at `ep-secret.example`:`5432`" })).toBe("unreachable");
    expect(healthReason({ code: "P2024" })).toBe("pool_timeout");
    expect(healthReason({ code: "P1000" })).toBe("login_refused");
    expect(healthReason({ code: "P1002" })).toBe("timeout");
    expect(healthReason({ code: "P1017" })).toBe("closed");
  });

  it("says nothing but a fixed word, whatever the error holds", () => {
    expect(healthReason(new Error("password authentication failed for user x"))).toBe("other");
    expect(healthReason({ code: "P9999" })).toBe("other");
    expect(healthReason(null)).toBe("other");
    expect(healthReason("boom")).toBe("other");
  });
});
