import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { materialFileUrl } from "@/server/services/crm/materials";

/** The picture itself, passed through our server so the browser may draw on it (the QR code) without the storage allowing other sites. */
export const GET = route<{ materialId: string }>({}, async ({ params, userId }) => {
  const f = await materialFileUrl(userId ?? "", params.materialId);
  const res = await fetch(f.url);
  if (!res.ok || !res.body) return NextResponse.json({ error: { code: "file_unavailable", message: "The file could not be read" } }, { status: 502 });
  return new NextResponse(res.body, { headers: { "content-type": f.mime, "cache-control": "private, max-age=60" } });
});
