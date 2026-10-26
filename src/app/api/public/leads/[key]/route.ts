import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { assertOriginAllowed, corsHeaders, guard, ipHash, publicError, readLeadBody } from "@/server/http/public";
import { getPublicForm, ingestLead } from "@/server/services/crm/lead-ingest";
import { db } from "@/server/db";

type Ctx = { params: Promise<{ key: string }> };

export async function OPTIONS(req: NextRequest, { params }: Ctx) {
  const form = await db.leadForm.findUnique({ where: { publicKey: (await params).key } });
  const allowed = (form?.config as { allowedOrigins?: string[] } | null)?.allowedOrigins ?? null;
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, allowed) });
}

/** Public lead form submission: JSON or a plain HTML form post. */
export async function POST(req: NextRequest, { params }: Ctx) {
  let headers: Record<string, string> = corsHeaders(req, null);
  try {
    guard(req, "lead-post", 10);
    const { key } = await params;
    const form = await getPublicForm(key);
    headers = corsHeaders(req, form.config.allowedOrigins);
    assertOriginAllowed(req, form.config.allowedOrigins);
    guard(req, "lead-form:" + form.id, 120); // per form, across all senders

    const { data, isForm } = await readLeadBody(req);
    const result = await ingestLead(
      {
        workspaceId: form.workspaceId,
        source: "form:" + form.id,
        sourceLabel: form.name,
        pipelineId: (await db.leadForm.findUniqueOrThrow({ where: { id: form.id } })).pipelineId,
        stageId: form.config.stageId,
        ownerId: form.config.ownerId,
        idempotencyKey: req.headers.get("idempotency-key"),
        ipHash: ipHash(req),
      },
      data,
    );
    const wantsHtml = isForm && (req.headers.get("accept") ?? "").includes("text/html");
    if (wantsHtml) {
      const target = form.config.redirectUrl ?? env().APP_URL + "/f/" + key + "?sent=1";
      return NextResponse.redirect(target, { status: 303, headers });
    }
    return NextResponse.json({ ok: true, message: form.config.successMessage, status: result.status === "rejected" ? "created" : result.status }, { status: 201, headers });
  } catch (err) {
    return publicError(err, headers);
  }
}
