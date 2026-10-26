import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { exportContactsCsv } from "@/server/services/crm/imports";
import { listContactsSchema } from "@/server/services/crm/contacts";

export const GET = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const csv = await exportContactsCsv(userId ?? "", params.id, listContactsSchema.parse(Object.fromEntries(req.nextUrl.searchParams)));
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="contacts.csv"', "cache-control": "no-store" } });
});
