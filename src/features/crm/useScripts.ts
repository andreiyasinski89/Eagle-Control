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

/**
 * Copies a text. The copy is started at once (a phone allows it only in the very press of a button, so nothing may come before it) and the answer
 * says whether it worked. Without the clipboard of the browser a hidden text field and the old copy command are the spare way.
 */
export function startCopy(text: string): Promise<boolean> {
  const spare = (): boolean => {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  };
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => spare());
  } catch {
    /* the spare way below */
  }
  return Promise.resolve(spare());
}

export const copyToClipboard = startCopy;
