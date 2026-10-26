import type { Health, NodeType } from "@prisma/client";
import type { TreeNodeDto } from "@/server/services/nodes/queries";

/** Tree node as the browser sees it: dates are ISO strings. */
export type ClientNode = Omit<TreeNodeDto, "startDate" | "dueDate" | "childCount"> & {
  startDate: string | null;
  dueDate: string | null;
};

export interface Person {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  image: string | null;
}

export interface TreePayload {
  project: { id: string; workspaceId: string; title: string; data: Record<string, unknown> };
  nodes: ClientNode[];
  people: Person[];
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | "CLIENT";
  meId: string;
  serverTime: string;
}

export interface Change {
  id: string;
  progress: number;
  health: Health;
}

/** What POST/PATCH return for a node (the raw row, JSON-serialised). */
export interface NodeRow {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  status: ClientNode["status"];
  progress: number;
  progressMode: ClientNode["progressMode"];
  health: Health;
  healthOverride: Health | null;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  estimation: number | null;
  assigneeId: string | null;
  collapsed: boolean;
  visibleToClient: boolean;
}

export function rowToClient(row: NodeRow, prev?: ClientNode): ClientNode {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type,
    title: row.title,
    status: row.status,
    progress: row.progress,
    progressMode: row.progressMode,
    health: row.health,
    healthOverride: row.healthOverride,
    position: row.position,
    startDate: row.startDate,
    dueDate: row.dueDate,
    estimation: row.estimation,
    assigneeId: row.assigneeId,
    collapsed: row.collapsed,
    visibleToClient: row.visibleToClient,
    tagIds: prev?.tagIds ?? [],
    blocked: prev?.blocked ?? false,
  };
}
