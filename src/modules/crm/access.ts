import { descendantIds } from "./groups";

/** How much of the CRM a member sees. NONE is "no CRM access"; the others are the stored scope of a member who has it. */
export const CRM_LEVELS = ["NONE", "OWN", "TEAM", "ALL"] as const;
export type CrmLevel = (typeof CRM_LEVELS)[number];
export type CrmScope = Exclude<CrmLevel, "NONE">;

export interface LevelSource {
  role: string;
  crmAccess: boolean;
  crmScope?: CrmScope | null;
}

/** Owners and admins always see everything; a member sees what the CRM flag and the scope let them; others see nothing. */
export function crmLevel(m: LevelSource): CrmLevel {
  if (m.role === "OWNER" || m.role === "ADMIN") return "ALL";
  if (m.role !== "MEMBER" || !m.crmAccess) return "NONE";
  return m.crmScope ?? "ALL";
}

/** The two stored fields a chosen level stands for. */
export function levelFields(level: CrmLevel): { crmAccess: boolean; crmScope: CrmScope } {
  return level === "NONE" ? { crmAccess: false, crmScope: "ALL" } : { crmAccess: true, crmScope: level };
}

export interface ContactLink {
  id: string;
  sponsorId: string | null;
  linkedUserId: string | null;
}

export interface Reach {
  /** People owned by one of these accounts are visible. */
  userIds: string[];
  /** People held by one of these partner cards, and the cards themselves, are visible. */
  partnerIds: string[];
  /** People whose line goes up to one of these partners are visible (team scope only). */
  lineIds: string[];
}

/**
 * Whose people a scoped member sees. "Own": those they own, and those held by their own partner card. "Team": the same for the whole
 * line below them in the sponsor tree, and everyone brought through that line.
 */
export function reachOf(scope: "OWN" | "TEAM", userId: string, links: readonly ContactLink[]): Reach {
  const mine = links.filter((l) => l.linkedUserId === userId).map((l) => l.id);
  if (scope === "OWN") return { userIds: [userId], partnerIds: mine, lineIds: [] };
  const tree = links.map((l) => ({ id: l.id, parentId: l.sponsorId }));
  const line = new Set(mine.flatMap((id) => descendantIds(tree, id)));
  const users = new Set<string>([userId]);
  for (const l of links) if (line.has(l.id) && l.linkedUserId) users.add(l.linkedUserId);
  return { userIds: [...users], partnerIds: [...line], lineIds: [...line] };
}
