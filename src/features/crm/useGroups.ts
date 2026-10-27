"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import { groupTree, type GroupNode } from "@/modules/crm/groups";

export interface GroupDto {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
  own: number;
  total: number;
}
export interface GroupsData {
  items: GroupDto[];
  ungrouped: number;
  all: number;
}

export function useGroups(workspaceId: string) {
  const q = useQuery({ queryKey: ["groups", workspaceId], staleTime: 15_000, queryFn: () => api.get<GroupsData>(`/api/v1/workspaces/${workspaceId}/contact-groups`) });
  const tree = useMemo<GroupNode<GroupDto>[]>(() => groupTree(q.data?.items ?? []), [q.data]);
  /** The groups one under another, for a select: a subgroup is shown indented. */
  const options = useMemo(() => {
    const out: { id: string; label: string; depth: number }[] = [];
    const walk = (nodes: GroupNode<GroupDto>[]) => {
      for (const n of nodes) {
        out.push({ id: n.group.id, label: `${" ".repeat(n.depth - 1)}${n.group.name}`, depth: n.depth });
        walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);
  return { ...q, tree, options };
}
