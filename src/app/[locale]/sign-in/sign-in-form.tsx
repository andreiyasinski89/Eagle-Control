"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";

export function SignInForm({ googleEnabled, callbackUrl }: { googleEnabled: boolean; callbackUrl: string }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return;
    setBusy(true);
    setFailed(false);
    try {
      // `terms` is checked again on the server: the link is not sent without it.
      const res = await signIn("email", { email, terms: "1", redirect: false, redirectTo: callbackUrl });
      if (res?.error) throw new Error(res.error);
      window.location.assign("/sign-in?sent=1");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="email">
          {t("email")}
        </label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
          </span>
        </label>
        <Button type="submit" disabled={busy || !agree}>
          {t("sendLink")}
        </Button>
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t("sendFailed")}
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
