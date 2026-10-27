"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";

interface ShareDto {
  id: string;
  kind: "user" | "team";
  granteeId: string;
  name: string;
  level: "VIEW" | "EDIT";
}
interface Shares {
  items: ShareDto[];
  candidates: { users: { id: string; name: string }[]; teams: { id: string; name: string }[] };
}

/**
 * Who has been given access to one person, or to a whole group of people, and the means to give it and take it away.
 * The server decides who may manage this; anyone else gets nothing here (the panel stays empty).
 */
export function SharePanel({ kind, id }: { kind: "contact" | "group"; id: string }) {
  const t = useTranslations("share");
  const qc = useQueryClient();
  const base = kind === "contact" ? `/api/v1/contacts/${id}/shares` : `/api/v1/contact-groups/${id}/shares`;
  const key = ["shares", kind, id];
  const { data, isError } = useQuery({ queryKey: key, queryFn: () => api.get<Shares>(base), retry: false });
  const [who, setWho] = useState("");
  const [level, setLevel] = useState<"VIEW" | "EDIT">("VIEW");
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const code = e instanceof ApiFailure ? e.code : "";
    setError(["grantee_no_crm", "already_sees_all", "self_share"].includes(code) ? t(`error_${code}`) : e instanceof Error ? e.message : t("error"));
  };
  const grant = useMutation({
    mutationFn: (v: { who: string; level: "VIEW" | "EDIT" }) => {
      const [type, granteeId] = v.who.split(":");
      return api.post(base, { [type === "team" ? "teamId" : "userId"]: granteeId, level: v.level });
    },
    onSuccess: () => {
      setError(null);
      setWho("");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => api.del(`/api/v1/shares/${shareId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: fail,
  });

  if (isError || !data) return null;
  const given = new Set(data.items.map((s) => `${s.kind}:${s.granteeId}`));
  const options = [...data.candidates.users.map((u) => ({ value: `user:${u.id}`, label: u.name })), ...data.candidates.teams.map((x) => ({ value: `team:${x.id}`, label: `${t("team")}: ${x.name}` }))].filter((o) => !given.has(o.value));

  return (
    <div className="flex flex-col gap-2" data-testid={`share-panel-${kind}`}>
      {data.items.length === 0 && <p className="text-sm text-muted-foreground">{t("nobody")}</p>}
      <ul className="flex flex-col gap-1.5">
        {data.items.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm" data-testid="share-row">
            {s.kind === "team" && <Users className="size-4 text-muted-foreground" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <select
              className={`${selectClass} !h-8 !w-auto`}
              value={s.level}
              aria-label={`${t("level")} ${s.name}`}
              onChange={(e) => grant.mutate({ who: `${s.kind}:${s.granteeId}`, level: e.target.value as "VIEW" | "EDIT" })}
            >
              <option value="VIEW">{t("VIEW")}</option>
              <option value="EDIT">{t("EDIT")}</option>
            </select>
            <button type="button" aria-label={`${t("revoke")} ${s.name}`} title={t("revoke")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" onClick={() => revoke.mutate(s.id)} data-testid="share-revoke">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {options.length > 0 ? (
        <div className="flex items-center gap-2">
          <select className={`${selectClass} !h-8 min-w-0 flex-1`} value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("giveTo")} data-testid="share-who">
            <option value="">{t("giveTo")}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select className={`${selectClass} !h-8 !w-auto`} value={level} onChange={(e) => setLevel(e.target.value as "VIEW" | "EDIT")} aria-label={t("level")} data-testid="share-level">
            <option value="VIEW">{t("VIEW")}</option>
            <option value="EDIT">{t("EDIT")}</option>
          </select>
          <Button type="button" size="sm" disabled={!who || grant.isPending} onClick={() => grant.mutate({ who, level })} data-testid="share-add">
            {t("give")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("noCandidates")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
