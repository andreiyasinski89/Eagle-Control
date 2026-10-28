import { json, parseBody, route } from "@/server/http/handler";
import { mergeRepeats, mergeRepeatsSchema, projectRepeats } from "@/server/services/nodes/repeats";

type P = { projectId: string };

/** What could be merged into repeating events in this project. */
export const GET = route<P>({}, async ({ params, userId }) => projectRepeats(userId ?? "", params.projectId));

/** Merges the chosen series: one event stays and repeats, the copies are archived. */
export const POST = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await mergeRepeats(userId ?? "", params.projectId, (await parseBody(req, mergeRepeatsSchema)).keep)));
