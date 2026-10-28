import { parseBody, route } from "@/server/http/handler";
import { getSharing, setSharing, sharingSchema } from "@/server/services/crm/team-activity";

export const GET = route({}, async ({ userId }) => getSharing(userId ?? ""));

export const PUT = route({}, async ({ req, userId }) => setSharing(userId ?? "", (await parseBody(req, sharingSchema)).share));
