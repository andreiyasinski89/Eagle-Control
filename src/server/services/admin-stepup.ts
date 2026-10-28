import { z } from "zod";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { consumeChallenge, sendChallenge } from "./account";
import { requireSuperAdmin } from "./admin";

/** After the code from the e-mail, the dangerous actions of the admin stay open this long. */
export const STEP_UP_MINUTES = 10;
export const stepUpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/**
 * The platform owner proves it is really them, again, before anything that cannot be taken back (deleting or blocking an account,
 * changing a role, a plan or points): a one-time code to their mailbox, good for ten minutes. A session left open in a browser, or a stolen
 * one, then cannot do harm without the mailbox as well. It is the same kind of code a person needs to delete their own account.
 */
export async function stepUpStatus(userId: string, now = new Date()) {
  await requireSuperAdmin(userId);
  const last = await db.accountChallenge.findFirst({ where: { userId, action: "admin", usedAt: { gt: new Date(now.getTime() - STEP_UP_MINUTES * 60_000) } }, orderBy: { usedAt: "desc" }, select: { usedAt: true } });
  return { fresh: !!last?.usedAt, until: last?.usedAt ? new Date(last.usedAt.getTime() + STEP_UP_MINUTES * 60_000) : null };
}

export async function sendStepUpCode(userId: string, now = new Date()) {
  await requireSuperAdmin(userId);
  return sendChallenge(userId, "admin", now);
}

export async function verifyStepUp(userId: string, code: string, now = new Date()) {
  await requireSuperAdmin(userId);
  await consumeChallenge(userId, "admin", code, now);
  return stepUpStatus(userId, now);
}

/** Put before a dangerous act of the admin: refuses (403 `step_up_required`) unless the code was entered in the last ten minutes. */
export async function requireFreshAdmin(userId: string, now = new Date()): Promise<void> {
  if (!(await stepUpStatus(userId, now)).fresh) throw new ApiError(403, "step_up_required", "Confirm it is you first: enter the code sent to your e-mail.");
}
