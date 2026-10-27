import type { Role } from "@prisma/client";
import { crmLevel, type CrmScope } from "@/modules/crm/access";

export type Action =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "billing:manage"
  | "member:list"
  | "member:invite"
  | "crm:read"
  | "crm:full"
  | "pipeline:manage"
  | "project:create"
  | "node:write"
  | "comment:write"
  | "tag:manage"
  | "crm:write"
  | "crm:export"
  | "crm:merge"
  | "crm:erase"
  | "leadform:manage";

export interface Actor {
  role: Role;
  crmAccess: boolean;
  /** Whose people a member with CRM access sees; leaving it out means everyone's. */
  crmScope?: CrmScope | null;
  teamScope?: CrmScope | null;
}

const RANK: Record<Role, number> = { OWNER: 5, ADMIN: 4, MEMBER: 3, GUEST: 2, CLIENT: 1 };

export function roleRank(role: Role): number {
  return RANK[role];
}

export function can(actor: Actor, action: Action): boolean {
  const { role } = actor;
  switch (action) {
    case "workspace:read":
      // Clients never use the workspace app or its API; the portal has its own, narrower checks.
      return role !== "CLIENT";
    case "workspace:update":
    case "member:invite":
    case "pipeline:manage":
      return role === "OWNER" || role === "ADMIN";
    case "workspace:delete":
    case "billing:manage":
      return role === "OWNER";
    case "project:create":
      return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
    case "node:write":
      return role !== "CLIENT";
    case "comment:write":
      return role !== "CLIENT";
    case "tag:manage":
      return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
    case "crm:write":
      return crmLevel(actor) !== "NONE";
    // Companies, deals, amounts, reports, exports and merging belong to those who see the whole CRM, not to a partner who sees their own people.
    case "crm:full":
    case "crm:export":
    case "crm:merge":
      return crmLevel(actor) === "ALL";
    case "crm:erase":
    case "leadform:manage":
      return role === "OWNER" || role === "ADMIN";
    case "member:list":
      return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
    case "crm:read":
      return crmLevel(actor) !== "NONE";
  }
}

/** Roles the actor may hand out when inviting. Owner transfer is out of scope. */
export function canGrantRole(actorRole: Role, target: Role): boolean {
  if (target === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return roleRank(target) < roleRank("ADMIN");
  return false;
}

/**
 * Whether `actor` may change/remove a member currently holding `targetRole`
 * (and, for role changes, move them to `newRole`).
 */
export function canManageMember(actorRole: Role, targetRole: Role, newRole?: Role): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole !== "ADMIN") return false;
  if (roleRank(targetRole) >= roleRank("ADMIN")) return false;
  return newRole === undefined || roleRank(newRole) < roleRank("ADMIN");
}
