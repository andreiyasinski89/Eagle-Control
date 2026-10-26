import { z } from "zod";
import { route } from "@/server/http/handler";
import { listPortalProjects } from "@/server/services/portal";

export const GET = route({}, async ({ req, userId }) => listPortalProjects(userId ?? "", z.string().min(1).parse(req.nextUrl.searchParams.get("workspaceId"))));
