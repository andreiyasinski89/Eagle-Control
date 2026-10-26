import { route } from "@/server/http/handler";
import { db } from "@/server/db";
import { hasFeature } from "@/modules/plans";
import { googleStatus } from "@/server/integrations/google";
import { slackStatus } from "@/server/integrations/slack";
import { telegramStatus } from "@/server/integrations/telegram";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

/** Everything the integrations page needs in one call: plan access, and each provider's state for this person. */
export const GET = route<{ id: string }>({}, async ({ params, userId }) => {
  const uid = userId ?? "";
  const m = await loadWorkspaceMember(db, uid, params.id, "workspace:read");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: params.id }, select: { plan: true } });
  const [google, slack, telegram] = await Promise.all([googleStatus(uid, params.id), slackStatus(uid, params.id), telegramStatus(uid, params.id)]);
  return { allowed: hasFeature(ws.plan, "integrations"), canManageSlack: can(m, "member:invite"), google, slack, telegram };
});
