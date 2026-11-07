import { describe, expect, it } from "vitest";
import { hasTeamAccess, teamAccessReason, type ChainLink } from "@/modules/plans/team-access";

const link = (id: string, referredById: string | null, teamAccess: string | null = null): ChainLink => ({ id, email: `${id}@x.io`, teamAccess, referredById });
const roots = ["boss@x.io"];

describe("team access by the chain of invitations", () => {
  it("brought by the owner, or by someone the owner brought, at any depth: free", () => {
    expect(hasTeamAccess([link("anna", "boss"), link("boss", null)], roots)).toBe(true);
    expect(hasTeamAccess([link("bob", "anna"), link("anna", "boss"), link("boss", null)], roots)).toBe(true);
  });
  it("found the site alone: not in the team", () => {
    expect(hasTeamAccess([link("carl", null)], roots)).toBe(false);
    expect(hasTeamAccess([link("dina", "carl"), link("carl", null)], roots)).toBe(false);
  });
  it("switched off by hand cuts the branch below; a person switched on by hand below stays free", () => {
    expect(hasTeamAccess([link("bob", "anna"), link("anna", "boss", "OFF"), link("boss", null)], roots)).toBe(false);
    expect(hasTeamAccess([link("bob", "anna", "ON"), link("anna", "boss", "OFF"), link("boss", null)], roots)).toBe(true);
    expect(hasTeamAccess([link("carl", null, "ON")], roots)).toBe(true);
  });
  it("a loop in the chain is not the team", () => {
    expect(hasTeamAccess([link("a", "b"), link("b", "a"), link("a", "b")], roots)).toBe(false);
  });
  it("the reason shown to the owner", () => {
    expect(teamAccessReason([link("boss", null)], roots)).toBe("owner");
    expect(teamAccessReason([link("anna", "boss"), link("boss", null)], roots)).toBe("chain");
    expect(teamAccessReason([link("anna", "boss", "OFF"), link("boss", null)], roots)).toBe("off");
    expect(teamAccessReason([link("carl", null)], roots)).toBe("none");
  });
});
