import { describe, expect, it } from "vitest";
import { dueForErasure, planErasure, tombstoneEmail, type Role, type WorkspaceFacts } from "@/modules/account/erasure";

const others = (o: Partial<Record<Role, number>> = {}) => ({ OWNER: 0, ADMIN: 0, MEMBER: 0, GUEST: 0, CLIENT: 0, ...o });
const ws = (name: string, role: Role, o: Partial<Record<Role, number>> = {}): WorkspaceFacts => ({ workspaceId: `id-${name}`, name, role, others: others(o) });

describe("what erasing an account does to each workspace", () => {
  it("lets a member, admin or guest simply leave", () => {
    const p = planErasure([ws("a", "MEMBER", { OWNER: 1 }), ws("b", "ADMIN", { OWNER: 1 }), ws("c", "GUEST", { OWNER: 1 }), ws("d", "CLIENT", { OWNER: 1 })]);
    expect(p.leaves.map((l) => l.name)).toEqual(["a", "b", "c", "d"]);
    expect(p.blockers).toEqual([]);
    expect(p.willDelete).toEqual([]);
  });

  it("lets an owner leave when another owner remains", () => {
    expect(planErasure([ws("a", "OWNER", { OWNER: 1, MEMBER: 5 })]).leaves).toHaveLength(1);
  });

  it("stops a sole owner whose team would be left without one", () => {
    const p = planErasure([ws("team", "OWNER", { MEMBER: 2, ADMIN: 1 })]);
    expect(p.blockers).toEqual([{ workspaceId: "id-team", name: "team", candidates: 3 }]);
    expect(p.leaves).toEqual([]);
  });

  it("stops a sole owner even if only an admin remains, and counts who could take over", () => {
    expect(planErasure([ws("t", "OWNER", { ADMIN: 1 })]).blockers[0]!.candidates).toBe(1);
  });

  it("deletes a workspace nobody on the team is left in, and says how many clients lose access", () => {
    const p = planErasure([ws("solo", "OWNER"), ws("withclients", "OWNER", { CLIENT: 3, GUEST: 1 })]);
    expect(p.willDelete).toEqual([{ workspaceId: "id-solo", name: "solo", clients: 0 }, { workspaceId: "id-withclients", name: "withclients", clients: 4 }]);
    expect(p.blockers).toEqual([]);
  });

  it("handles a mix and the empty case", () => {
    const p = planErasure([ws("solo", "OWNER"), ws("team", "OWNER", { MEMBER: 1 }), ws("other", "MEMBER", { OWNER: 1 })]);
    expect([p.willDelete.length, p.blockers.length, p.leaves.length]).toEqual([1, 1, 1]);
    expect(planErasure([])).toEqual({ blockers: [], willDelete: [], leaves: [] });
  });
});

describe("the grace period and the anonymous address", () => {
  const t0 = new Date("2026-11-01T10:00:00Z");
  it("is due exactly when the days have passed", () => {
    expect(dueForErasure(t0, 7, new Date("2026-11-08T09:59:59Z"))).toBe(false);
    expect(dueForErasure(t0, 7, new Date("2026-11-08T10:00:00Z"))).toBe(true);
    expect(dueForErasure(t0, 0, t0)).toBe(true);
  });
  it("gives each erased person a unique, unreachable address that does not contain the old one", () => {
    expect(tombstoneEmail("abc")).toBe("deleted-abc@deleted.invalid");
    expect(tombstoneEmail("a")).not.toBe(tombstoneEmail("b"));
    expect(tombstoneEmail("abc")).toMatch(/\.invalid$/);
  });
});
