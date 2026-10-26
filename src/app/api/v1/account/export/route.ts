import { NextResponse } from "next/server";
import { ApiError } from "@/server/http/errors";
import { parseBody, route } from "@/server/http/handler";
import { exportAccount, exportAllowed, exportSchema } from "@/server/services/account";

/** The download itself: a JSON file, only after the e-mailed code is given. */
export const POST = route({}, async ({ req, userId }) => {
  if (!exportAllowed(userId ?? "")) throw new ApiError(429, "rate_limited", "You can download your data three times an hour");
  const { code } = await parseBody(req, exportSchema);
  const data = await exportAccount(userId ?? "", code);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="meetowl-data-${day}.json"`, "cache-control": "no-store" } });
});
