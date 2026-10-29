"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { Link } from "@/i18n/navigation";
import { normalizeTelegram } from "@/modules/account/profile";

/** The shortest way to put a person in the list: a name and a phone or a Telegram name. The rest can wait. */
export function QuickAddContact({ open, onClose, workspaceId, slug }: { open: boolean; onClose: () => void; workspaceId: string; slug?: string }) {
  const t = useTranslations("mobile");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [reach, setReach] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setReach("");
    setError(null);
    setDuplicate(false);
    setDone(null);
  }, [open]);

  const trimmed = reach.trim();
  // A Telegram name starts with @ or is made of letters; anything with enough digits is a phone.
  const isPhone = /^[+\d][\d\s().-]{5,}$/.test(trimmed);
  const telegram = !isPhone && trimmed ? normalizeTelegram(trimmed) : null;
  const reachOk = isPhone || !!telegram;

  const add = useMutation({
    mutationFn: (allowDuplicate: boolean) =>
      api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/contacts`, {
        firstName: name.trim(),
        phones: isPhone ? [trimmed] : [],
        messengers: telegram ? { telegram: `@${telegram}` } : {},
        allowDuplicate,
      }),
    onSuccess: (c) => {
      setDone({ id: c.id, name: name.trim() });
      setError(null);
      setDuplicate(false);
      for (const k of ["people", "contacts", "my-day", "touch-queue"]) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => {
      if (e instanceof ApiFailure && e.code === "duplicate_contact") {
        setDuplicate(true);
        setError(t("duplicate"));
      } else setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error"));
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={t("quickAdd")}>
      {done ? (
        <div className="flex flex-col gap-3" data-testid="quick-add-done">
          <p className="text-sm font-medium">{t("added", { name: done.name })}</p>
          <div className="flex flex-col gap-2">
            <Button type="button" className="min-h-11" onClick={() => (setDone(null), setName(""), setReach(""))} data-testid="quick-add-more">
              {t("addMore")}
            </Button>
            {slug && (
              <Link href={`/w/${slug}/crm/people?contact=${done.id}`} onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm">
                {t("openCard")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            add.mutate(false);
          }}
        >
          <FormField label={t("name")}>
            <Input className="h-11" autoFocus autoComplete="off" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} data-testid="quick-name" />
          </FormField>
          <FormField label={t("reach")} hint={t("reachHint")}>
            <Input className="h-11" autoComplete="off" inputMode="text" value={reach} maxLength={40} onChange={(e) => setReach(e.target.value)} placeholder="+48 600 111 222 / @username" data-testid="quick-reach" />
          </FormField>
          {error && (
            <p role="alert" className="text-sm text-danger" data-testid="quick-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 flex-1" disabled={add.isPending || !name.trim() || !reachOk} data-testid="quick-save">
              {t("save")}
            </Button>
            {duplicate && (
              <Button type="button" variant="outline" className="min-h-11" disabled={add.isPending} onClick={() => add.mutate(true)} data-testid="quick-anyway">
                {t("addAnyway")}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
