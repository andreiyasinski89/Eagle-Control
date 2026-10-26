import { json, parseBody, route } from "@/server/http/handler";
import { listApprovals, requestApproval, requestApprovalSchema } from "@/server/services/portal";

type P = { nodeId: string };

export const GET = route<P>({}, async ({ params, userId }) => ({ items: await listApprovals(userId ?? "", params.nodeId) }));

export const POST = route<P>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await requestApproval(userId ?? "", params.nodeId, await parseBody(req, requestApprovalSchema)), 201));
