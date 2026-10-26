"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | "CLIENT";
const INVITE_ROLES: Role[] = ["ADMIN", "MEMBER", "GUEST", "CLIENT"];

interface Props {
  workspaceId: string;
  meId: string;
  canManage: boolean;
  isOwner: boolean;
  members: { userId: string; name: string | null; email: string; role: Role; crmAccess: boolean; hourlyRate: number | null }[];
  invitations: { id: string; email: string; role: Role }[];
}

export function MembersPanel({ workspaceId, meId, canManage, isOwner, members, invitations }: Props) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [crmAccess, setCrmAccess] = useState(false);
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
    if (await call(`${base}/invitations`, { method: "POST", body: JSON.stringify({ email, role, crmAccess }) })) {
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
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={crmAccess} onChange={(e) => setCrmAccess(e.target.checked)} />
            {t("crmAccess")}
          </label>
          <Button type="submit">{t("invite")}</Button>
        </form>
      )}
      {message && (
        <p role={message.kind === "err" ? "alert" : "status"} className={message.kind === "err" ? "text-sm text-danger" : "text-sm"}>
          {message.text}
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 p-3">
            <div>
              <div className="font-medium">{m.name ?? m.email}</div>
              {m.name && <div className="text-sm text-muted-foreground">{m.email}</div>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="rounded bg-muted px-2 py-0.5">{tr(m.role)}</span>
              {m.crmAccess && <span className="text-muted-foreground">CRM</span>}
              {canManage && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("hourlyRate")}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={m.hourlyRate ?? ""}
                    aria-label={`${t("hourlyRate")} ${m.name ?? m.email}`}
                    className="h-8 w-20 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== m.hourlyRate) void call(`${base}/members/${m.userId}`, { method: "PATCH", body: JSON.stringify({ hourlyRate: v }) });
                    }}
                  />
                </label>
              )}
              {isOwner && (m.role === "ADMIN" || m.role === "MEMBER") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(t("makeOwnerConfirm", { name: m.name ?? m.email }))) void call(`${base}/transfer-ownership`, { method: "POST", body: JSON.stringify({ userId: m.userId }) });
                  }}
                >
                  {t("makeOwner")}
                </Button>
              )}
              {canManage && m.userId !== meId && m.role !== "OWNER" && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => call(`${base}/members/${m.userId}`, { method: "DELETE" })}
                >
                  {tc("remove")}
                </Button>
              )}
            </div>
          </li>
        ))}
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
