export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | "CLIENT";

export interface WorkspaceFacts {
  workspaceId: string;
  name: string;
  /** The person's role there. */
  role: Role;
  /** Everyone else in the workspace, by role. */
  others: Record<Role, number>;
}

export interface ErasurePlan {
  /** Workspaces where the person is the only owner but other team members depend on it: they must hand it over first. */
  blockers: { workspaceId: string; name: string; candidates: number }[];
  /** Workspaces that go away with the person: nobody on the team is left. `clients` are people who lose access to them. */
  willDelete: { workspaceId: string; name: string; clients: number }[];
  /** Workspaces that simply lose a member. */
  leaves: { workspaceId: string; name: string }[];
}

const team = (o: Record<Role, number>) => o.OWNER + o.ADMIN + o.MEMBER;

/**
 * What erasing an account does to each workspace it belongs to. The rule: never leave a team without an owner, and never
 * keep a workspace nobody on the team can run. Guests and clients do not count as "the team".
 */
export function planErasure(facts: readonly WorkspaceFacts[]): ErasurePlan {
  const plan: ErasurePlan = { blockers: [], willDelete: [], leaves: [] };
  for (const w of facts) {
    const soleOwner = w.role === "OWNER" && w.others.OWNER === 0;
    if (!soleOwner) plan.leaves.push({ workspaceId: w.workspaceId, name: w.name });
    else if (team(w.others) > 0) plan.blockers.push({ workspaceId: w.workspaceId, name: w.name, candidates: w.others.ADMIN + w.others.MEMBER });
    else plan.willDelete.push({ workspaceId: w.workspaceId, name: w.name, clients: w.others.CLIENT + w.others.GUEST });
  }
  return plan;
}

/** The anonymous address given to an erased account: unique, unreachable, and unrelated to the old one. */
export const tombstoneEmail = (userId: string): string => `deleted-${userId}@deleted.invalid`;

export const GRACE_DEFAULT_DAYS = 7;

export const dueForErasure = (requestedAt: Date, graceDays: number, now: Date): boolean => now.getTime() >= requestedAt.getTime() + graceDays * 86_400_000;

/** Placeholder left in a thread when someone asks for their comments to be removed (replies of others stay readable). */
export const REMOVED_COMMENT = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "[removed]" }] }] } as const;
