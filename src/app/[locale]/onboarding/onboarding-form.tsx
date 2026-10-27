"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The first sign-in: who you are and what to call your workspace, in one form. The names are kept if they were given at sign-up. */
export function OnboardingForm({ firstName: first0, lastName: last0, suggestion }: { firstName: string; lastName: string; suggestion: string }) {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const [firstName, setFirstName] = useState(first0);
  const [lastName, setLastName] = useState(last0);
  const [name, setName] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (firstName.trim() !== first0 || lastName.trim() !== last0) {
      await fetch("/api/v1/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName, lastName }) }).catch(() => undefined);
    }
    const res = await fetch("/api/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      setError(body?.error?.code === "workspace_limit" ? t("limit") : tc("error"));
      setBusy(false);
      return;
    }
    const ws = (await res.json()) as { slug: string };
    router.push(`/w/${ws.slug}/start`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="onboarding-form">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="firstName">
            {t("firstName")}
          </label>
          <Input id="firstName" required maxLength={60} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="onb-first" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="lastName">
            {t("lastName")}
          </label>
          <Input id="lastName" maxLength={60} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="onb-last" />
        </div>
      </div>
      <label className="text-sm font-medium" htmlFor="name">
        {t("name")}
      </label>
      <Input id="name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} data-testid="onb-workspace" />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !firstName.trim() || name.trim().length < 2} data-testid="onb-submit">
        {t("create")}
      </Button>
    </form>
  );
}
