import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { DEMO_OWNER_EMAIL, DEMO_SLUG, seedDemoData } from "./demo-seed";

/** A public demo has one shared sample workspace: anyone may open it, nothing in it is private, and a daily job puts it back. */
export const DEMO_SESSION_MS = 24 * 3_600_000;

/** Addresses that only exist for the demo; account export and deletion refuse them (their e-mails go nowhere). */
export const isDemoAddress = (email: string) => email.toLowerCase().endsWith("@meetowl.local");

let seeding: Promise<unknown> | null = null;
/** Fills the sample data on the first visit. Two visitors at once share one run; a second server racing us is tolerated. */
async function ensureDemoData(): Promise<void> {
  if (await db.workspace.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } })) return;
  seeding ??= seedDemoData().finally(() => (seeding = null));
  try {
    await seeding;
  } catch (e) {
    if (!(await db.workspace.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } }))) throw e;
  }
}

/** A session for the demo owner, as Auth.js would store it after a magic link. */
export async function startDemoSession(now = new Date()): Promise<{ token: string; expires: Date }> {
  await ensureDemoData();
  const user = await db.user.findUniqueOrThrow({ where: { email: DEMO_OWNER_EMAIL }, select: { id: true } });
  const token = randomBytes(32).toString("hex");
  const expires = new Date(now.getTime() + DEMO_SESSION_MS);
  await db.session.create({ data: { userId: user.id, sessionToken: token, expires } });
  return { token, expires };
}

/** Throws the visitors' changes away: the demo workspace is deleted and built again. Open sessions stay valid. */
export async function resetDemo(): Promise<{ reset: true }> {
  const users = await db.user.findMany({ where: { email: { endsWith: "@meetowl.local" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.$transaction([
    db.workspace.deleteMany({ where: { slug: DEMO_SLUG } }),
    db.notification.deleteMany({ where: { userId: { in: ids } } }),
    db.user.updateMany({ where: { id: { in: ids } }, data: { name: null } }),
  ]);
  await db.user.updateMany({ where: { email: DEMO_OWNER_EMAIL }, data: { name: "Demo Owner" } });
  await db.user.updateMany({ where: { email: "member@meetowl.local" }, data: { name: "Demo Member" } });
  await seedDemoData();
  return { reset: true };
}
