import { cache } from "react";
import { z } from "zod";
import { db } from "@/server/db";
import { resolveUiMode, type UiMode } from "@/modules/ui-mode";

export const uiModeSchema = z.object({ mode: z.enum(["simple", "advanced"]) });

/** The mode the person works in: their own choice, or by default simple for someone who came through a platform invitation and advanced for anybody else. */
/** What the frame of every page needs to know about the person, asked once per page however many parts of the page want it. */
export const personFlags = cache((userId: string) => db.user.findUnique({ where: { id: userId }, select: { uiMode: true, referredById: true, deletionRequestedAt: true } }));

export async function getUiMode(userId: string): Promise<{ mode: UiMode; chosen: boolean }> {
  const u = await personFlags(userId);
  return { mode: resolveUiMode(u?.uiMode, !!u?.referredById), chosen: u?.uiMode === "simple" || u?.uiMode === "advanced" };
}

export async function setUiMode(userId: string, mode: UiMode) {
  await db.user.update({ where: { id: userId }, data: { uiMode: mode } });
  return getUiMode(userId);
}
