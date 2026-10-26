"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, useStore, type Node as RFNode, type NodeProps } from "@xyflow/react";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderKanban,
  Layers,
  ListChecks,
  Plus,
  Timer,
} from "lucide-react";
import type { NodeType } from "@prisma/client";
import { useLocale, useTranslations } from "next-intl";
import { allowedChildTypes } from "@/modules/nodes/node-rules";
import { showsStatus, STATUS_TONE, type StatusTone } from "@/modules/nodes/view";
import { cn } from "@/lib/utils";
import { createChild, rename, toggleCollapsed } from "./actions";
import { peopleOn, usePresenceStore } from "@/features/realtime/presence-store";
import { useMapStore } from "./store";
import type { ClientNode, Person } from "./types";

export interface CardData extends Record<string, unknown> {
  node: ClientNode;
  hiddenCount: number;
  hasChildren: boolean;
  dim: boolean;
  matched: boolean;
  heatmap: boolean;
  assignee: Person | null;
  tags: { id: string; name: string; color: string }[];
  canWrite: boolean;
}

export type CardNode = RFNode<CardData, "card">;

export const TYPE_ICON: Record<NodeType, typeof CheckSquare> = {
  PROJECT: FolderKanban,
  EPIC: Layers,
  SPRINT: Timer,
  TASK: CheckSquare,
  SUBTASK: ListChecks,
  DOCUMENT: FileText,
  EVENT: CalendarDays,
  COMPANY: FolderKanban,
  CONTACT: FolderKanban,
  DEAL: FolderKanban,
};

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  active: "bg-accent text-accent-foreground",
  review: "bg-[var(--health-yellow)]/15 text-[var(--health-yellow)]",
  done: "bg-[var(--health-green)]/15 text-[var(--health-green)]",
  muted: "bg-muted text-muted-foreground line-through",
};

/** The status of a task as a small coloured pill. */
export function StatusChip({ status, className }: { status: ClientNode["status"]; className?: string }) {
  const t = useTranslations("map");
  return <span className={cn("shrink-0 truncate rounded-full px-1.5 py-px text-[10px] font-medium leading-4", TONE_CLASS[STATUS_TONE[status]], className)}>{t(`status.${status}`)}</span>;
}

const HEALTH_VAR = {
  GREEN: "var(--health-green)",
  YELLOW: "var(--health-yellow)",
  RED: "var(--health-red)",
} as const;

export function initials(p: Person | null): string {
  const src = p?.name ?? p?.email ?? "?";
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function AddMenu({ node, onClose }: { node: ClientNode; onClose: () => void }) {
  const t = useTranslations("map");
  const types = allowedChildTypes(node.type);
  return (
    <div
      role="menu"
      className="absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 rounded-md border border-border bg-card p-1 shadow-lg"
    >
      {types.map((type) => (
        <button
          key={type}
          role="menuitem"
          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-left text-xs hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            void createChild(node.id, type, t(`new.${type}`));
          }}
        >
          {(() => {
            const Icon = TYPE_ICON[type];
            return <Icon className="size-3.5" />;
          })()}
          {t(`type.${type}`)}
        </button>
      ))}
    </div>
  );
}

function TitleEditor({ node }: { node: ClientNode }) {
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const setEditing = useMapStore((s) => s.setEditing);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    setEditing(null);
    if (!cancelled.current) void rename(node.id, ref.current?.value ?? node.title);
  };
  return (
    <input
      ref={ref}
      defaultValue={node.title}
      aria-label="Title"
      maxLength={200}
      className="nodrag nopan w-full rounded border border-primary bg-background px-1 text-sm font-medium outline-none"
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") ref.current?.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          ref.current?.blur();
        }
      }}
    />
  );
}

function shortDate(iso: string | null, locale: string): string | null {
  return iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso)) : null;
}

function CardImpl({ data, selected }: NodeProps<CardNode>) {
  const { node, hiddenCount, hasChildren, dim, matched, heatmap, assignee, tags, canWrite } = data;
  const t = useTranslations("map");
  const locale = useLocale();
  // Three levels of detail keep a big map cheap to paint: dots when far away, a light card in between, the full card up close.
  const detail = useStore((s) => (s.transform[2] < 0.28 ? "far" : s.transform[2] < 0.5 ? "mid" : "full"));
  const editing = useMapStore((s) => s.editingId === node.id);
  const hint = useMapStore((s) => (s.dropHint?.targetId === node.id ? s.dropHint : null));
  const others = usePresenceStore((s) => s.others);
  const here = peopleOn(others, node.id);
  const marker = here.editors[0] ?? here.viewers[0] ?? null;
  const [adding, setAdding] = useState(false);

  const health = node.healthOverride ?? node.health;
  const color = HEALTH_VAR[health];
  const Icon = TYPE_ICON[node.type];
  const countable = node.type !== "DOCUMENT" && node.type !== "EVENT";
  const done = node.status === "DONE" || node.status === "CANCELLED";
  const tagRoom = showsStatus(node.type) ? 1 : 3; // the status pill takes the room of two tags
  const canAdd = canWrite && allowedChildTypes(node.type).length > 0;

  // Far zoom: a coloured dot with the title keeps 2000 nodes cheap to paint and still readable.
  if (detail === "mid") {
    return (
      <div
        data-testid={`node-${node.id}`}
        data-node-type={node.type}
        data-health={health}
        className={cn("relative flex h-[76px] w-[240px] flex-col justify-center gap-1.5 rounded-xl border bg-card px-4 shadow-sm", selected ? "border-primary ring-2 ring-primary/40" : "border-border", dim && "opacity-25", done && "opacity-75")}
        style={{ borderLeftWidth: 8, borderLeftColor: countable ? color : "var(--border)" }}
      >
        <Handle type="target" position={Position.Left} className="!opacity-0" />
        <span className={cn("truncate text-[22px] font-semibold leading-7", node.status === "CANCELLED" && "line-through")}>{node.title}</span>
        {showsStatus(node.type) && <StatusChip status={node.status} className="self-start px-2 text-[14px] leading-5" />}
        <Handle type="source" position={Position.Right} className="!opacity-0" />
      </div>
    );
  }

  if (detail === "far") {
    return (
      <div className={cn("flex h-[76px] w-[240px] items-center gap-3", dim && "opacity-25")}>
        <Handle type="target" position={Position.Left} className="!opacity-0" />
        <span className="size-7 shrink-0 rounded-full border-2 border-card" style={{ background: countable ? color : "var(--muted-foreground)" }} />
        <span className="truncate text-lg font-semibold">{node.title}</span>
        <Handle type="source" position={Position.Right} className="!opacity-0" />
      </div>
    );
  }

  return (
    <div
      data-testid={`node-${node.id}`}
      data-node-type={node.type}
      data-health={health}
      className={cn(
        "group relative h-[76px] w-[240px] rounded-xl border bg-card px-3 py-2 shadow-sm transition-[opacity,box-shadow] hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border",
        dim && "opacity-30",
        matched && !heatmap && "ring-2 ring-primary/30",
        hint && (hint.ok ? "ring-2 ring-[var(--health-green)]" : "ring-2 ring-[var(--health-red)]"),
        done && !heatmap && "opacity-80",
      )}
      style={{
        borderLeftWidth: 5,
        borderLeftColor: countable ? color : "var(--border)",
        background: heatmap && countable ? `color-mix(in srgb, ${color} 22%, var(--card))` : undefined,
        ...(marker ? { outline: `2px ${here.editors.length ? "solid" : "dashed"} ${marker.color}`, outlineOffset: 2 } : {}),
      }}
      title={hint && !hint.ok ? t("cannotDrop", { reason: hint.reason?.replaceAll("_", " ") ?? "" }) : undefined}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      {marker && (
        <span data-testid="node-presence" className="absolute -top-3 right-2 z-10 max-w-[10rem] truncate rounded px-1.5 text-[10px] font-medium leading-4 text-white" style={{ background: marker.color }}>
          {here.editors.length ? `${marker.name} ✎` : marker.name}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", heatmap ? "text-foreground" : "text-muted-foreground")} aria-label={t(`type.${node.type}`)} />
        <div className="min-w-0 flex-1" onDoubleClick={() => canWrite && useMapStore.getState().setEditing(node.id)}>
          {editing ? (
            <TitleEditor node={node} />
          ) : (
            <div className={cn("truncate text-sm font-medium", node.status === "CANCELLED" && "line-through")}>{node.title}</div>
          )}
        </div>
        {countable && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: color }}
            role="img"
            aria-label={t(`health.${health}`)}
          />
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        {assignee && (
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-foreground",
              heatmap && "opacity-60",
            )}
            title={assignee.name ?? assignee.email}
          >
            {initials(assignee)}
          </span>
        )}
        {showsStatus(node.type) && !heatmap && <StatusChip status={node.status} />}
        {node.dueDate && <span>{shortDate(node.dueDate, locale)}</span>}
        {node.blocked && <span className="font-medium text-[var(--health-red)]">{t("blocked")}</span>}
        {!heatmap &&
          tags.slice(0, tagRoom).map((tag) => (
            <span key={tag.id} className="max-w-[56px] truncate rounded px-1" style={{ background: `${tag.color}33`, color: "inherit" }}>
              {tag.name}
            </span>
          ))}
        {!heatmap && tags.length > tagRoom && <span>+{tags.length - tagRoom}</span>}
        {countable && <span className="ml-auto tabular-nums">{node.progress}%</span>}
      </div>

      {countable && (
        <div className="absolute inset-x-3 bottom-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${node.progress}%`, background: color }} />
        </div>
      )}

      {hasChildren && (
        <button
          aria-label={node.collapsed ? t("expand") : t("collapse")}
          className="nodrag nopan absolute -right-3 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card px-1 text-[10px] shadow-sm hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            void toggleCollapsed(node.id);
          }}
        >
          {node.collapsed ? (
            <>
              <ChevronRight className="size-3" />
              {hiddenCount > 0 && <span data-testid="hidden-count">{hiddenCount}</span>}
            </>
          ) : (
            <ChevronLeft className="size-3" />
          )}
        </button>
      )}

      {canAdd && !hasChildren && (
        <button
          aria-label={t("addChild")}
          className="nodrag nopan absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted group-hover:flex"
          onClick={(e) => {
            e.stopPropagation();
            setAdding((v) => !v);
          }}
        >
          <Plus className="size-3" />
        </button>
      )}
      {canAdd && hasChildren && (
        <button
          aria-label={t("addChild")}
          className="nodrag nopan absolute -bottom-2.5 right-6 hidden size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted group-hover:flex"
          onClick={(e) => {
            e.stopPropagation();
            setAdding((v) => !v);
          }}
        >
          <Plus className="size-3" />
        </button>
      )}
      {adding && <AddMenu node={node} onClose={() => setAdding(false)} />}
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

export const NodeCard = memo(CardImpl);
