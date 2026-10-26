import type { NodeStatus } from "@prisma/client";
import { isCounting } from "@/modules/nodes/node-rules";
import type { Tx } from "./access";

export interface StatusChange {
  nodeId: string;
  projectId: string;
  type: Parameters<typeof isCounting>[0];
  from: NodeStatus | null;
  to: NodeStatus;
}

/** History of status changes: the data behind cumulative flow, cycle time and throughput. Only project-tree work items count. */
export async function recordStatusChanges(tx: Tx, changes: readonly StatusChange[], actorId: string | null, at = new Date()): Promise<void> {
  const rows = changes.filter((c) => isCounting(c.type) && c.from !== c.to);
  if (rows.length === 0) return;
  await tx.nodeStatusEvent.createMany({
    data: rows.map((c) => ({ nodeId: c.nodeId, projectId: c.projectId, fromStatus: c.from, toStatus: c.to, at, actorId })),
  });
}
