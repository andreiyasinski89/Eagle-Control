import { describe, expect, it, vi } from "vitest";
import { resilientSession, type SessionSource } from "@/server/auth/resilient";

type S = { user?: { id: string } };
const me: S = { user: { id: "u1" } };
const nap = () => Promise.resolve();
const src = (over: Partial<SessionSource<S>>): SessionSource<S> => ({ read: async () => null, token: async () => "tok", valid: async () => true, ...over });

describe("who is signed in", () => {
  it("a signed-in person is answered at once, nothing else is asked", async () => {
    const token = vi.fn();
    expect(await resilientSession(src({ read: async () => me, token }), [1], nap)).toBe(me);
    expect(token).not.toHaveBeenCalled();
  });

  it("a visitor without a session cookie is nobody, with no query to the database", async () => {
    const valid = vi.fn();
    expect(await resilientSession(src({ token: async () => null, valid }), [1], nap)).toBeNull();
    expect(valid).not.toHaveBeenCalled();
  });

  it("a session the database does not know, or that has expired, is a real sign-out", async () => {
    const read = vi.fn(async () => null);
    expect(await resilientSession(src({ read, valid: async () => false }), [1, 1], nap)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a lookup that failed once is tried again and the person stays signed in", async () => {
    const read = vi.fn<() => Promise<S | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(me);
    expect(await resilientSession(src({ read }), [1, 1, 1], nap)).toBe(me);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("when the database does not answer at all, nobody is signed out: the request fails honestly", async () => {
    const valid = vi.fn().mockRejectedValue(new Error("Can't reach database server"));
    await expect(resilientSession(src({ valid }), [1, 1], nap)).rejects.toThrow(/could not be read/);
  });

  it("when the database confirms the session but the lookup keeps failing, it fails honestly too", async () => {
    const read = vi.fn(async () => null);
    await expect(resilientSession(src({ read }), [1, 1], nap)).rejects.toThrow(/could not be read/);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
