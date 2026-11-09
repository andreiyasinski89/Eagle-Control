import { describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ opts: null as unknown }));
vi.mock("@/server/db", () => ({ db: { $transaction: async (fn: (tx: unknown) => unknown, opts: unknown) => ((seen.opts = opts), fn({})) } }));

import { crmTx } from "@/server/services/crm/common";

describe("a CRM change has room to finish", () => {
  it("runs as one transaction allowed 30 seconds (not Prisma's 5), so a slow or waking database does not undo a stage move", async () => {
    expect(await crmTx(async () => "done")).toBe("done");
    expect(seen.opts).toEqual({ timeout: 30_000, maxWait: 15_000 });
  });
});
