import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { crmReport, crmReportCsv, crmReportQuerySchema } from "@/server/services/crm/reports";

export const GET = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const q = crmReportQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const report = await crmReport(userId ?? "", params.id, q);
  if (q.format === "json") return report;
  return new NextResponse("﻿" + crmReportCsv(report, q.section), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="crm-${q.section}-${q.from}_${q.to}.csv"`, "cache-control": "no-store" } });
});
