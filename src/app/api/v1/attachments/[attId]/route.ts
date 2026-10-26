import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { setAttachmentVisibility } from "@/server/services/portal";
import { removeAttachment } from "@/server/services/attachments";

export const DELETE = route<{ attId: string }>({}, async ({ params, userId }) => {
  await removeAttachment(userId ?? "", params.attId);
  return null;
});

export const PATCH = route<{ attId: string }>({}, async ({ req, params, userId }) => {
  const { visibleToClient } = await parseBody(req, z.object({ visibleToClient: z.boolean() }));
  await setAttachmentVisibility(userId ?? "", params.attId, visibleToClient);
  return null;
});
