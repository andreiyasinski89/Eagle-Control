"use client";

import { useTranslations } from "next-intl";
import { awaitsAnswer } from "@/modules/crm/reply";

/** A small yellow mark on a person who wrote back and has not been answered yet. Nothing when the next move is not ours. */
export function ReplyBadge({ repliedAt, lastContactedAt, className }: { repliedAt?: string | null; lastContactedAt?: string | null; className?: string }) {
  const t = useTranslations("crm");
  if (!awaitsAnswer(repliedAt, lastContactedAt)) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full bg-[var(--health-yellow)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--health-yellow)] ${className ?? ""}`} title={t("awaitingHint")} data-testid="reply-badge">
      {t("awaitingBadge")}
    </span>
  );
}
