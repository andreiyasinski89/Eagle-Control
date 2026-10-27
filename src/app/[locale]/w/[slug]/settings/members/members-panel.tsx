"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Phone, Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { telegramUrl } from "@/modules/account/profile";

type Level = "NONE" | "OWN" | "TEAM" | "ALL";
const LEVELS: Level[] = ["NONE", "OWN", "TEAM", "ALL"];
type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | "CLIENT";
const INVITE_ROLES: Role[] = ["ADMIN", "MEMBER", "GUEST", "CLIENT"];

interface Props {
  workspaceId: string;
  meId: string;
  canManage: boolean;
  isOwner: boolean;
  members: { userId: string; name: string | null; email: string; avatar: string | null; phone: string | null; telegram: string | null; role: Role; crmAccess: boolean; crmLevel: Level; teamScope: "OWN" | "TEAM" | "ALL" | null; hourlyRate: number | null }[];
  invitations: { id: string; email: string; role: Role }[];
}

export function MembersPanel({ workspaceId, meId, canManage, isOwner, members, invitations }: Props) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [crmLevel, setCrmLevel] = useState<Level>("NONE");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const base = `/api/v1/workspaces/${workspaceId}`;

  async function call(url: string, init: RequestInit): Promise<boolean> {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    if (res.ok) {
      router.refresh();
      return true;
    }
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    setMessage({ kind: "err", text: body?.error?.code === "plan_limit" ? t("limit") : (body?.error?.message ?? tc("error")) });
    return false;
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (await call(`${base}/invitations`, { method: "POST", body: JSON.stringify({ email, role, crmLevel }) })) {
      setEmail("");
      setMessage({ kind: "ok", text: t("sent") });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {canManage && (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <label htmlFor="invite-email" className="text-sm font-medium">
              {t("email")}
            </label>
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-role" className="text-sm font-medium">
              {t("role")}
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </select>
          </div>
          {(role === "MEMBER" || role === "GUEST") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="invite-crm" className="text-sm font-medium">
                {t("crmAccess")}
              </label>
              <select id="invite-crm" value={crmLevel} onChange={(e) => setCrmLevel(e.target.value as Level)} className="h-9 rounded-md border border-border bg-card px-2 text-sm" data-testid="invite-crm-level">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`level.${l}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit">{t("invite")}</Button>
        </form>
      )}
      {message && (
        <p role={message.kind === "err" ? "alert" : "status"} className={message.kind === "err" ? "text-sm text-danger" : "text-sm"}>
          {message.text}
        </p>
      )}

      <ul className="flex flex-col gap-3" data-testid="member-list">
        {members.map((m) => {
          const label = m.name ?? m.email;
          const canMakeOwner = isOwner && (m.role === "ADMIN" || m.role === "MEMBER");
          const canRemove = canManage && m.userId !== meId && m.role !== "OWNER";
          return (
            <li key={m.userId} className="rounded-2xl border border-border bg-card p-4" data-testid="member-card">
              <div className="flex flex-col gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.name} email={m.email} src={m.avatar} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{label}</span>
                      {m.userId === meId && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("you")}</span>}
                    </div>
                    {m.name && <div className="truncate text-sm text-muted-foreground">{m.email}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {m.phone && (
                        <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                          <Phone className="size-3" aria-hidden />
                          {m.phone}
                        </a>
                      )}
                      {m.telegram && (
                        <a href={telegramUrl(m.telegram)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                          <Send className="size-3" aria-hidden />@{m.telegram}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-border pt-3">
                  <Cell label={t("roleShort")} className="w-28">
                    <span className="inline-flex h-9 items-center rounded-md bg-muted px-2.5 text-sm">{tr(m.role)}</span>
                  </Cell>
                  <Cell label={t("crmShort")} className="w-48">
                    {m.role === "MEMBER" && canManage ? (
                      <select
                        value={m.crmLevel}
                        aria-label={`${t("crmAccess")} ${label}`}
                        data-testid="member-crm-level"
                        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                        onChange={(e) => void call(`${base}/members/${m.userId}`, { method: "PATCH", body: JSON.stringify({ crmLevel: e.target.value }) })}
                      >
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {t(`level.${l}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex h-9 items-center text-sm text-muted-foreground">{m.crmAccess || m.role === "OWNER" || m.role === "ADMIN" ? t(`level.${m.crmLevel}`) : "—"}</span>
                    )}
                    {(m.teamScope === "TEAM" || m.teamScope === "ALL") && m.role === "MEMBER" && <span className="text-xs text-muted-foreground">{t("viaTeam", { level: t(`level.${m.teamScope}`) })}</span>}
                  </Cell>
                  <Cell label={t("rateShort")} className="w-28">
                    {canManage ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={m.hourlyRate ?? ""}
                        aria-label={`${t("hourlyRate")} ${label}`}
                        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== m.hourlyRate) void call(`${base}/members/${m.userId}`, { method: "PATCH", body: JSON.stringify({ hourlyRate: v }) });
                        }}
                      />
                    ) : (
                      <span className="inline-flex h-9 items-center text-sm text-muted-foreground">—</span>
                    )}
                  </Cell>

                  {canMakeOwner || canRemove ? (
                    <div className="ml-auto flex flex-wrap gap-2">
                      {canMakeOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(t("makeOwnerConfirm", { name: label }))) void call(`${base}/transfer-ownership`, { method: "POST", body: JSON.stringify({ userId: m.userId }) });
                          }}
                        >
                          {t("makeOwner")}
                        </Button>
                      )}
                      {canRemove && (
                        <Button variant="danger" size="sm" onClick={() => call(`${base}/members/${m.userId}`, { method: "DELETE" })}>
                          {tc("remove")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && invitations.length > 0 && (
        <div>
          <h2 className="mb-2 font-medium">{t("pending")}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {i.email} · {tr(i.role)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => call(`${base}/invitations/${i.id}`, { method: "DELETE" })}>
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A labelled slot of a member's card: the same caption above every control, so the rows line up. */
function Cell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
