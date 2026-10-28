import { route } from "@/server/http/handler";
import { db } from "@/server/db";
import { hasFeature } from "@/modules/plans";
import { googleStatus } from "@/server/integrations/google";
import { slackStatus } from "@/server/integrations/slack";
import { telegramStatus } from "@/server/integrations/telegram";
import { can } from "@/server/policies";
import { appUrl } from "@/server/integrations/common";
import { isSuperAdminEmail } from "@/server/services/admin";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

/** Everything the integrations page needs in one call: plan access, and each provider's state for this person. */
export const GET = route<{ id: string }>({}, async ({ params, userId }) => {
  const uid = userId ?? "";
  const m = await loadWorkspaceMember(db, uid, params.id, "workspace:read");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: params.id }, select: { plan: true } });
  const [google, slack, telegram, me] = await Promise.all([googleStatus(uid, params.id), slackStatus(uid, params.id), telegramStatus(uid, params.id), db.user.findUnique({ where: { id: uid }, select: { email: true } })]);
  // `platformAdmin`: the owner of the whole platform, who is the one to fill in the provider keys (and is sent to the setup page for it).
  return { allowed: hasFeature(ws.plan, "integrations"), canManageSlack: can(m, "member:invite"), platformAdmin: isSuperAdminEmail(me?.email), claude: { url: `${appUrl()}/api/mcp`, secure: appUrl().startsWith("https://") }, google, slack, telegram };
});
