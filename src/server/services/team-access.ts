import { env } from "@/lib/env";
import { db } from "@/server/db";
import { hasTeamAccess, MAX_CHAIN, teamAccessReason, type ChainLink } from "@/modules/plans/team-access";

/** The platform owner(s): the root of the team. */
export const teamRoots = (): string[] => (env().SUPERADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** The person, who invited them, who invited that one... up to the platform owner or the first person nobody invited. */
export async function chainOf(userId: string): Promise<ChainLink[]> {
  const chain: ChainLink[] = [];
  let id: string | null = userId;
  while (id && chain.length < MAX_CHAIN && !chain.some((c) => c.id === id)) {
    const u: ChainLink | null = await db.user.findUnique({ where: { id }, select: { id: true, email: true, teamAccess: true, referredById: true } });
    if (!u) break;
    chain.push(u);
    id = u.referredById;
  }
  return chain;
}

export async function userHasTeamAccess(userId: string): Promise<boolean> {
  return hasTeamAccess(await chainOf(userId), teamRoots());
}

export async function userTeamReason(userId: string) {
  return teamAccessReason(await chainOf(userId), teamRoots());
}

/** A workspace is free for the team when one of its owners has team access. */
export async function workspaceHasTeamAccess(workspaceId: string): Promise<boolean> {
  const owners = await db.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { userId: true } });
  for (const o of owners) if (await userHasTeamAccess(o.userId)) return true;
  return false;
}

/** Everyone brought by this person, at any depth (the person themselves first). */
export async function branchOf(userId: string, limit = 5000): Promise<string[]> {
  const out = [userId];
  let wave = [userId];
  while (wave.length && out.length < limit) {
    const next = await db.user.findMany({ where: { referredById: { in: wave }, id: { notIn: out } }, select: { id: true }, take: limit - out.length });
    wave = next.map((n) => n.id);
    out.push(...wave);
  }
  return out;
}
