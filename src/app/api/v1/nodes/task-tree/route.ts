import { createTaskTreeSchema } from "@/modules/nodes/schemas";
import { json, parseBody, route } from "@/server/http/handler";
import { transact } from "@/server/services/nodes/ops";
import { createTaskTree } from "@/server/services/nodes/task-tree";

export const POST = route({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, userId }) => {
  const input = await parseBody(req, createTaskTreeSchema);
  const { result, changes } = await transact(userId ?? "", (ctx) => createTaskTree(ctx, input));
  return json({ ...result, changes }, 201);
});
