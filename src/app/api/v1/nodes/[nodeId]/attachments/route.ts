import { json, parseBody, route } from "@/server/http/handler";
import { confirmSchema, confirmUpload } from "@/server/services/attachments";

export const POST = route<{ nodeId: string }>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, confirmSchema);
  const a = await confirmUpload(userId ?? "", params.nodeId, input);
  return json({ id: a.id, fileName: a.fileName, mime: a.mime, size: a.size, createdAt: a.createdAt }, 201);
});
