import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
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
  return json(ws, 201);
});
