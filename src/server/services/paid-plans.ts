import { env } from "@/lib/env";
import { db } from "@/server/db";

export type PaidMode = "off" | "preview" | "on";

const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const previewEmails = (): string[] => list(env().PAID_PLANS_PREVIEW_EMAILS);

/** What the switch says: everyone free (off), the listed owners' workspaces under paid rules (preview), or everyone (on). */
export function paidMode(): PaidMode {
  if (env().PAID_PLANS) return "on";
  return previewEmails().length > 0 ? "preview" : "off";
}

/** Whether the paid rules (limits, locks, trial, payments) apply to this workspace now. */
export async function isEnforcedFor(workspaceId: string): Promise<boolean> {
  const mode = paidMode();
  if (mode === "on") return true;
  if (mode === "off") return false;
  const owners = await db.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { user: { select: { email: true } } } });
  const emails = new Set(previewEmails());
  return owners.some((o) => emails.has(o.user.email.trim().toLowerCase()));
}
