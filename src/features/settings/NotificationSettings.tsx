"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";

type Channel = "app" | "email" | "slack" | "telegram";
interface Pref {
  kind: string;
  channels: Channel[];
  custom: boolean;
}
const EXTERNAL: Exclude<Channel, "app">[] = ["email", "slack", "telegram"];

export function NotificationSettings({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("notifications");
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Pref[]>(`/api/v1/workspaces/${workspaceId}/notification-preferences`).then(setPrefs).catch(() => setError(t("error")));
  }, [workspaceId, t]);

  async function toggle(p: Pref, ch: Exclude<Channel, "app">) {
    const next = p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch];
    setPrefs((cur) => cur.map((x) => (x.kind === p.kind ? { ...x, channels: next, custom: true } : x)));
    try {
      setPrefs(await api.put<Pref[]>(`/api/v1/workspaces/${workspaceId}/notification-preferences`, { kind: p.kind, channels: next.filter((c) => c !== "app") }));
      setError(null);
    } catch {
      setError(t("error"));
    }
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t("prefsTitle")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t("prefsHint")}</p>
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">{t("event")}</th>
            <th className="py-2 text-center font-medium">{t("channel.app")}</th>
            {EXTERNAL.map((c) => (
              <th key={c} className="py-2 text-center font-medium">
                {t(`channel.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prefs.map((p) => (
            <tr key={p.kind} className="border-t border-border">
              <td className="py-2">{t(`kind.${p.kind}`)}</td>
              <td className="py-2 text-center">
                <input type="checkbox" checked disabled aria-label={`${t(`kind.${p.kind}`)} — ${t("channel.app")}`} />
              </td>
              {EXTERNAL.map((c) => (
                <td key={c} className="py-2 text-center">
                  <input type="checkbox" checked={p.channels.includes(c)} onChange={() => void toggle(p, c)} aria-label={`${t(`kind.${p.kind}`)} — ${t(`channel.${c}`)}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">{t("connectHint")}</p>
    </section>
  );
}
