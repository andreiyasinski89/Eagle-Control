"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { isDisposableEmail } from "@/modules/auth/signup";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

/**
 * Signing in and creating an account are the same door: an e-mail address, the agreement, and a one-time link. Creating an
 * account also asks for the name, and may come through a sponsor's invitation link (then it says who invited and what they will see).
 */
export function SignInForm({ googleEnabled, callbackUrl, initialMode, refCode, inviter }: { googleEnabled: boolean; callbackUrl: string; initialMode: Mode; refCode: string | null; inviter: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [trap, setTrap] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return;
    if (isDisposableEmail(email)) return setError(t("disposable"));
    setBusy(true);
    setError(null);
    try {
      // `terms` is checked again on the server: the link is not sent without it. So are the temporary mailboxes.
      const res = await signIn("email", { email, terms: "1", mode, firstName, lastName, ref: signup && refCode ? refCode : "", locale, website: trap, redirect: false, redirectTo: callbackUrl });
      if (res?.error) throw new Error(res.error);
      window.location.assign("/sign-in?sent=1");
    } catch {
      setError(t("sendFailed"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="sign-in-form" data-mode={mode}>
      <div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">{signup ? t("signupTitle") : t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{signup ? t("signupSubtitle") : t("subtitle")}</p>
      </div>

      <div role="tablist" aria-label={t("title")} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} data-testid={`tab-${m}`} onClick={() => (setMode(m), setError(null))} className={cn("rounded-lg px-3 py-1.5 font-medium", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {m === "signin" ? t("tabSignIn") : t("tabSignUp")}
          </button>
        ))}
      </div>

      {signup && inviter && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="invited-by">
          {t("invitedBy", { name: inviter })}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {signup && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="firstName">
                {t("firstName")}
              </label>
              <Input id="firstName" required maxLength={60} autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="signup-first" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="lastName">
                {t("lastName")}
              </label>
              <Input id="lastName" maxLength={60} autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="signup-last" />
            </div>
          </div>
        )}
        <label className="text-sm font-medium" htmlFor="email">
          {t("email")}
        </label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="signup-email" />
        {/* A trap for bots: people never see or reach it. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="agree-terms" />
          <span>
            {t.rich("terms", {
              terms: (c) => (
                <Link href="/legal/terms" target="_blank" className="underline">
                  {c}
                </Link>
              ),
              privacy: (c) => (
                <Link href="/legal/privacy" target="_blank" className="underline">
                  {c}
                </Link>
              ),
            })}
            {signup && inviter && ` ${t("shareWithInviter", { name: inviter })}`}
          </span>
        </label>
        <Button type="submit" disabled={busy || !agree || (signup && !firstName.trim())} data-testid="signup-submit">
          {signup ? t("createAccount") : t("sendLink")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      {googleEnabled && (
        <Button variant="outline" disabled={!agree} onClick={() => signIn("google", { redirectTo: callbackUrl })}>
          {t("google")}
        </Button>
      )}
    </div>
  );
}
