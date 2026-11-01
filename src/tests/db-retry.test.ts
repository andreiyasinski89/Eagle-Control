import { describe, expect, it, vi } from "vitest";
import { isTransientDbError, withDbRetry } from "@/server/db-retry";

const lost = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
const init = Object.assign(new Error("Can't reach database server"), { errorCode: "P1001" });
const real = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
const nap = () => Promise.resolve();

describe("a database that was asleep", () => {
  it("tells a missing connection from a query that really failed", () => {
    expect(isTransientDbError(lost)).toBe(true);
    expect(isTransientDbError(init)).toBe(true);
    expect(isTransientDbError(Object.assign(new Error("x"), { code: "P2024" }))).toBe(true);
    // the engine often gives no code, only the words
    expect(isTransientDbError(new Error("Invalid prisma.session.findUnique() invocation: Can't reach database server at host:5432"))).toBe(true);
    expect(isTransientDbError(real)).toBe(false);
    expect(isTransientDbError(new Error("boom"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });

  it("answers after the connection comes back, without the person seeing the first failure", async () => {
    const run = vi.fn().mockRejectedValueOnce(lost).mockRejectedValueOnce(init).mockResolvedValue("ok");
    expect(await withDbRetry(run, [1, 1, 1], nap)).toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last wait and tells the truth", async () => {
    const run = vi.fn().mockRejectedValue(lost);
    await expect(withDbRetry(run, [1, 1], nap)).rejects.toBe(lost);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("never runs again a query that really failed", async () => {
    const run = vi.fn().mockRejectedValue(real);
    await expect(withDbRetry(run, [1, 1, 1], nap)).rejects.toBe(real);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
