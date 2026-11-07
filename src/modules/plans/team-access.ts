/**
 * Team access: everyone the platform owner brought, and everyone they brought in turn, uses the platform for free (Pro) until the owner
 * switches a person off by hand. Switching a person off also switches off the people below them, unless one of those is switched on by hand.
 */
export type TeamAccessSetting = "ON" | "OFF" | null;

export interface ChainLink {
  id: string;
  email: string;
  teamAccess: string | null;
  referredById: string | null;
}

/** The longest chain of invitations looked at; deeper than this is treated as not in the team (and protects against a loop). */
export const MAX_CHAIN = 60;

/**
 * Whether the first person of `chain` has team access. `chain` is the person, then who invited them, then who invited that one, and so on.
 * The nearest person set by hand decides; otherwise reaching the platform owner (`roots`) means yes, and running out of inviters means no.
 */
export function hasTeamAccess(chain: readonly ChainLink[], roots: readonly string[]): boolean {
  const owners = new Set(roots.map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  for (const link of chain.slice(0, MAX_CHAIN)) {
    if (seen.has(link.id)) return false;
    seen.add(link.id);
    if (link.teamAccess === "ON") return true;
    if (link.teamAccess === "OFF") return false;
    if (owners.has(link.email.trim().toLowerCase())) return true;
  }
  return false;
}

/** Why a person has (or has not) team access, for the admin screen: set by hand, or by the chain. */
export function teamAccessReason(chain: readonly ChainLink[], roots: readonly string[]): "owner" | "on" | "off" | "chain" | "none" {
  const first = chain[0];
  if (!first) return "none";
  if (roots.map((e) => e.trim().toLowerCase()).includes(first.email.trim().toLowerCase())) return "owner";
  if (first.teamAccess === "ON") return "on";
  if (first.teamAccess === "OFF") return "off";
  return hasTeamAccess(chain, roots) ? "chain" : "none";
}
