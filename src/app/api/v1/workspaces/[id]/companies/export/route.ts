import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { exportCompaniesCsv } from "@/server/services/crm/imports";

export const GET = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ params, userId }) => {
  const csv = await exportCompaniesCsv(userId ?? "", params.id);
  return new NextResponse("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="companies.csv"', "cache-control": "no-store" } });
});
