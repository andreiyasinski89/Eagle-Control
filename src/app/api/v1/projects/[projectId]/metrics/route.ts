import { route } from "@/server/http/handler";
import { metricsQuerySchema, projectMetrics } from "@/server/services/metrics";

export const GET = route<{ projectId: string }>({}, async ({ req, params, userId }) =>
  projectMetrics(userId ?? "", params.projectId, metricsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);
