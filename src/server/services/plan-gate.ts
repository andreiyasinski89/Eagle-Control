import { db } from "@/server/db";
import { hasFeature, type Feature } from "@/modules/plans";
import type { Tx } from "@/server/services/nodes/access";
import { planFeatureRequired } from "./metrics";

/**
 * Refuses (402 "plan_feature", which the screens turn into "Available in Pro") when the workspace's plan does not include `feature`.
 * While paid plans are off every workspace is on Pro (see syncPlan), so nothing is refused until the owner turns them on.
 */
export async function requirePlanFeature(workspaceId: string, feature: Feature, client: Pick<Tx, "workspace"> = db): Promise<void> {
  const ws = await client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  if (!hasFeature(ws.plan, feature)) throw planFeatureRequired(feature);
}

/** The same question without refusing, for reads that leave the locked part out instead. */
export async function planHas(workspaceId: string, feature: Feature): Promise<boolean> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  return hasFeature(ws.plan, feature);
}
