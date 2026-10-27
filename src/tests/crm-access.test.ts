import { describe, expect, it } from "vitest";
import { crmLevel, levelFields, personalLevel, poolReach, reachOf, teamGrant, type ContactLink } from "@/modules/crm/access";
import { can } from "@/server/policies";

describe("the CRM level of a member", () => {
  it("owners and admins always see everything; a member goes by the flag and the scope; guests and clients see nothing", () => {
    expect(crmLevel({ role: "OWNER", crmAccess: false })).toBe("ALL");
    expect(crmLevel({ role: "ADMIN", crmAccess: false, crmScope: "OWN" })).toBe("ALL");
    expect(crmLevel({ role: "MEMBER", crmAccess: false, crmScope: "ALL" })).toBe("NONE");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "OWN" })).toBe("OWN");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "TEAM" })).toBe("TEAM");
    expect(crmLevel({ role: "MEMBER", crmAccess: true })).toBe("ALL");
    expect(crmLevel({ role: "GUEST", crmAccess: true })).toBe("NONE");
    expect(crmLevel({ role: "CLIENT", crmAccess: true })).toBe("NONE");
  });
  it("a level is stored as the flag and the scope", () => {
    expect(levelFields("NONE")).toEqual({ crmAccess: false, crmScope: "ALL" });
    expect(levelFields("OWN")).toEqual({ crmAccess: true, crmScope: "OWN" });
    expect(levelFields("ALL")).toEqual({ crmAccess: true, crmScope: "ALL" });
  });
  it("the policies follow: a scoped member reads and writes people but not deals, companies, exports or merges", () => {
    for (const crmScope of ["OWN", "TEAM"] as const) {
      const a = { role: "MEMBER" as const, crmAccess: true, crmScope };
      expect(can(a, "crm:read")).toBe(true);
      expect(can(a, "crm:write")).toBe(true);
      expect(can(a, "crm:full")).toBe(false);
      expect(can(a, "crm:export")).toBe(false);
      expect(can(a, "crm:merge")).toBe(false);
    }
    const all = { role: "MEMBER" as const, crmAccess: true, crmScope: "ALL" as const };
    expect(can(all, "crm:full") && can(all, "crm:export") && can(all, "crm:merge")).toBe(true);
    expect(can({ role: "ADMIN", crmAccess: false, crmScope: "OWN" }, "crm:full")).toBe(true);
    expect(can({ role: "MEMBER", crmAccess: false }, "crm:full")).toBe(false);
  });
});

describe("whose people a scoped member reaches", () => {
  // top (u1) > mid (u2) > low (u3); other (u4) is a separate line; a plain person is brought through mid.
  const links: ContactLink[] = [
    { id: "top", sponsorId: null, linkedUserId: "u1" },
    { id: "mid", sponsorId: "top", linkedUserId: "u2" },
    { id: "low", sponsorId: "mid", linkedUserId: "u3" },
    { id: "plain", sponsorId: "mid", linkedUserId: null },
    { id: "other", sponsorId: null, linkedUserId: "u4" },
  ];
  it("own: the member and their own partner card", () => {
    expect(reachOf("OWN", "u2", links)).toEqual({ userIds: ["u2"], partnerIds: ["mid"], lineIds: [] });
    expect(reachOf("OWN", "nobody", links)).toEqual({ userIds: ["nobody"], partnerIds: [], lineIds: [] });
  });
  it("team: the whole line below, with the accounts in it, never the line above or beside", () => {
    const r = reachOf("TEAM", "u2", links);
    expect(r.userIds.sort()).toEqual(["u2", "u3"]);
    expect(r.partnerIds.sort()).toEqual(["low", "mid", "plain"]);
    expect(r.lineIds.sort()).toEqual(["low", "mid", "plain"]);
    expect(reachOf("TEAM", "u3", links).partnerIds).toEqual(["low"]);
  });
  it("team without a partner card is just the member", () => {
    expect(reachOf("TEAM", "u9", links)).toEqual({ userIds: ["u9"], partnerIds: [], lineIds: [] });
  });
});

describe("what hand-made teams add", () => {
  it("a team grant is the best of the teams' settings", () => {
    expect(teamGrant([])).toBeNull();
    expect(teamGrant([null, null])).toBeNull();
    expect(teamGrant([null, "TEAM"])).toBe("TEAM");
    expect(teamGrant(["TEAM", "ALL", null])).toBe("ALL");
  });
  it("the level is the better of the personal one and the team one; a team can open the CRM to a member who had none", () => {
    expect(crmLevel({ role: "MEMBER", crmAccess: false, teamScope: "TEAM" })).toBe("TEAM");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "OWN", teamScope: "TEAM" })).toBe("TEAM");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "TEAM", teamScope: "TEAM" })).toBe("TEAM");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "OWN", teamScope: "ALL" })).toBe("ALL");
    expect(crmLevel({ role: "MEMBER", crmAccess: true, crmScope: "ALL", teamScope: null })).toBe("ALL");
    expect(crmLevel({ role: "GUEST", crmAccess: false, teamScope: "ALL" })).toBe("NONE");
    expect(personalLevel({ role: "MEMBER", crmAccess: false, teamScope: "ALL" })).toBe("NONE");
  });
  it("the policies follow the team grant", () => {
    expect(can({ role: "MEMBER", crmAccess: false, teamScope: "TEAM" }, "crm:write")).toBe(true);
    expect(can({ role: "MEMBER", crmAccess: false, teamScope: "TEAM" }, "crm:full")).toBe(false);
    expect(can({ role: "MEMBER", crmAccess: false, teamScope: "ALL" }, "crm:full")).toBe(true);
  });
  it("a team pool is the members' accounts and their partner cards", () => {
    const links: ContactLink[] = [
      { id: "a", sponsorId: null, linkedUserId: "u1" },
      { id: "b", sponsorId: "a", linkedUserId: "u2" },
      { id: "c", sponsorId: null, linkedUserId: "u3" },
    ];
    expect(poolReach(links, ["u1", "u2"])).toEqual({ userIds: ["u1", "u2"], partnerIds: ["a", "b"] });
    expect(poolReach(links, [])).toEqual({ userIds: [], partnerIds: [] });
  });
});
