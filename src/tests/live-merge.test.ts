import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/features/mindmap/store";
import { peopleOn, usePresenceStore } from "@/features/realtime/presence-store";
import type { ClientNode, TreePayload } from "@/features/mindmap/types";
import type { PresenceUser } from "@/server/realtime";

const node = (id: string, over: Partial<ClientNode> = {}): ClientNode => ({
  id,
  parentId: id === "root" ? null : "root",
  type: id === "root" ? "PROJECT" : "TASK",
  title: id,
  status: "TODO",
  progress: 0,
  progressMode: "AUTO",
  health: "GREEN",
  healthOverride: null,
  position: 1,
  startDate: null,
  dueDate: null,
  estimation: null,
  assigneeId: null,
  collapsed: false,
  visibleToClient: true,
  tagIds: [],
  blocked: false,
  ...over,
});

const payload = (nodes: ClientNode[]): TreePayload => ({
  project: { id: "root", workspaceId: "w", title: "P", data: {} },
  nodes,
  people: [],
  role: "MEMBER",
  meId: "me",
  serverTime: new Date().toISOString(),
});

describe("merging another person's changes", () => {
  beforeEach(() => {
    useMapStore.getState().setTree(payload([node("root"), node("a"), node("b"), node("c")]));
    useMapStore.getState().setEditing(null);
  });

  it("takes their edits, additions and removals", () => {
    useMapStore.getState().mergeRemote(payload([node("root"), node("a", { title: "renamed by them" }), node("b", { status: "DONE" }), node("d")]));
    const s = useMapStore.getState().nodes;
    expect(s.a?.title).toBe("renamed by them");
    expect(s.b?.status).toBe("DONE");
    expect(s.c).toBeUndefined();
    expect(s.d).toBeDefined();
  });

  it("leaves the node I am typing in exactly as I have it", () => {
    const store = useMapStore.getState();
    store.setEditing("a");
    store.patchLocal("a", { title: "half-typed" });
    store.mergeRemote(payload([node("root"), node("a", { title: "their title" }), node("b", { title: "their b" }), node("c")]));
    const s = useMapStore.getState().nodes;
    expect(s.a?.title).toBe("half-typed");
    expect(s.b?.title).toBe("their b");
  });

  it("drops focus on a node that disappeared and keeps it on one that did not", () => {
    useMapStore.getState().setFocus("c");
    useMapStore.getState().mergeRemote(payload([node("root"), node("a"), node("b")]));
    expect(useMapStore.getState().focusId).toBeNull();
    useMapStore.getState().setFocus("a");
    useMapStore.getState().mergeRemote(payload([node("root"), node("a"), node("b")]));
    expect(useMapStore.getState().focusId).toBe("a");
  });
});

describe("presence on the client", () => {
  const user = (connId: string, userId: string, over: Partial<PresenceUser> = {}): PresenceUser => ({ connId, userId, name: userId, color: "#000", selectedNodeId: null, editingNodeId: null, cursor: null, updatedAt: 0, ...over });
  beforeEach(() => usePresenceStore.getState().clear());

  it("never lists my own connection and forgets people who leave", () => {
    const p = usePresenceStore.getState();
    p.sync([user("mine", "me"), user("c1", "ann")], "mine");
    expect(Object.keys(usePresenceStore.getState().others)).toEqual(["c1"]);
    p.upsert(user("c2", "bob"));
    p.leave("c1");
    p.leave("never-there");
    expect(Object.keys(usePresenceStore.getState().others)).toEqual(["c2"]);
  });

  it("stamps arrivals with the local clock, whatever the server clock says", () => {
    usePresenceStore.getState().upsert(user("c1", "ann", { updatedAt: 1 }));
    expect(Date.now() - (usePresenceStore.getState().others.c1?.updatedAt ?? 0)).toBeLessThan(1000);
  });

  it("tells who is looking at a node and who is editing it", () => {
    const others = { a: user("a", "ann", { selectedNodeId: "n1" }), b: user("b", "bob", { selectedNodeId: "n1", editingNodeId: "n1" }), c: user("c", "cat", { selectedNodeId: "n2" }) };
    const on = peopleOn(others, "n1");
    expect(on.viewers.map((u) => u.userId)).toEqual(["ann"]);
    expect(on.editors.map((u) => u.userId)).toEqual(["bob"]);
    expect(peopleOn(others, "n3")).toEqual({ viewers: [], editors: [] });
  });
});
