import type { Node } from "@prisma/client";
import { z } from "zod";
import { createNodeSchema, moveNodeSchema, patchNodeSchema } from "@/modules/nodes/schemas";
import {
  archiveNode,
  completeNode,
  createNode,
  moveNode,
  patchNode,
  restoreNode,
  transact,
  type OpContext,
} from "./ops";

export function nodeDto(n: Node) {
  return { ...n, estimation: n.estimation === null ? null : Number(n.estimation) };
}

const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), input: createNodeSchema }),
  z.object({ op: z.literal("patch"), id: z.string(), patch: patchNodeSchema }),
  z.object({ op: z.literal("move"), id: z.string(), move: moveNodeSchema }),
  z.object({ op: z.literal("archive"), id: z.string() }),
  z.object({ op: z.literal("restore"), id: z.string() }),
  z.object({ op: z.literal("complete"), id: z.string() }),
]);

export const batchSchema = z.object({ ops: z.array(op).min(1).max(100) });
export type BatchOp = z.infer<typeof op>;

async function run(ctx: OpContext, o: BatchOp) {
  switch (o.op) {
    case "create":
      return { op: o.op, node: nodeDto(await createNode(ctx, o.input)) };
    case "patch":
      return { op: o.op, node: nodeDto(await patchNode(ctx, o.id, o.patch)) };
    case "move":
      return { op: o.op, node: nodeDto(await moveNode(ctx, o.id, o.move)) };
    case "archive":
      return { op: o.op, id: o.id, ...(await archiveNode(ctx, o.id)) };
    case "restore":
      return { op: o.op, id: o.id, ...(await restoreNode(ctx, o.id)) };
    case "complete":
      return { op: o.op, node: nodeDto(await completeNode(ctx, o.id)) };
  }
}

/** All-or-nothing: the first failing op rolls the whole batch back. Used for undo/redo of compound actions. */
export async function runBatch(userId: string, ops: BatchOp[]) {
  const { result, changes } = await transact(userId, async (ctx) => {
    const results = [];
    for (const o of ops) results.push(await run(ctx, o));
    return results;
  });
  return { results: result, changes };
}
