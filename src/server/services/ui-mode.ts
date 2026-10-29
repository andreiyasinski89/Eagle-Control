import { z } from "zod";
import { db } from "@/server/db";
import { resolveUiMode, type UiMode } from "@/modules/ui-mode";

export const uiModeSchema = z.object({ mode: z.enum(["simple", "advanced"]) });

/** The mode the person works in: their own choice, or by default simple for someone who came through a platform invitation and advanced for anybody else. */
export async function getUiMode(userId: string): Promise<{ mode: UiMode; chosen: boolean }> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { uiMode: true, referredById: true } });
  return { mode: resolveUiMode(u?.uiMode, !!u?.referredById), chosen: u?.uiMode === "simple" || u?.uiMode === "advanced" };
}

export async function setUiMode(userId: string, mode: UiMode) {
  await db.user.update({ where: { id: userId }, data: { uiMode: mode } });
  return getUiMode(userId);
}
