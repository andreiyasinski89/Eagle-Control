import { z } from "zod";
import { db } from "@/server/db";
import { json, parseBody, route } from "@/server/http/handler";
import { addStarterScripts } from "@/server/services/crm/scripts";
import { startTrial, syncPlan } from "@/server/services/entitlements";
import { assertCanCreateWorkspace, sendWelcome } from "@/server/services/signup";
import { createWorkspace, listWorkspacesForUser } from "@/server/services/workspace";

export const GET = route({}, async ({ userId }) => listWorkspacesForUser(userId ?? ""));

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().min(2).max(40).optional(),
});

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, userId }) => {
  const input = await parseBody(req, createSchema);
  const first = (await listWorkspacesForUser(userId ?? "")).length === 0;
  await assertCanCreateWorkspace(userId ?? "");
  const ws = await createWorkspace(userId ?? "", input.name, input.slug);
  // The first workspace of a new person: a short welcome with the first steps.
  if (first) await sendWelcome(userId ?? "", ws);
  // The first workspace of a person starts with ready-made scripts for every stage, in their language, to rewrite as they like.
  if (first) {
    const me = await db.user.findUnique({ where: { id: userId ?? "" }, select: { locale: true } });
    await addStarterScripts(userId ?? "", ws.id, me?.locale).catch((e) => console.error("starter scripts failed", e instanceof Error ? e.message : e));
  }
  // While paid plans are off the new workspace has everything at once; when they are on, a person's first one starts with 14 days of Pro, no card needed.
  await syncPlan(ws.id).catch((e) => console.error("plan sync failed", e instanceof Error ? e.message : e));
  await startTrial(userId ?? "", ws.id).catch((e) => console.error("trial failed", e instanceof Error ? e.message : e));
  return json(ws, 201);
});
