import { route } from "@/server/http/handler";
import { db } from "@/server/db";
import { currentTimer } from "@/server/services/time";

export const GET = route({}, async ({ userId }) => ({ timer: await currentTimer(db, userId ?? "") }));
