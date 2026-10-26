import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { createWorkspace, listWorkspacesForUser } from "@/server/services/workspace";

export const GET = route({}, async ({ userId }) => listWorkspacesForUser(userId ?? ""));

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().min(2).max(40).optional(),
});

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, userId }) => {
  const input = await parseBody(req, createSchema);
  return json(await createWorkspace(userId ?? "", input.name, input.slug), 201);
});
