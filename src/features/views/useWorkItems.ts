"use client";

import { useMemo } from "react";
import { useMapStore } from "@/features/mindmap/store";
import { workItems } from "@/modules/views/views";

/** Tasks and subtasks of the open project, straight from the map store, so every view sees the same optimistic state. */
export function useWorkItems() {
  const nodes = useMapStore((s) => s.nodes);
  return useMemo(() => workItems(Object.values(nodes)), [nodes]);
}

export function usePersonName() {
  const people = useMapStore((s) => s.people);
  return (id: string | null) => (id ? (people[id]?.name ?? people[id]?.email ?? "") : "");
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
