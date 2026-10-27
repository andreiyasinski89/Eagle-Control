import type { Membership, Node, Prisma } from "@prisma/client";
import { forbidden, notFound } from "@/server/http/errors";
import { isCrmType } from "@/modules/nodes/node-rules";
import { can, type Action } from "@/server/policies";
import { contactVisible } from "@/server/services/crm/scope";

export type Tx = Prisma.TransactionClient;

export interface NodeAccess {
  node: Node;
  membership: Membership;
  projectId: string;
}

export function projectIdOf(node: Pick<Node, "id" | "rootId">): string {
  return node.rootId ?? node.id;
}

/** Guests and clients only reach projects they were explicitly added to. */
async function assertProjectReachable(tx: Tx, membership: Membership, projectId: string): Promise<void> {
  if (membership.role !== "GUEST" && membership.role !== "CLIENT") return;
  const pm = await tx.projectMember.findUnique({
    where: { nodeId_userId: { nodeId: projectId, userId: membership.userId } },
  });
  if (!pm) throw notFound("node");
}

/** Loads a node (archived included) and checks the actor may act on it. Non-members get 404. */
export async function loadNode(tx: Tx, userId: string, nodeId: string, action: Action = "workspace:read"): Promise<NodeAccess> {
  const node = await tx.node.findUnique({ where: { id: nodeId } });
  if (!node) throw notFound("node");
  const membership = await tx.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: node.workspaceId } },
  });
  if (!membership) throw notFound("node");
  const projectId = projectIdOf(node);
  if (isCrmType(node.type)) {
    // Companies, contacts and deals sit behind the CRM flag: without it they do not exist for the caller.
    if (!can(membership, "crm:read")) throw notFound("node");
    // A member who sees only their own people or their team's: companies and deals do not exist for them, and neither do other people's contacts.
    if (node.type === "CONTACT" ? !(await contactVisible(tx, membership, node.id)) : !can(membership, "crm:full")) throw notFound("node");
    const writes = action !== "workspace:read" && action !== "comment:write";
    if (writes && !can(membership, "crm:write")) throw forbidden();
    return { node, membership, projectId };
  }
  await assertProjectReachable(tx, membership, projectId);
  if (!can(membership, action)) throw forbidden();
  return { node, membership, projectId };
}

export async function loadWorkspaceMember(tx: Tx, userId: string, workspaceId: string, action: Action): Promise<Membership> {
  const membership = await tx.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!membership) throw notFound("workspace");
  if (!can(membership, action)) throw forbidden();
  return membership;
}

export async function logActivity(
  tx: Tx,
  entry: { workspaceId: string; nodeId: string | null; actorId: string; action: string; diff?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.activityLog.create({ data: entry });
}
