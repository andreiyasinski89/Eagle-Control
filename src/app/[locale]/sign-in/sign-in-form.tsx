"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm({ googleEnabled, callbackUrl }: { googleEnabled: boolean; callbackUrl: string }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await signIn("email", { email, redirectTo: callbackUrl });
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="email">
          {t("email")}
        </label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {t("sendLink")}
        </Button>
      </form>
      {googleEnabled && (
        <Button variant="outline" onClick={() => signIn("google", { redirectTo: callbackUrl })}>
          {t("google")}
        </Button>
      )}
    </div>
  );
}
