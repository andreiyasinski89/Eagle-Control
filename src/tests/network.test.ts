import { describe, expect, it } from "vitest";
import { buildNetwork, filterPeople, NO_FILTERS, ROOT_ID, type NetGroup, type NetPerson } from "@/modules/crm/network";

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

  describe("my own card", () => {
    const mine = [p("me", { stage: "PARTNER" }), p("lead", { stage: "PARTNER", sponsorId: "me" }), p("friend", { sponsorId: "me" }), p("client", { heldById: "me" }), p("stranger")];
    const nodes = (mode: Parameters<typeof buildNetwork>[0]) => Object.fromEntries(buildNetwork(mode, { rootName: "Me", people: mine, groups, selfId: "me" }, { showPeople: true }).map((n) => [n.id, n]));

    it("is not drawn: the root stands for it, and whoever it sponsors hangs from the root", () => {
      const t = nodes("sponsors");
      expect(t.me).toBeUndefined();
      expect(t.lead?.parentId).toBe(ROOT_ID);
      expect(t.friend?.parentId).toBe(ROOT_ID);
      expect(t.stranger?.parentId).toBe("net-no-sponsor");
      expect(t["net-no-sponsor"]).toMatchObject({ direct: 2 }); // the stranger and the client, who has no sponsor
    });

    it("is the middle of the map for who works with whom too", () => {
      const t = nodes("held");
      expect(t.client?.parentId).toBe(ROOT_ID);
      expect(t.stranger?.parentId).toBe("net-nobody");
    });

    it("counts as a sponsor when people without one are hidden", () => {
      const kept = filterPeople(mine, { ...NO_FILTERS, hideNoSponsor: true }, "me").map((x) => x.id).sort();
      expect(kept).toEqual(["friend", "lead", "me"]); // "client" and "stranger" have no sponsor
    });
  });

  describe("filters and sides", () => {
    const ids = (xs: NetPerson[]) => xs.map((x) => x.id).sort();

    it("hiding people without a sponsor keeps the head of a structure and drops the loners", () => {
      const kept = filterPeople(people, { ...NO_FILTERS, hideNoSponsor: true });
      expect(ids(kept)).toEqual(["anna", "boris", "low", "mid", "top"]); // "top" has no sponsor but sponsors others
    });

    it("stage and warmth narrow the people, never the partners", () => {
      const ps = [p("a", { stage: "PARTNER" }), p("b", { stage: "CLIENT", temperature: "HOT" }), p("c", { stage: "NEW", temperature: "HOT" }), p("d", { stage: "CLIENT", temperature: "COLD" })];
      expect(ids(filterPeople(ps, { ...NO_FILTERS, stage: "CLIENT" }))).toEqual(["a", "b", "d"]);
      expect(ids(filterPeople(ps, { ...NO_FILTERS, temperature: "HOT" }))).toEqual(["a", "b", "c"]);
    });

    it("split sides: the working structure goes left, people without a sponsor and lone partners go right", () => {
      const ps = [...people, p("solo", { stage: "PARTNER" })];
      const nodes = buildNetwork("sponsors", { rootName: "Me", people: ps, groups }, { showPeople: true, split: true });
      const t = Object.fromEntries(nodes.map((n) => [n.id, n]));
      expect(t.top?.side).toBe("left");
      expect(t.low?.side).toBe("left"); // below mid, below top
      expect(t.anna?.side).toBe("left");
      expect(t.solo?.side).toBe("right");
      expect(t["net-no-sponsor"]?.side).toBe("right");
      expect(t.clara?.side).toBe("right");
      expect(t[ROOT_ID]?.side).toBeUndefined();
    });

    it("without split nothing has a side", () => {
      const nodes = buildNetwork("sponsors", { rootName: "Me", people, groups }, { showPeople: true });
      expect(nodes.every((n) => n.side === undefined)).toBe(true);
    });

    it("a level limit cuts the tree but the cut cards keep their real counts", () => {
      const nodes = buildNetwork("sponsors", { rootName: "Me", people, groups }, { showPeople: false, maxDepth: 2 });
      const t = Object.fromEntries(nodes.map((n) => [n.id, n]));
      expect(Object.keys(t).sort()).toEqual([ROOT_ID, "mid", "top"].sort()); // "low" is the third level
      expect(t.mid).toMatchObject({ direct: 1 }); // "low" is still counted
    });
  });
});
