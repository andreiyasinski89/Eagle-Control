import type { NodeType } from "@prisma/client";
import type { BatchOp } from "@/server/services/nodes/batch";
import type { PatchNodeInput } from "@/modules/nodes/schemas";
import { canNest, isCounting, whyCannotMove } from "@/modules/nodes/node-rules";
import { api as rawApi, ApiFailure } from "./api";
import { History } from "./history";
import { useMapStore } from "./store";
import { rowToClient, type Change, type ClientNode, type NodeRow, type TreePayload } from "./types";
import { descendantsOf, indexChildren } from "./visibility";

/** Local writes still travelling to the server. Remote refreshes wait for them so they cannot overwrite an optimistic change. */
let inflight = 0;
const tracked = async <T>(p: Promise<T>): Promise<T> => {
  inflight++;
  try {
    return await p;
  } finally {
    inflight--;
  }
};
const api = {
  get: rawApi.get,
  post: <T>(url: string, body?: unknown) => tracked(rawApi.post<T>(url, body)),
  patch: <T>(url: string, body: unknown) => tracked(rawApi.patch<T>(url, body)),
  put: <T>(url: string, body: unknown) => tracked(rawApi.put<T>(url, body)),
  del: <T>(url: string) => tracked(rawApi.del<T>(url)),
};

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * Someone else changed the project: re-read it and merge, without touching what I am doing right now.
 * Debounced, and postponed while any write of mine is in flight; the node I am typing in is kept as it is.
 */
export function scheduleRemoteRefresh(delay = 250): void {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (inflight > 0) return scheduleRemoteRefresh(300);
    const id = state().projectId;
    if (!id) return;
    try {
      const payload = await rawApi.get<TreePayload>(`/api/v1/projects/${id}/tree`);
      if (inflight > 0) return scheduleRemoteRefresh(300); // a local write started while we were reading: this snapshot may predate it
      if (state().projectId === id) state().mergeRemote(payload);
    } catch {
      /* offline or no access any more: the next event or reconnect tries again */
    }
  }, delay);
}

/** One history per open project; swapped when the project changes. */
let history = new History<BatchOp>();
let historyProject: string | null = null;

const state = () => useMapStore.getState();

function syncFlags(): void {
  state().setHistoryFlags(history.canUndo, history.canRedo);
}

export function resetHistoryFor(projectId: string): void {
  if (historyProject !== projectId) {
    history = new History<BatchOp>();
    historyProject = projectId;
    syncFlags();
  }
}

function fail(err: unknown): void {
  const message = err instanceof ApiFailure ? err.message : "Something went wrong";
  state().setNotice(message);
  void reload();
}

/** Re-reads the whole tree from the server (the source of truth). */
export async function reload(): Promise<void> {
  const id = state().projectId;
  if (!id) return;
  const payload = await api.get<TreePayload>(`/api/v1/projects/${id}/tree`);
  state().setTree(payload);
}

type Patchable = keyof PatchNodeInput & keyof ClientNode;

function snapshot(node: ClientNode, keys: readonly Patchable[]): Partial<PatchNodeInput> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = node[k];
  return out as Partial<PatchNodeInput>;
}

/** Optimistic field update + server write + history entry. */
export async function updateNode(id: string, patch: Partial<PatchNodeInput>, opts: { record?: boolean } = {}): Promise<void> {
  const s = state();
  const before = s.nodes[id];
  if (!before) return;

  const keys = Object.keys(patch).filter((k): k is Patchable => k in before);
  const prior = keys.slice();
  // DONE implies 100% on leaves, so undoing a status change must restore progress too.
  if (patch.status !== undefined && !prior.includes("progress")) prior.push("progress");
  const undoPatch = snapshot(before, prior);

  const local: Partial<ClientNode> = {};
  for (const k of keys) (local as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
  if (patch.status === "DONE") local.progress = 100;
  s.patchLocal(id, local);
  s.recomputeLocal();

  try {
    const res = await api.patch<{ node: NodeRow; changes: Change[] }>(`/api/v1/nodes/${id}`, patch);
    state().patchLocal(id, { position: res.node.position });
    state().applyChanges(res.changes);
    const onlyUiState = keys.every((k) => k === "collapsed");
    if (opts.record !== false && !onlyUiState) {
      history.push({
        label: `update ${keys.join(",")}`,
        undo: [{ op: "patch", id, patch: undoPatch as PatchNodeInput }],
        redo: [{ op: "patch", id, patch: patch as PatchNodeInput }],
      });
      syncFlags();
    }
  } catch (err) {
    fail(err);
  }
}

export const rename = (id: string, title: string) => {
  const t = title.trim();
  return t && t !== state().nodes[id]?.title ? updateNode(id, { title: t }) : Promise.resolve();
};

export function toggleCollapsed(id: string): Promise<void> {
  const n = state().nodes[id];
  return n ? updateNode(id, { collapsed: !n.collapsed }) : Promise.resolve();
}

export async function createChild(
  parentId: string,
  type: NodeType,
  title: string,
  opts: { afterId?: string } = {},
): Promise<string | null> {
  const parent = state().nodes[parentId];
  if (!parent || !canNest(parent.type, type)) return null;
  try {
    const res = await api.post<{ node: NodeRow; changes: Change[] }>("/api/v1/nodes", {
      parentId,
      type,
      title,
      afterId: opts.afterId ?? null,
    });
    const node = rowToClient(res.node);
    state().upsert(node);
    if (parent.collapsed) state().patchLocal(parentId, { collapsed: false });
    state().applyChanges(res.changes);
    state().recomputeLocal();
    if (parent.collapsed) void api.patch(`/api/v1/nodes/${parentId}`, { collapsed: false }).catch(() => undefined);
    history.push({
      label: "create",
      undo: [{ op: "archive", id: node.id }],
      redo: [{ op: "restore", id: node.id }],
    });
    syncFlags();
    state().setEditing(node.id);
    return node.id;
  } catch (err) {
    fail(err);
    return null;
  }
}

/** Why a drop of `id` under `targetId` is not allowed (null = fine). Shared by drag hints and the move itself. */
export function moveDenial(id: string, targetId: string): string | null {
  const { nodes } = state();
  const node = nodes[id];
  const target = nodes[targetId];
  if (!node || !target) return "missing";
  const childrenOf = indexChildren(Object.values(nodes));
  const below = new Set(descendantsOf(childrenOf, id).map((d) => d.id));
  const chain: string[] = [];
  for (let cur: ClientNode | undefined = target; cur && chain.length < 64; cur = cur.parentId ? nodes[cur.parentId] : undefined) {
    chain.push(cur.id);
  }
  const sameProject = true; // the whole tree on screen is one project
  const reason = whyCannotMove(
    { id: node.id, type: node.type, workspaceId: "w", parentId: node.parentId },
    { id: target.id, type: target.type, workspaceId: "w", parentId: target.parentId },
    chain,
    sameProject,
  );
  return reason ?? (below.has(targetId) ? "cycle" : null);
}

export async function moveNode(
  id: string,
  parentId: string,
  where: { afterId?: string | null; beforeId?: string | null } = {},
): Promise<void> {
  const { nodes } = state();
  const node = nodes[id];
  if (!node) return;
  const reason = moveDenial(id, parentId);
  if (reason) {
    state().setNotice(`Cannot move here (${reason.replaceAll("_", " ")})`);
    return;
  }

  const sibs = indexChildren(Object.values(nodes)).get(node.parentId ?? "") ?? [];
  const at = sibs.findIndex((x) => x.id === id);
  const prevAfter = sibs[at - 1]?.id ?? null;
  const prevBefore = sibs[at + 1]?.id ?? null;
  const prevParent = node.parentId;
  if (!prevParent) return;

  try {
    const res = await api.post<{ node: NodeRow; changes: Change[] }>(`/api/v1/nodes/${id}/move`, {
      parentId,
      ...where,
    });
    state().patchLocal(id, { parentId: res.node.parentId, position: res.node.position });
    state().applyChanges(res.changes);
    state().recomputeLocal();
    history.push({
      label: "move",
      undo: [{ op: "move", id, move: { parentId: prevParent, afterId: prevAfter, beforeId: prevAfter ? null : prevBefore } }],
      redo: [{ op: "move", id, move: { parentId, ...where } }],
    });
    syncFlags();
  } catch (err) {
    fail(err);
  }
}

export async function archiveNode(id: string): Promise<void> {
  const node = state().nodes[id];
  if (!node || node.parentId === null) return; // the project itself is archived from the projects list
  try {
    const res = await api.del<{ ids: string[]; changes: Change[] }>(`/api/v1/nodes/${id}`);
    state().removeIds(res.ids);
    state().applyChanges(res.changes);
    state().recomputeLocal();
    history.push({ label: "archive", undo: [{ op: "restore", id }], redo: [{ op: "archive", id }] });
    syncFlags();
  } catch (err) {
    fail(err);
  }
}

export async function completeNode(id: string): Promise<void> {
  const { nodes } = state();
  const node = nodes[id];
  if (!node) return;
  const childrenOf = indexChildren(Object.values(nodes));
  const affected = [node, ...descendantsOf(childrenOf, id)].filter((n) => isCounting(n.type));
  const undo: BatchOp[] = affected.map((n) => {
    const container = (childrenOf.get(n.id) ?? []).some((c) => isCounting(c.type)) && !(n.type === "TASK" && n.progressMode === "MANUAL");
    return {
      op: "patch" as const,
      id: n.id,
      patch: (container ? { status: n.status } : { status: n.status, progress: n.progress }) as PatchNodeInput,
    };
  });
  for (const n of affected) state().patchLocal(n.id, { status: "DONE", progress: 100 });
  state().recomputeLocal();
  try {
    const res = await api.post<{ node: NodeRow; changes: Change[] }>(`/api/v1/nodes/${id}/complete`);
    state().applyChanges(res.changes);
    history.push({ label: "complete", undo, redo: [{ op: "complete", id }] });
    syncFlags();
  } catch (err) {
    fail(err);
  }
}

/** The server takes up to 100 steps at a time, each batch all or nothing. */
const BATCH = 100;

async function applyOps(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH) await api.post("/api/v1/nodes/batch", { ops: ops.slice(i, i + BATCH) });
  await reload();
}

/**
 * Gives many tasks new dates in one go (the smart sort). The screen shows them at once; one undo puts every date back.
 * `dates` are YYYY-MM-DD days.
 */
export async function rescheduleNodes(moves: readonly { id: string; start: string; due: string }[]): Promise<boolean> {
  const { nodes } = state();
  const todo = moves.filter((m) => nodes[m.id]);
  if (todo.length === 0) return true;
  const day = (d: string) => `${d.slice(0, 10)}T00:00:00.000Z`;
  const redo: BatchOp[] = todo.map((m) => ({ op: "patch" as const, id: m.id, patch: { startDate: day(m.start), dueDate: day(m.due) } as PatchNodeInput }));
  const undo: BatchOp[] = todo.map((m) => {
    const n = nodes[m.id] as ClientNode;
    return { op: "patch" as const, id: m.id, patch: { startDate: n.startDate, dueDate: n.dueDate } as PatchNodeInput };
  });
  for (const m of todo) state().patchLocal(m.id, { startDate: day(m.start), dueDate: day(m.due) });
  state().recomputeLocal();
  try {
    await applyOps(redo);
    history.push({ label: "smart sort", undo, redo });
    syncFlags();
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

export async function undo(): Promise<void> {
  try {
    await history.undo(applyOps);
  } catch (err) {
    fail(err);
  }
  syncFlags();
}

export async function redo(): Promise<void> {
  try {
    await history.redo(applyOps);
  } catch (err) {
    fail(err);
  }
  syncFlags();
}
