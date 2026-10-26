import type { NodeType } from "@prisma/client";

/** The single source of truth for what may live under what. Used by the API and by drag & drop hints. */
export const ALLOWED_CHILDREN: Record<NodeType, readonly NodeType[]> = {
  PROJECT: ["EPIC", "DOCUMENT", "EVENT"],
  EPIC: ["SPRINT", "TASK", "DOCUMENT"],
  SPRINT: ["TASK", "DOCUMENT", "EVENT"],
  TASK: ["SUBTASK", "DOCUMENT"],
  SUBTASK: [],
  DOCUMENT: [],
  EVENT: [],
  // CRM tree (Client Map): a company holds its contacts and deals. Projects hang off deals by NodeLink, not by parent.
  COMPANY: ["CONTACT", "DEAL"],
  CONTACT: [],
  DEAL: [],
};

export const ROOT_TYPES: readonly NodeType[] = ["PROJECT", "COMPANY", "CONTACT", "DEAL"];

export const CRM_TYPES: readonly NodeType[] = ["COMPANY", "CONTACT", "DEAL"];

export function isCrmType(type: NodeType): boolean {
  return CRM_TYPES.includes(type);
}

/** Types that take part in progress and health aggregation. */
export const COUNTING_TYPES: readonly NodeType[] = ["PROJECT", "EPIC", "SPRINT", "TASK", "SUBTASK"];

export type MoveDenial =
  | "type_not_allowed"
  | "root_only_project"
  | "cycle"
  | "other_workspace"
  | "other_project"
  | "self";

export function isCounting(type: NodeType): boolean {
  return COUNTING_TYPES.includes(type);
}

export function allowedChildTypes(parent: NodeType): readonly NodeType[] {
  return ALLOWED_CHILDREN[parent];
}

export function canNest(parent: NodeType | null, child: NodeType): boolean {
  if (parent === null) return ROOT_TYPES.includes(child);
  return ALLOWED_CHILDREN[parent].includes(child);
}

interface Placed {
  id: string;
  type: NodeType;
  workspaceId: string;
  parentId: string | null;
}

/**
 * Why `node` cannot be moved under `newParent` (null = make it a root), or null if it can.
 * `ancestorsOfParent` is the chain of ids from newParent up to the root (including newParent).
 */
export function whyCannotMove(
  node: Placed,
  newParent: Placed | null,
  ancestorsOfParent: readonly string[],
  sameProject: boolean,
): MoveDenial | null {
  if (newParent === null) return ROOT_TYPES.includes(node.type) ? null : "root_only_project";
  if (newParent.id === node.id) return "self";
  if (newParent.workspaceId !== node.workspaceId) return "other_workspace";
  if (ancestorsOfParent.includes(node.id)) return "cycle";
  if (!sameProject) return "other_project";
  if (!canNest(newParent.type, node.type)) return "type_not_allowed";
  return null;
}
