import { z } from "zod";
import { route } from "@/server/http/handler";
import { timesheet } from "@/server/services/time";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => {
  const week = z.string().date().optional().parse(req.nextUrl.searchParams.get("week") ?? undefined);
  return timesheet(userId ?? "", params.id, week ? new Date(`${week}T00:00:00.000Z`) : new Date());
});
