"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token, label }: { token: string; label: string }) {
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/invitations/${token}/accept`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? tc("error"));
      setBusy(false);
      return;
    }
    const ws = (await res.json()) as { slug: string };
    router.push(`/w/${ws.slug}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={accept} disabled={busy}>
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
