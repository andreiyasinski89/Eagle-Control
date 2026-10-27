import type { Health, NodeType } from "@prisma/client";
import type { ClientNode, Person } from "@/features/mindmap/types";

export interface TagDto {
  id: string;
  name: string;
  color: string;
}

export interface LinkedNode {
  id: string;
  title: string;
  type: NodeType;
  status: ClientNode["status"];
}

export interface NodeDetail {
  node: {
    id: string;
    parentId: string | null;
    type: NodeType;
    title: string;
    description: string | null;
    status: ClientNode["status"];
    progress: number;
    progressMode: ClientNode["progressMode"];
    health: Health;
    healthOverride: Health | null;
    healthOverrideNote: string | null;
    startDate: string | null;
    dueDate: string | null;
    estimation: number | null;
    estimationUnit: "HOURS" | "STORY_POINTS" | null;
    assigneeId: string | null;
    createdById: string;
    createdAt: string;
    data: Record<string, unknown>;
  };
  blocked: boolean;
  tags: TagDto[];
  assignee: Person | null;
  links: { id: string; kind: "BLOCKS" | "RELATES" | "ATTACHED" | "DEAL_PROJECT"; direction: "in" | "out"; other: LinkedNode }[];
  attachments: { id: string; fileName: string; mime: string; size: number; visibleToClient?: boolean; createdAt: string; uploadedBy: { id: string; name: string | null } }[];
  breadcrumb: { id: string; title: string; type: NodeType }[];
  statusSummary: Partial<Record<ClientNode["status"], number>>;
  taskCount: number;
  burndown: { date: string; ideal: number; actual: number | null }[] | null;
}

export interface CommentDto {
  id: string;
  nodeId: string;
  parentCommentId: string | null;
  body: CommentDoc;
  mentions: string[];
  isAiGenerated: boolean;
  visibleToClient?: boolean;
  createdAt: string;
  author: Person;
}

export interface CommentDoc {
  type: "doc";
  content?: { type: "paragraph"; content?: ({ type: "text"; text: string } | { type: "mention"; attrs: { id: string; label: string } })[] }[];
}
