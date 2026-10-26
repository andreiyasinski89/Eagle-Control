"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/features/mindmap/api";

interface Tag {
  id: string;
  name: string;
  color: string;
}
const COLORS = ["#6366f1", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#9333ea"];

/** Tag chips for any node (deal, contact, company…): toggle existing tags or add a new one. */
export function NodeTags({ nodeId, workspaceId, current, canWrite, onChange }: { nodeId: string; workspaceId: string; current: Tag[]; canWrite: boolean; onChange: () => void }) {
  const t = useTranslations("drawer");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: all = [] } = useQuery({ queryKey: ["tags", workspaceId], queryFn: () => api.get<Tag[]>(`/api/v1/workspaces/${workspaceId}/tags`) });
  const ids = new Set(current.map((x) => x.id));

  async function setTags(next: string[]) {
    await api.put(`/api/v1/nodes/${nodeId}/tags`, { tagIds: next });
    onChange();
  }
  async function addNew() {
    const n = name.trim();
    if (!n) return;
    const tag = await api.post<Tag>(`/api/v1/workspaces/${workspaceId}/tags`, { name: n, color: COLORS[all.length % COLORS.length] }).catch(() => all.find((x) => x.name === n));
    setName("");
    await qc.invalidateQueries({ queryKey: ["tags", workspaceId] });
    if (tag) await setTags([...ids, tag.id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {all.map((tag) => {
          const on = ids.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={on}
              disabled={!canWrite}
              onClick={() => void setTags(on ? [...ids].filter((x) => x !== tag.id) : [...ids, tag.id])}
              className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-transparent" : "border-border opacity-60 hover:opacity-100")}
              style={on ? { background: `${tag.color}33`, borderColor: tag.color } : undefined}
            >
              {tag.name}
            </button>
          );
        })}
        {all.length === 0 && <span className="text-sm text-muted-foreground">{t("noTags")}</span>}
      </div>
      {canWrite && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addNew();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tagName")} aria-label={t("tagName")} maxLength={40} />
          <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>
            {t("addTag")}
          </Button>
        </form>
      )}
    </div>
  );
}
