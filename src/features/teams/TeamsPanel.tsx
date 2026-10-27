"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Access = "NONE" | "TEAM" | "ALL";
interface Team {
  id: string;
  name: string;
  leaderId: string | null;
  crmScope: "OWN" | "TEAM" | "ALL" | null;
  memberIds: string[];
}
interface Person {
  userId: string;
  name: string;
}

/** Hand-made teams: who is in each, who leads it, and what the team gives its members in the CRM. */
export function TeamsPanel({ workspaceId, teams, people }: { workspaceId: string; teams: Team[]; people: Person[] }) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) {
      router.refresh();
      return true;
    }
    const b = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    setError(b?.error?.code === "team_exists" ? t("exists") : (b?.error?.message ?? tc("error")));
    return false;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="teams-panel">
      <TeamForm key={`new-${teams.length}`} people={people} initial={{ name: "", leaderId: null, crmScope: null, memberIds: [] }} submitLabel={t("create")} onSubmit={(v) => call(`/api/v1/workspaces/${workspaceId}/teams`, "POST", v)} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {teams.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {teams.map((team) => (
        <TeamForm
          key={`${team.id}-${team.name}-${team.crmScope}-${team.leaderId}-${team.memberIds.join(",")}`}
          people={people}
          initial={team}
          submitLabel={tc("save")}
          onSubmit={(v) => call(`/api/v1/teams/${team.id}`, "PATCH", v)}
          onDelete={() => {
            if (window.confirm(t("deleteConfirm", { name: team.name }))) void call(`/api/v1/teams/${team.id}`, "DELETE");
          }}
        />
      ))}
    </div>
  );
}

function TeamForm({ people, initial, submitLabel, onSubmit, onDelete }: { people: Person[]; initial: Omit<Team, "id">; submitLabel: string; onSubmit: (v: { name: string; leaderId: string | null; crmScope: "TEAM" | "ALL" | null; memberIds: string[] }) => Promise<boolean>; onDelete?: () => void }) {
  const t = useTranslations("teams");
  const [name, setName] = useState(initial.name);
  const [leaderId, setLeaderId] = useState(initial.leaderId ?? "");
  const [access, setAccess] = useState<Access>(initial.crmScope === "TEAM" || initial.crmScope === "ALL" ? initial.crmScope : "NONE");
  const [ids, setIds] = useState<string[]>(initial.memberIds);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-testid={onDelete ? "team-card" : "team-new"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit({ name, leaderId: leaderId || null, crmScope: access === "NONE" ? null : access, memberIds: leaderId && !ids.includes(leaderId) ? [...ids, leaderId] : ids });
        setBusy(false);
        if (ok && !onDelete) {
          setName("");
          setLeaderId("");
          setAccess("NONE");
          setIds([]);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label className="text-sm font-medium">{t("name")}</label>
          <Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} data-testid="team-name" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("leader")}</label>
          <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
            <option value="">{t("noLeader")}</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">{t("access")}</label>
          <select value={access} onChange={(e) => setAccess(e.target.value as Access)} className="h-9 rounded-md border border-border bg-card px-2 text-sm" data-testid="team-access">
            <option value="NONE">{t("access_NONE")}</option>
            <option value="TEAM">{t("access_TEAM")}</option>
            <option value="ALL">{t("access_ALL")}</option>
          </select>
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="mb-1 text-sm font-medium">{t("members")}</legend>
        {people.map((p) => (
          <label key={p.userId} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={ids.includes(p.userId) || leaderId === p.userId} disabled={leaderId === p.userId} onChange={() => toggle(p.userId)} />
            {p.name}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {submitLabel}
        </Button>
        {onDelete && (
          <Button type="button" variant="danger" onClick={onDelete}>
            {t("delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
