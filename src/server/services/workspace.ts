import type { Plan } from "@prisma/client";
import { db } from "@/server/db";
import { slugify } from "@/lib/slug";
import { checkLimit, PLAN_LIMITS, type LimitKey } from "@/modules/plans";
import { DEFAULT_LOST_REASONS, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from "@/modules/crm/defaults";

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; await db.workspace.findUnique({ where: { slug: candidate }, select: { id: true } }); i++) {
    candidate = `${base}-${i}`;
  }
  return candidate;
}

export async function createWorkspace(userId: string, name: string, slug?: string) {
  const finalSlug = await uniqueSlug(slugify(slug ?? name));
  return db.workspace.create({
    data: {
      name,
      slug: finalSlug,
      memberships: { create: { userId, role: "OWNER", crmAccess: true } },
      pipelines: {
        create: {
          name: DEFAULT_PIPELINE_NAME,
          isDefault: true,
          stages: {
            create: DEFAULT_STAGES.map((s, order) => ({
              name: s.name,
              order,
              probability: s.probability,
              isWon: s.isWon ?? false,
              isLost: s.isLost ?? false,
            })),
          },
        },
      },
      lostReasons: { create: DEFAULT_LOST_REASONS.map((name) => ({ name })) },
    },
  });
}

export function listWorkspacesForUser(userId: string) {
  return db.workspace.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getUsage(workspaceId: string, plan: Plan) {
  const [members, pendingInvites, projects, pipelines, contacts] = await Promise.all([
    db.membership.count({ where: { workspaceId } }),
    db.invitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: new Date() } } }),
    db.node.count({ where: { workspaceId, type: "PROJECT", archivedAt: null } }),
    db.pipeline.count({ where: { workspaceId } }),
    db.node.count({ where: { workspaceId, type: "CONTACT" } }),
  ]);
  const used: Record<LimitKey, number> = { users: members + pendingInvites, projects, pipelines, contacts };
  const keys = Object.keys(used) as LimitKey[];
  return {
    plan,
    usage: Object.fromEntries(
      keys.map((key) => [
        key,
        { used: used[key], limit: Number.isFinite(PLAN_LIMITS[plan][key]) ? PLAN_LIMITS[plan][key] : null },
      ]),
    ),
    // convenience for paywall hints in the UI
    atLimit: keys.filter((k) => !checkLimit(plan, k, used[k]).allowed),
  };
}
