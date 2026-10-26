import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/server/http/errors";
import { guard, ipHash, publicError, readLeadBody } from "@/server/http/public";
import { ingestLead, resolveWebhook } from "@/server/services/crm/lead-ingest";

/**
 * Inbound leads from Tilda, Zapier, Make… Authenticate with "Authorization: Bearer <token>"
 * (the token from Settings → Lead capture). Send "Idempotency-Key" to make retries safe.
 */
export async function POST(req: NextRequest) {
  try {
    guard(req, "hook-post", 60);
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
    const token = bearer ?? req.nextUrl.searchParams.get("token");
    const hook = token ? await resolveWebhook(token) : null;
    if (!hook) throw new ApiError(401, "invalid_token", "Unknown or revoked token");
    guard(req, "hook:" + hook.workspaceId, 600);

    const { data } = await readLeadBody(req);
    const result = await ingestLead(
      { workspaceId: hook.workspaceId, source: "webhook", sourceLabel: "Webhook", pipelineId: hook.pipelineId, stageId: hook.stageId, ownerId: hook.ownerId, idempotencyKey: req.headers.get("idempotency-key"), ipHash: ipHash(req) },
      data,
    );
    return NextResponse.json({ ok: true, status: result.status, dealId: result.dealId, contactId: result.contactId }, { status: 201 });
  } catch (err) {
    return publicError(err);
  }
}
