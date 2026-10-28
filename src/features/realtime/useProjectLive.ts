"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { scheduleRemoteRefresh } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { hub, type HubEvent } from "./hub";
import { usePresenceStore } from "./presence-store";

/** True while the person is typing in the drawer: their field must not be rebuilt under them. */
const typingInDrawer = () => {
  const a = document.activeElement;
  return !!a && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) && !!a.closest("[data-testid=drawer]");
};

/** Invalidates now, or after the field loses focus when the person is typing in the drawer. */
function invalidateWhenIdle(qc: QueryClient, keys: readonly (readonly unknown[])[]): void {
  const run = () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [...k] }));
  if (!typingInDrawer()) return run();
  document.addEventListener("focusout", () => setTimeout(run, 50), { once: true });
}

/**
 * Keeps an open project live: other people's changes refresh the map and the open node, comments appear as they are
 * written, and my selection, editing state and pointer are shared as presence.
 */
export function useProjectLive(projectId: string): void {
  const qc = useQueryClient();
  const meId = useMapStore((s) => s.meId);
  const titleEditing = useMapStore((s) => s.editingId);
  const drawerEditing = usePresenceStore((s) => s.editing);
  const editingId = titleEditing ?? drawerEditing;
  const { selectedId } = useSelection();
  const room = `project:${projectId}`;
  const latest = useRef({ selectedId, editingId });
  latest.current = { selectedId, editingId };

  // Incoming
  useEffect(() => {
    const presence = usePresenceStore.getState();
    presence.clear();
    const refresh = () => {
      scheduleRemoteRefresh();
      const open = new URLSearchParams(window.location.search).get("node");
      invalidateWhenIdle(qc, [["agile-metrics", projectId], ...(open ? [["node", open], ["activity", open], ["time", open]] : [])]);
    };
    const off = hub.subscribe([room], (e: HubEvent) => {
      switch (e.type) {
        case "tree.changed":
          if (e.actorId !== meId) refresh();
          break;
        case "comment.added":
          if (e.actorId !== meId) invalidateWhenIdle(qc, [["comments", e.nodeId], ["activity", e.nodeId]]);
          break;
        case "reconnected":
          refresh();
          void qc.invalidateQueries({ queryKey: ["comments"] });
          break;
        case "ready":
          hub.sendPresence(room, { selectedNodeId: latest.current.selectedId, editingNodeId: latest.current.editingId, cursor: usePresenceStore.getState().cursor });
          break;
        case "presence.sync":
          presence.sync(e.users, hub.connId, meId);
          break;
        case "presence":
          if (e.user.connId !== hub.connId) presence.upsert(e.user, meId);
          break;
        case "presence.leave":
          presence.leave(e.connId);
          break;
        default:
      }
    });
    // Forget people whose heartbeat stopped (closed laptop, lost network) without waiting for the server's leave event.
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const u of Object.values(usePresenceStore.getState().others)) if (now - u.updatedAt > 60_000) presence.leave(u.connId);
    }, 15_000);
    return () => {
      off();
      clearInterval(sweep);
      presence.clear();
    };
  }, [room, projectId, meId, qc]);

  // Outgoing: selection and editing right away (lightly debounced), pointer throttled, heartbeat so I do not expire.
  useEffect(() => {
    const send = () => hub.sendPresence(room, { selectedNodeId: latest.current.selectedId, editingNodeId: latest.current.editingId, cursor: usePresenceStore.getState().cursor });
    const t = setTimeout(send, 150);
    return () => clearTimeout(t);
  }, [room, selectedId, editingId]);

  useEffect(() => {
    let last = usePresenceStore.getState().cursor;
    let lastSent = 0;
    const unsub = usePresenceStore.subscribe((s) => {
      if (s.cursor === last) return;
      last = s.cursor;
      const now = Date.now();
      if (now - lastSent < 100) return; // at most 10 pointer updates a second
      lastSent = now;
      hub.sendPresence(room, { selectedNodeId: latest.current.selectedId, editingNodeId: latest.current.editingId, cursor: s.cursor });
    });
    const beat = setInterval(() => hub.sendPresence(room, { selectedNodeId: latest.current.selectedId, editingNodeId: latest.current.editingId, cursor: usePresenceStore.getState().cursor }), 20_000);
    return () => {
      unsub();
      clearInterval(beat);
    };
  }, [room]);
}
