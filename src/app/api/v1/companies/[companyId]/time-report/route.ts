import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { clientTimeReport, reportQuerySchema, timeReportCsv } from "@/server/services/time";

export const GET = route<{ companyId: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const q = reportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const report = await clientTimeReport(userId ?? "", params.companyId, q);
  if (q.format === "json") return report;
  return new NextResponse("﻿" + timeReportCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="time-${q.from}_${q.to}.csv"`, "cache-control": "no-store" } });
});
