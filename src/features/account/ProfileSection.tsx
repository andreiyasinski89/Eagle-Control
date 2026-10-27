"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Phone, Send, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { displayName, normalizePhone, normalizeTelegram } from "@/modules/account/profile";

export interface ProfileValues {
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string;
}

/** Your profile card: first and last name, phone and Telegram, shown the way teammates will see them. */
export function ProfileSection({ email, avatar, initial }: { email: string; avatar: string | null; initial: ProfileValues }) {
  const t = useTranslations("profile");
  const qc = useQueryClient();
  const [v, setV] = useState<ProfileValues>(initial);
  const [saved, setSaved] = useState<ProfileValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const phoneBad = v.phone.trim() !== "" && !normalizePhone(v.phone);
  const telegramBad = v.telegram.trim() !== "" && !normalizeTelegram(v.telegram);
  const dirty = (Object.keys(v) as (keyof ProfileValues)[]).some((k) => v[k].trim() !== saved[k].trim());
  const shown = displayName(v.firstName, v.lastName);

  const save = useMutation({
    mutationFn: () => api.patch<{ firstName: string | null; lastName: string | null; phone: string | null; telegram: string | null }>("/api/v1/me", { firstName: v.firstName, lastName: v.lastName, phone: v.phone, telegram: v.telegram }),
    onSuccess: (u) => {
      const next = { firstName: u.firstName ?? "", lastName: u.lastName ?? "", phone: u.phone ?? "", telegram: u.telegram ? `@${u.telegram}` : "" };
      setV(next);
      setSaved(next);
      setError(null);
      setOk(true);
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => {
      setOk(false);
      setError(e instanceof ApiFailure ? (e.code === "invalid_phone" ? t("phoneBad") : e.code === "invalid_telegram" ? t("telegramBad") : e.message) : t("error"));
    },
  });
  const set = (k: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOk(false);
    setV((cur) => ({ ...cur, [k]: e.target.value }));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="profile-card">
      <div className="flex items-center gap-4 border-b border-border bg-primary/5 p-5">
        <Avatar name={shown} email={email} src={avatar} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold" data-testid="profile-name">
            {shown ?? t("noName")}
          </h2>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            {email}
          </p>
        </div>
      </div>
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!phoneBad && !telegramBad) save.mutate();
        }}
      >
        <Field icon={<User className="size-4" />} label={t("firstName")}>
          <Input value={v.firstName} onChange={set("firstName")} maxLength={60} autoComplete="given-name" data-testid="profile-first" />
        </Field>
        <Field icon={<User className="size-4" />} label={t("lastName")}>
          <Input value={v.lastName} onChange={set("lastName")} maxLength={60} autoComplete="family-name" data-testid="profile-last" />
        </Field>
        <Field icon={<Phone className="size-4" />} label={t("phone")} error={phoneBad ? t("phoneBad") : null} hint={t("phoneHint")}>
          <Input value={v.phone} onChange={set("phone")} maxLength={40} inputMode="tel" autoComplete="tel" placeholder="+48 600 100 200" aria-invalid={phoneBad} data-testid="profile-phone" />
        </Field>
        <Field icon={<Send className="size-4" />} label={t("telegram")} error={telegramBad ? t("telegramBad") : null} hint={t("telegramHint")}>
          <Input value={v.telegram} onChange={set("telegram")} maxLength={100} placeholder="@name" aria-invalid={telegramBad} data-testid="profile-telegram" />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!dirty || save.isPending || phoneBad || telegramBad} data-testid="profile-save">
            {t("save")}
          </Button>
          {ok && !dirty && (
            <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
              <Check className="size-4" aria-hidden />
              {t("saved")}
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function Field({ icon, label, hint, error, children }: { icon: React.ReactNode; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
