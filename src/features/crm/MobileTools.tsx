"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * On a phone the search, filters and list buttons of a section take the whole first screen. They are folded behind this one button
 * (closed at first, the count says how many filters are on); from tablet width up the button is not drawn and everything stays in sight.
 */
export function MobileToolsToggle({ open, onToggle, active }: { open: boolean; onToggle: () => void; active: number }) {
  const t = useTranslations("crm");
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm md:hidden", open || active > 0 ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground")}
      data-testid="mobile-tools"
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      {t("filtersButton")}
      {active > 0 && <span className="rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">{active}</span>}
    </button>
  );
}

/** The class that hides a block on a phone while the tools are folded. */
export const foldOnPhone = (open: boolean) => (open ? "" : "max-md:hidden");
