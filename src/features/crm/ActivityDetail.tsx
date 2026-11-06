"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ActivityDto } from "./types";

type Full = ActivityDto & { contactName?: string | null; companyName?: string | null; dealTitle?: string | null };

/** The opened part of an activity: the whole text, and when it was made, planned and done. */
export function ActivityBody({ a, id }: { a: Full; id?: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const fmt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString(locale) : null);
  const rows: [string, string | null | undefined][] = [
    [t("activityType"), t(`activity.${a.type}`)],
    [t("activityCreated"), fmt(a.createdAt)],
    [t("activityPlanned"), fmt(a.dueAt)],
    [t("activityDone"), fmt(a.completedAt)],
    [t("activityDuration"), a.durationMin ? t("activityMinutes", { n: a.durationMin }) : null],
    [t("owner"), a.owner.name ?? a.owner.email],
    [t("activityContact"), a.contactName],
    [t("activityCompany"), a.companyName],
    [t("activityDeal"), a.dealTitle],
  ];
  return (
    <div id={id} className="mt-1 flex flex-col gap-2 text-sm" data-testid="activity-detail">
      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3" data-testid="activity-body">
        {a.body?.trim() || t("activityNoText")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

/** One line of an activity list. It stays folded; pressing it unfolds the full record below the line. */
export function ActivityRow({ a, extra }: { a: Full; extra?: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const panel = `activity-panel-${a.id}`;
  return (
    <li>
      <button type="button" className="flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left hover:bg-muted" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} data-testid={`activity-open-${a.id}`}>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{a.subject}</span>
          <span className="block text-xs text-muted-foreground">
            {t(`activity.${a.type}`)} · {new Date(a.completedAt ?? a.dueAt ?? a.createdAt).toLocaleString(locale)}
            {extra ? ` · ${extra}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <ActivityBody a={a} id={panel} />}
    </li>
  );
}
