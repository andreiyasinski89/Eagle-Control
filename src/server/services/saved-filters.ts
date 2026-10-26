import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { filterCriteriaSchema } from "@/modules/nodes/filters";
import { loadWorkspaceMember } from "./nodes/access";

export const savedFilterSchema = z.object({
  name: z.string().trim().min(1).max(60),
  criteria: filterCriteriaSchema,
});

export async function listSavedFilters(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  return db.savedFilter.findMany({ where: { userId, workspaceId }, orderBy: { createdAt: "asc" } });
}

export async function createSavedFilter(userId: string, workspaceId: string, input: z.infer<typeof savedFilterSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  return db.savedFilter.create({
    data: { userId, workspaceId, name: input.name, criteria: input.criteria as Prisma.InputJsonValue },
  });
}

export async function deleteSavedFilter(userId: string, id: string) {
  const res = await db.savedFilter.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw notFound("filter");
}
