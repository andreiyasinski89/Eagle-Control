"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TimeZoneSection } from "./TimeZoneSection";

interface Ws {
  workspaceId: string;
  name: string;
  slug: string;
}
interface Status {
  pending: boolean;
  scheduledFor: string | null;
  graceDays: number;
  canRequest: boolean;
  blockers: (Ws & { candidates: number })[];
  willDelete: (Ws & { clients: number })[];
  leaves: Ws[];
}

/** One-time code by e-mail: ask for it, type it, and only then does the sensitive action run. */
function useCode(action: "export" | "delete") {
  const t = useTranslations("account");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.post<{ sentTo: string }>("/api/v1/account/challenge", { action }),
    onSuccess: (r) => {
      setSentTo(r.sentTo);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  return { sentTo, code, setCode, error, setError, send, reset: () => { setSentTo(null); setCode(""); } };
}

export function AccountPanel({ email, name }: { email: string; name: string | null }) {
  const t = useTranslations("account");
  const locale = useLocale();
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["account-deletion"], queryFn: () => api.get<Status>("/api/v1/account/deletion") });
  const exp = useCode("export");
  const del = useCode("delete");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [removeComments, setRemoveComments] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["account-deletion"] });
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : "");

  const download = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/account/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: exp.code }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new ApiFailure(res.status, "error", body?.error?.message ?? t("error"));
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `meetowl-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      exp.reset();
      setDone(t("exported"));
    },
    onError: (e) => exp.setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const request = useMutation({
    mutationFn: () => api.post<{ result: string }>("/api/v1/account/deletion", { code: del.code, confirmEmail, alsoRemoveComments: removeComments }),
    onSuccess: (r) => {
      del.reset();
      if (r.result === "erased") window.location.href = "/";
      refresh();
    },
    onError: (e) => del.setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const cancel = useMutation({ mutationFn: () => api.del("/api/v1/account/deletion"), onSuccess: refresh });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">
        {name ? `${name} · ` : ""}
        {email}
      </p>
      {done && <p role="status" className="text-sm">{done}</p>}

      <TimeZoneSection />

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">{t("exportTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("exportHint")}</p>
        {!exp.sentTo ? (
          <Button size="sm" className="w-fit" disabled={exp.send.isPending} onClick={() => exp.send.mutate()}>
            {t("sendCode")}
          </Button>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); download.mutate(); }}>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("codeSent", { to: exp.sentTo })}
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={exp.code} onChange={(e) => exp.setCode(e.target.value.replace(/\D/g, ""))} className="w-32" aria-label={t("code")} />
            </label>
            <Button type="submit" size="sm" disabled={exp.code.length !== 6 || download.isPending}>
              {t("download")}
            </Button>
          </form>
        )}
        {exp.error && <p role="alert" className="text-sm text-danger">{exp.error}</p>}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-[var(--health-red)]/50 bg-card p-4">
        <h2 className="font-semibold">{t("deleteTitle")}</h2>
        {status?.pending ? (
          <div data-testid="deletion-pending" className="flex flex-col gap-2 text-sm">
            <p role="status">{status.graceDays === 0 ? t("deletingNow") : t("scheduled", { date: date(status.scheduledFor) })}</p>
            <Button size="sm" variant="outline" className="w-fit" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {t("cancelDeletion")}
            </Button>
          </div>
        ) : status ? (
          <>
            <p className="text-sm text-muted-foreground">{t("deleteHint", { days: status.graceDays })}</p>
            {status.blockers.length > 0 && (
              <div role="alert" data-testid="blockers" className="rounded-md bg-[var(--health-red)]/15 p-3 text-sm">
                <p className="font-medium">{t("handOver")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {status.blockers.map((b) => (
                    <li key={b.workspaceId}>
                      <Link href={`/w/${b.slug}/settings/members`} className="underline">
                        {b.name}
                      </Link>{" "}
                      — {t("candidates", { n: b.candidates })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {status.willDelete.length > 0 && (
              <div data-testid="will-delete" className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{t("willDelete")}</p>
                <ul className="mt-1 list-disc pl-5">
                  {status.willDelete.map((w) => (
                    <li key={w.workspaceId}>
                      {w.name}
                      {w.clients > 0 && <span className="text-muted-foreground"> — {t("clientsLose", { n: w.clients })}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {status.leaves.length > 0 && <p className="text-sm text-muted-foreground">{t("youLeave", { names: status.leaves.map((l) => l.name).join(", ") })}</p>}
            <p className="text-sm text-muted-foreground">{t("whatStays")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={removeComments} onChange={(e) => setRemoveComments(e.target.checked)} />
              {t("removeComments")}
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("typeEmail")}
              <Input type="email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={email} className="max-w-sm" />
            </label>
            {!del.sentTo ? (
              <Button size="sm" variant="danger" className="w-fit" disabled={!status.canRequest || confirmEmail.trim().toLowerCase() !== email.toLowerCase() || del.send.isPending} onClick={() => del.send.mutate()}>
                {t("sendCode")}
              </Button>
            ) : (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t("codeSent", { to: del.sentTo })}
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={del.code} onChange={(e) => del.setCode(e.target.value.replace(/\D/g, ""))} className="w-32" aria-label={t("code")} />
                </label>
                <Button type="submit" size="sm" variant="danger" disabled={del.code.length !== 6 || request.isPending}>
                  {t("deleteAccount")}
                </Button>
              </form>
            )}
          </>
        ) : (
          <SkeletonRows rows={3} />
        )}
        {del.error && <p role="alert" className="text-sm text-danger">{del.error}</p>}
      </section>
    </div>
  );
}
