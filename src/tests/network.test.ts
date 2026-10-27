import { describe, expect, it } from "vitest";
import { buildNetwork, ROOT_ID, type NetGroup, type NetPerson } from "@/modules/crm/network";

const p = (id: string, extra: Partial<NetPerson> = {}): NetPerson => ({ id, name: id.toUpperCase(), stage: "NEW", temperature: null, sponsorId: null, heldById: null, groupId: null, influence: null, country: null, typeTag: null, ...extra });
const people = [
  p("top", { stage: "PARTNER" }),
  p("mid", { stage: "PARTNER", sponsorId: "top" }),
  p("low", { stage: "PARTNER", sponsorId: "mid" }),
  p("anna", { sponsorId: "mid", groupId: "g2", heldById: "low" }),
  p("boris", { sponsorId: "top", groupId: "g1" }),
  p("clara", { groupId: "g2" }),
  p("dima"),
];
const groups: NetGroup[] = [
  { id: "g1", parentId: null, name: "Cold", color: "#00f", position: 0 },
  { id: "g2", parentId: "g1", name: "Gym", color: null, position: 0 },
];
const tree = (mode: Parameters<typeof buildNetwork>[0], showPeople = true, ps = people) => {
  const nodes = buildNetwork(mode, { rootName: "Me", people: ps, groups }, { showPeople });
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
};

describe("network map", () => {
  it("by sponsors: partners under their sponsors, people under the one who brought them, the rest under a made-up node", () => {
    const t = tree("sponsors");
    expect(t[ROOT_ID]).toMatchObject({ kind: "root", title: "Me", direct: 1, branch: 7 });
    expect(t.top).toMatchObject({ parentId: ROOT_ID, kind: "partner", direct: 2, branch: 4 });
    expect(t.mid?.parentId).toBe("top");
    expect(t.low?.parentId).toBe("mid");
    expect(t.anna?.parentId).toBe("mid");
    expect(t.boris?.parentId).toBe("top");
    expect(t.clara?.parentId).toBe("net-no-sponsor");
    expect(t.dima?.parentId).toBe("net-no-sponsor");
    expect(t["net-no-sponsor"]).toMatchObject({ kind: "group", synthetic: "noSponsor", direct: 2 });
  });

  it("without people only the partners are drawn", () => {
    const t = tree("sponsors", false);
    expect(Object.keys(t).sort()).toEqual([ROOT_ID, "low", "mid", "top"].sort());
  });

  it("a partner whose sponsor is not a partner climbs to the nearest partner above, a loop ends the climb", () => {
    const t = tree("sponsors", true, [p("a", { stage: "PARTNER" }), p("x", { sponsorId: "a" }), p("b", { stage: "PARTNER", sponsorId: "x" }), p("l1", { stage: "PARTNER", sponsorId: "l2" }), p("l2", { stage: "PARTNER", sponsorId: "l1" })]);
    expect(t.b?.parentId).toBe("a");
    const up = (id: string) => {
      const seen = new Set<string>();
      for (let cur: string | null | undefined = id; cur && cur !== ROOT_ID; cur = t[cur]?.parentId) {
        if (seen.has(cur)) return false;
        seen.add(cur);
      }
      return true;
    };
    expect(up("l1")).toBe(true);
    expect(up("l2")).toBe(true);
  });

  it("by groups: the group tree with people in their groups and the ungrouped under a made-up node", () => {
    const t = tree("groups");
    expect(t.g1).toMatchObject({ parentId: ROOT_ID, kind: "group", color: "#00f", branch: 3, direct: 1 });
    expect(t.g2).toMatchObject({ parentId: "g1", branch: 2 });
    expect(t.anna?.parentId).toBe("g2");
    expect(t.boris?.parentId).toBe("g1");
    expect(t["net-no-group"]).toMatchObject({ synthetic: "noGroup", direct: 4 });
    expect(t.top?.parentId).toBe("net-no-group");
  });

  it("by who works with whom: partners side by side, each with the people they hold", () => {
    const t = tree("held");
    expect(t.top?.parentId).toBe(ROOT_ID);
    expect(t.mid?.parentId).toBe(ROOT_ID);
    expect(t.anna?.parentId).toBe("low");
    expect(t.boris?.parentId).toBe("net-nobody");
    expect(t.low).toMatchObject({ direct: 1, branch: 1 });
  });

  it("a person is never their own ancestor and every parent exists", () => {
    for (const mode of ["sponsors", "groups", "held"] as const) {
      const nodes = Object.values(tree(mode));
      const ids = new Set(nodes.map((n) => n.id));
      expect(nodes.length).toBe(new Set(nodes.map((n) => n.id)).size);
      for (const n of nodes) if (n.parentId) expect(ids.has(n.parentId)).toBe(true);
    }
  });
});
