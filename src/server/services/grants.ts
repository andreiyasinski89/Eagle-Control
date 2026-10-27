import { env } from "@/lib/env";
import { db } from "@/server/db";

/** The addresses in PRO_OWNER_EMAILS, lower-cased. */
export function grantedEmails(): string[] {
  return (env().PRO_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isGrantedEmail = (email: string): boolean => grantedEmails().includes(email.trim().toLowerCase());

/**
 * Puts workspaces on Pro when one of their owners is on the administrator's list (PRO_OWNER_EMAILS) and nothing else sets
 * their plan: no Stripe subscription, still on Free. Runs when such a person signs in, creates a workspace or becomes an
 * owner, and daily. It never lowers a plan: taking someone off the list leaves their workspaces as they are.
 */
export async function syncGrantedPlans(userId?: string): Promise<{ granted: number }> {
  const emails = grantedEmails();
  if (emails.length === 0) return { granted: 0 };
  const r = await db.workspace.updateMany({
    where: {
      basePlan: "FREE",
      subscription: { is: null },
      memberships: { some: { role: "OWNER", ...(userId ? { userId } : {}), user: { OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) } } },
    },
    data: { plan: "PRO", basePlan: "PRO" },
  });
  return { granted: r.count };
}
