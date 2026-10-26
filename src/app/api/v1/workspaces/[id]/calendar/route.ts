import { route } from "@/server/http/handler";
import { calendarQuerySchema, workspaceCalendar } from "@/server/services/nodes/views";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) =>
  workspaceCalendar(userId ?? "", params.id, calendarQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);
