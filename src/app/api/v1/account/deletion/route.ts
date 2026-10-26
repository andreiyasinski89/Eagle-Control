import { json, parseBody, route } from "@/server/http/handler";
import { cancelDeletion, deletionSchema, deletionStatus, requestDeletion } from "@/server/services/account";

export const GET = route({}, async ({ userId }) => deletionStatus(userId ?? ""));

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, userId }) => json(await requestDeletion(userId ?? "", await parseBody(req, deletionSchema)), 202));

export const DELETE = route({}, async ({ userId }) => {
  await cancelDeletion(userId ?? "");
  return null;
});
