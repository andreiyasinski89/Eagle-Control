"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/features/mindmap/api";
import { fillScript } from "@/modules/crm/tracker";
import { useMembers } from "./hooks";

export interface ScriptDto {
  id: string;
  title: string;
  stage: string | null;
  body: string;
  position: number;
  situation: string | null;
  /** A script of the whole team (changed by its leaders), or the member's own. */
  shared: boolean;
  mine: boolean;
}

export function useScripts(workspaceId: string) {
  return useQuery({ queryKey: ["scripts", workspaceId], staleTime: 30_000, queryFn: async () => (await api.get<{ items: ScriptDto[] }>(`/api/v1/workspaces/${workspaceId}/scripts`)).items });
}

/** Fills a script for one person: the names (and, in the queue, the city and the personal link). */
export function useScriptFiller(workspaceId: string, meId: string) {
  const members = useMembers(workspaceId);
  const myName = members.data?.find((m) => m.id === meId)?.name ?? "";
  return (body: string, fullName: string) => fillScript(body, { name: fullName.split(/\s+/)[0] ?? fullName, fullName, myName });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
