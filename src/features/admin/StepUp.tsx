"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";

interface Status {
  fresh: boolean;
  until: string | null;
}

/**
 * The proof the platform owner gives before anything that cannot be taken back: a code from their mailbox, good for ten minutes.
 * Without it the dangerous buttons of the admin answer with "confirm it is you first"; `prompt` counts those refusals and opens this box.
 */
export function StepUp({ prompt }: { prompt: number }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["admin-step-up"], queryFn: () => api.get<Status>("/api/v1/admin/step-up"), refetchInterval: 30_000 });
  useEffect(() => {
    if (prompt > 0) setOpen(true);
  }, [prompt]);

  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const send = useMutation({
    mutationFn: () => api.post<{ sentTo: string }>("/api/v1/admin/step-up/send"),
    onSuccess: (r) => (setSentTo(r.sentTo), setError(null)),
    onError: fail,
  });
  const verify = useMutation({
    mutationFn: () => api.post<Status>("/api/v1/admin/step-up/verify", { code }),
    onSuccess: () => {
      setOpen(false);
      setSentTo(null);
      setCode("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin-step-up"] });
    },
    onError: fail,
  });

  if (data?.fresh && data.until) {
    return (
      <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--health-green)]/15 px-3 py-1 text-xs" data-testid="stepup-fresh">
        <ShieldCheck className="size-3.5" aria-hidden />
        {t("stepUpOpenUntil", { time: new Date(data.until).toLocaleTimeString(locale, { timeStyle: "short" }) })}
      </p>
    );
  }
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="stepup-open">
        <KeyRound className="size-4" aria-hidden />
        {t("stepUpOpen")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm" data-testid="stepup-box">
      <p className="font-medium">{t("stepUpTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("stepUpHint")}</p>
      {!sentTo ? (
        <Button type="button" size="sm" className="w-fit" disabled={send.isPending} onClick={() => send.mutate()} data-testid="stepup-send">
          {t("stepUpSend")}
        </Button>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), verify.mutate())}>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("stepUpSent", { to: sentTo })}
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="w-32" aria-label={t("stepUpCode")} data-testid="stepup-code" />
          </label>
          <Button type="submit" size="sm" disabled={code.length !== 6 || verify.isPending} data-testid="stepup-verify">
            {t("stepUpConfirm")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
