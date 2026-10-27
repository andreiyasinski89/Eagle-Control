"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";

interface Token {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  owner: string;
  mine: boolean;
}
interface Grant {
  id: string;
  app: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
  owner: string;
  mine: boolean;
}
interface Hook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  failedDeliveries: number;
}
const EVENTS = ["project.changed", "deal.won", "lead.created"] as const;

function CopyLine({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded bg-muted p-2 text-xs" data-testid="copy-line">
        {value}
      </code>
      <Button
        size="sm"
        variant="outline"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

/** Personal API tokens and outgoing webhooks. Secrets are shown once, right after they are created. */
export function DevelopersPanel({ workspaceId, canManageHooks }: { workspaceId: string; canManageHooks: boolean }) {
  const t = useTranslations("developers");
  const locale = useLocale();
  const qc = useQueryClient();
  const tokensKey = ["api-tokens", workspaceId];
  const hooksKey = ["webhooks", workspaceId];
  const tokens = useQuery({ queryKey: tokensKey, retry: false, queryFn: () => api.get<{ items: Token[] }>(`/api/v1/workspaces/${workspaceId}/api-tokens`) });
  const grantsKey = ["oauth-grants", workspaceId];
  const grants = useQuery({ queryKey: grantsKey, enabled: tokens.isSuccess, retry: false, queryFn: () => api.get<{ items: Grant[] }>(`/api/v1/workspaces/${workspaceId}/oauth-grants`) });
  // The address Claude has to be given is the one this page is served from.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const hooks = useQuery({ queryKey: hooksKey, enabled: canManageHooks && tokens.isSuccess, retry: false, queryFn: () => api.get<{ items: Hook[] }>(`/api/v1/workspaces/${workspaceId}/webhooks`) });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["deal.won"]);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : "—");

  const createToken = useMutation({
    mutationFn: () => api.post<{ token: string }>(`/api/v1/workspaces/${workspaceId}/api-tokens`, { name, scope, expiresInDays: days ? Number(days) : null }),
    onSuccess: (r) => {
      setSecret({ label: t("tokenOnce"), value: r.token });
      setName("");
      setError(null);
      void qc.invalidateQueries({ queryKey: tokensKey });
    },
    onError: fail,
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/api-tokens/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: tokensKey }), onError: fail });
  const addHook = useMutation({
    mutationFn: () => api.post<{ secret: string }>(`/api/v1/workspaces/${workspaceId}/webhooks`, { url, events }),
    onSuccess: (r) => {
      setSecret({ label: t("secretOnce"), value: r.secret });
      setUrl("");
      setError(null);
      void qc.invalidateQueries({ queryKey: hooksKey });
    },
    onError: fail,
  });
  const disconnect = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/oauth-grants/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: grantsKey }), onError: fail });
  const hookAction = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: () => void qc.invalidateQueries({ queryKey: hooksKey }), onError: fail });

  if (tokens.error instanceof ApiFailure && tokens.error.code === "plan_feature") {
    return (
      <div data-testid="paywall" className="m-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold">{t("paywallTitle")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t("paywallText")}</p>
      </div>
    );
  }
  if (tokens.error) return <p role="alert" className="p-6 text-sm text-danger">{tokens.error instanceof ApiFailure ? tokens.error.message : t("error")}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <a className="text-sm text-primary hover:underline" href="/api/public/v1/openapi.json" target="_blank" rel="noopener noreferrer">
          {t("docs")}
        </a>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {secret && (
        <div role="status" data-testid="secret" className="rounded-md border border-primary bg-primary/10 p-3 text-sm">
          <p className="font-medium">{secret.label}</p>
          <code className="mt-1 block break-all rounded bg-card p-2 text-xs">{secret.value}</code>
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => setSecret(null)}>
            {t("done")}
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="claude-connection">
        <h2 className="font-semibold">{t("claudeTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("claudeHint")}</p>
        <ol className="list-decimal pl-5 text-sm [&>li]:mt-1">
          <li>{t("claudeStep1")}</li>
          <li>
            {t("claudeStep2")}
            <div className="mt-1">
              <CopyLine value={`${origin}/api/mcp`} label={t("copy")} />
            </div>
          </li>
          <li>{t("claudeStep3")}</li>
        </ol>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("claudeCode")}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <CopyLine value={`claude mcp add --transport http meetowl ${origin}/api/mcp`} label={t("copy")} />
            <p className="text-xs text-muted-foreground">{t("claudeCodeHint")}</p>
          </div>
        </details>
        <h3 className="mt-1 text-sm font-medium">{t("connections")}</h3>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {grants.data?.items.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium">{g.app}</span>
              <span className="rounded bg-muted px-1.5 text-xs">{g.scope}</span>
              <span className="text-xs text-muted-foreground">
                {g.owner} · {t("connectedOn", { date: date(g.createdAt) })} · {t("lastUsed", { date: date(g.lastUsedAt) })}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => disconnect.mutate(g.id)}>
                {t("disconnect")}
              </Button>
            </li>
          ))}
          {grants.data?.items.length === 0 && <li className="py-2 text-xs text-muted-foreground">{t("noConnections")}</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">{t("tokens")}</h2>
        <p className="text-sm text-muted-foreground">{t("tokensHint")}</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            createToken.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("name")}
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="w-48" required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("scope")}
            <select className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground" value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
              <option value="read">{t("read")}</option>
              <option value="write">{t("write")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("expiresDays")}
            <Input type="number" min={1} max={730} value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
          </label>
          <Button type="submit" size="sm" disabled={!name.trim() || createToken.isPending}>
            {t("create")}
          </Button>
        </form>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {tokens.data?.items.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2">
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-muted-foreground">{k.prefix}…</code>
              <span className="rounded bg-muted px-1.5 text-xs">{k.scope}</span>
              <span className="text-xs text-muted-foreground">
                {k.owner} · {t("lastUsed", { date: date(k.lastUsedAt) })} · {k.expiresAt ? t("expires", { date: date(k.expiresAt) }) : t("noExpiry")}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => revoke.mutate(k.id)}>
                {t("revoke")}
              </Button>
            </li>
          ))}
          {tokens.data?.items.length === 0 && <li className="py-2 text-xs text-muted-foreground">{t("noTokens")}</li>}
        </ul>
      </section>

      {canManageHooks && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">{t("webhooks")}</h2>
          <p className="text-sm text-muted-foreground">{t("webhooksHint")}</p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addHook.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              URL
              <Input type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} className="w-72" required />
            </label>
            {EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 pb-2 text-sm">
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
                {ev}
              </label>
            ))}
            <Button type="submit" size="sm" disabled={!url || events.length === 0 || addHook.isPending}>
              {t("add")}
            </Button>
          </form>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {hooks.data?.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="break-all font-medium">{h.url}</span>
                <span className="text-xs text-muted-foreground">{h.events.join(", ")}</span>
                {h.failedDeliveries > 0 && <span className="text-xs text-danger">{t("failed", { n: h.failedDeliveries })}</span>}
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => hookAction.mutate(() => api.post(`/api/v1/webhooks/${h.id}/test`))}>
                    {t("test")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => hookAction.mutate(() => api.patch(`/api/v1/webhooks/${h.id}`, { enabled: !h.enabled }))}>
                    {h.enabled ? t("pause") : t("resume")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => hookAction.mutate(() => api.del(`/api/v1/webhooks/${h.id}`))}>
                    {t("remove")}
                  </Button>
                </span>
              </li>
            ))}
            {hooks.data?.items.length === 0 && <li className="py-2 text-xs text-muted-foreground">{t("noHooks")}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
