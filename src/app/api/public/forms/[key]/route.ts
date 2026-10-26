import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, guard, publicError } from "@/server/http/public";
import { getPublicForm } from "@/server/services/crm/lead-ingest";

type Ctx = { params: Promise<{ key: string }> };

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, null) });
}

/** The form definition the hosted page and custom embeds render from. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    guard(req, "form-get", 120);
    const { key } = await params;
    const form = await getPublicForm(key);
    const c = form.config; // owner and stage stay private
    const config = { title: c.title, submitLabel: c.submitLabel, successMessage: c.successMessage, consentText: c.consentText, redirectUrl: c.redirectUrl, fields: c.fields };
    return NextResponse.json({ name: form.name, config }, { headers: corsHeaders(req, null) });
  } catch (err) {
    return publicError(err, corsHeaders(req, null));
  }
}
