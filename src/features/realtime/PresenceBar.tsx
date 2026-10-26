"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMapStore } from "@/features/mindmap/store";
import { usePresenceStore } from "./presence-store";

const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

/** Who else is in this project right now (one avatar per person, even with several tabs open). */
export function PresenceBar() {
  const t = useTranslations("live");
  const others = usePresenceStore((s) => s.others);
  const nodes = useMapStore((s) => s.nodes);
  const people = useMemo(() => {
    const byUser = new Map<string, (typeof others)[string]>();
    for (const u of Object.values(others)) {
      const cur = byUser.get(u.userId);
      if (!cur || (u.editingNodeId && !cur.editingNodeId) || u.updatedAt > cur.updatedAt) byUser.set(u.userId, u);
    }
    return [...byUser.values()];
  }, [others]);
  if (people.length === 0) return null;
  const shown = people.slice(0, 5);
  return (
    <ul className="flex items-center -space-x-1.5" aria-label={t("here")} data-testid="presence-bar">
      {shown.map((u) => {
        const where = u.editingNodeId ? t("editing", { title: nodes[u.editingNodeId]?.title ?? "…" }) : u.selectedNodeId ? t("viewing", { title: nodes[u.selectedNodeId]?.title ?? "…" }) : t("online");
        return (
          <li key={u.userId} title={`${u.name} · ${where}`} data-testid="presence-avatar" className="grid size-7 place-items-center rounded-full border-2 border-card text-[11px] font-semibold text-white" style={{ background: u.color }}>
            {initialsOf(u.name)}
          </li>
        );
      })}
      {people.length > shown.length && <li className="grid size-7 place-items-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold">+{people.length - shown.length}</li>}
    </ul>
  );
}
