import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { downloadUrl } from "@/server/services/attachments";

/** Short-lived redirect to a signed URL; access is checked on every request. */
export const GET = route<{ attId: string }>({}, async ({ params, userId }) =>
  NextResponse.redirect(await downloadUrl(userId ?? "", params.attId), 302),
);
