import type { Node } from "@prisma/client";

/** Workspace-relative path to a node's page (the bell and e-mails prefix `/w/<slug>`). */
export function nodePath(n: Pick<Node, "id" | "type" | "rootId">): string {
  if (n.type === "DEAL") return `/crm?deal=${n.id}`;
  if (n.type === "CONTACT") return `/crm/contacts?contact=${n.id}`;
  if (n.type === "COMPANY") return `/crm/companies/${n.id}`;
  return `/projects/p/${n.rootId ?? n.id}${n.rootId ? `?node=${n.id}` : ""}`;
}
