import type { NodeType } from "@prisma/client";
import { z } from "zod";

export interface TemplateNode {
  type: NodeType;
  title: string;
  estimation?: number;
  /** Days after the project start. With durationDays it gives the node real dates (and so a meaningful health). */
  offsetDays?: number;
  durationDays?: number;
  children?: TemplateNode[];
}

export interface TemplateDef {
  name: string;
  /** Project length when the creator gives a start date but no due date. */
  defaultDurationDays: number;
  structure: TemplateNode | null;
}

export const BUILT_IN_TEMPLATES = {
  empty: { name: "Empty", defaultDurationDays: 60, structure: null },
  "agile-sprint-map": {
    name: "Agile Sprint Map",
    defaultDurationDays: 28,
    structure: {
      type: "PROJECT",
      title: "",
      children: [
        { type: "EPIC", title: "Frontend", offsetDays: 0, durationDays: 28, children: [{ type: "SPRINT", title: "Sprint 1", offsetDays: 0, durationDays: 14 }, { type: "SPRINT", title: "Sprint 2", offsetDays: 14, durationDays: 14 }] },
        { type: "EPIC", title: "Backend", offsetDays: 0, durationDays: 28, children: [{ type: "SPRINT", title: "Sprint 1", offsetDays: 0, durationDays: 14 }, { type: "SPRINT", title: "Sprint 2", offsetDays: 14, durationDays: 14 }] },
      ],
    },
  },
  "product-roadmap": {
    name: "Product Roadmap",
    defaultDurationDays: 90,
    structure: {
      type: "PROJECT",
      title: "",
      children: [
        { type: "EPIC", title: "Discovery", offsetDays: 0, durationDays: 30 },
        { type: "EPIC", title: "MVP", offsetDays: 30, durationDays: 40 },
        { type: "EPIC", title: "Launch", offsetDays: 70, durationDays: 20 },
      ],
    },
  },
  "agency-client-project": {
    name: "Agency Client Project",
    defaultDurationDays: 60,
    structure: {
      type: "PROJECT",
      title: "",
      children: [
        { type: "EPIC", title: "Kickoff", offsetDays: 0, durationDays: 7, children: [{ type: "TASK", title: "Collect brief", estimation: 4, offsetDays: 0, durationDays: 3 }] },
        { type: "EPIC", title: "Delivery", offsetDays: 7, durationDays: 43, children: [{ type: "SPRINT", title: "Sprint 1", offsetDays: 7, durationDays: 21 }] },
        { type: "EPIC", title: "Handover", offsetDays: 50, durationDays: 10 },
      ],
    },
  },
} as const satisfies Record<string, TemplateDef>;

export type BuiltInTemplateKey = keyof typeof BUILT_IN_TEMPLATES;

export interface FlatTemplateNode {
  key: number;
  parentKey: number | null;
  type: NodeType;
  title: string;
  estimation: number | null;
  offsetDays: number | null;
  durationDays: number | null;
}

/** Depth-first flattening; parents always precede their children. The root is key 0. */
export function flattenTemplate(root: TemplateNode, rootTitle?: string): FlatTemplateNode[] {
  const out: FlatTemplateNode[] = [];
  const walk = (n: TemplateNode, parentKey: number | null): void => {
    const key = out.length;
    out.push({
      key,
      parentKey,
      type: n.type,
      title: parentKey === null && rootTitle ? rootTitle : n.title,
      estimation: n.estimation ?? null,
      offsetDays: n.offsetDays ?? null,
      durationDays: n.durationDays ?? null,
    });
    n.children?.forEach((c) => walk(c, key));
  };
  walk(root, null);
  return out;
}

const DAY = 86_400_000;

/** Start and due date of a template node for a project starting on `projectStart` (UTC days). */
export function scheduleNode(n: Pick<FlatTemplateNode, "offsetDays" | "durationDays">, projectStart: Date): { start: Date; due: Date } | null {
  if (n.offsetDays === null || n.durationDays === null) return null;
  const base = Math.floor(projectStart.getTime() / DAY) * DAY;
  return { start: new Date(base + n.offsetDays * DAY), due: new Date(base + (n.offsetDays + n.durationDays) * DAY) };
}

// Workspace-defined templates are stored as JSON, so they are validated on the way in and out.
export const templateNodeSchema: z.ZodType<TemplateNode> = z.lazy(() =>
  z.object({
    type: z.enum(["PROJECT", "EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"]),
    title: z.string().max(200),
    estimation: z.number().min(0).max(100_000).optional(),
    offsetDays: z.number().int().min(0).max(3650).optional(),
    durationDays: z.number().int().min(1).max(3650).optional(),
    children: z.array(templateNodeSchema).max(200).optional(),
  }),
);
