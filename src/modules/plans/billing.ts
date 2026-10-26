import type { Plan } from "@prisma/client";

/** How long a workspace keeps Pro after a failed payment before it drops to Free. */
export const GRACE_DAYS = 7;
const DAY = 86_400_000;

export interface SubState {
  /** Stripe's subscription status. */
  status: string;
  pastDueSince: Date | null;
}

export const graceEndsAt = (pastDueSince: Date): Date => new Date(pastDueSince.getTime() + GRACE_DAYS * DAY);

/**
 * The plan a Stripe subscription entitles a workspace to. Enterprise is a manual contract and never changes here.
 * Past-due keeps Pro for the grace period; anything that is not paying (canceled, unpaid, expired) is Free.
 */
export function planFor(current: Plan, sub: SubState, now: Date): Plan {
  if (current === "ENTERPRISE") return current;
  switch (sub.status) {
    case "active":
    case "trialing":
      return "PRO";
    case "past_due":
      return sub.pastDueSince && now < graceEndsAt(sub.pastDueSince) ? "PRO" : sub.pastDueSince ? "FREE" : "PRO";
    default:
      return "FREE";
  }
}
