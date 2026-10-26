"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useTranslations } from "next-intl";
import { api } from "./api";
import { TYPE_ICON } from "./NodeCard";
import { useMapStore } from "./store";
import type { NodeType } from "@prisma/client";

interface Hit {
  id: string;
  title: string;
  type: NodeType;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function SearchPalette({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const t = useTranslations("map");
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 150);
  const workspaceId = useMapStore((s) => s.workspaceId);
  const projectId = useMapStore((s) => s.projectId);

  const { data = [], isFetching } = useQuery({
    queryKey: ["search", workspaceId, projectId, term],
    enabled: open && term.length > 0 && !!workspaceId,
    queryFn: () => api.get<Hit[]>(`/api/v1/workspaces/${workspaceId}/search?q=${encodeURIComponent(term)}&projectId=${projectId}`),
  });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose} role="presentation">
      <Command
        shouldFilter={false}
        label={t("search")}
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <Command.Input
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder={t("searchPlaceholder")}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-1">
          {term.length > 0 && !isFetching && data.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("noResults")}</div>}
          {data.map((h) => {
            const Icon = TYPE_ICON[h.type];
            return (
              <Command.Item
                key={h.id}
                value={h.id}
                onSelect={() => {
                  onClose();
                  onPick(h.id);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="truncate">{h.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{t(`type.${h.type}`)}</span>
              </Command.Item>
            );
          })}
        </Command.List>
      </Command>
    </div>
  );
}
