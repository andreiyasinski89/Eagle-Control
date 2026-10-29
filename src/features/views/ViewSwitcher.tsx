"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { parseView, VIEW_KINDS, type ViewKind } from "@/modules/views/views";

/** The current view lives in the URL (?view=) next to ?node=, so a link opens exactly what you were looking at. */
export function useView(): { view: ViewKind; setView: (v: ViewKind) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = parseView(params.get("view"));
  const setView = useCallback(
    (v: ViewKind) => {
      const next = new URLSearchParams(params.toString());
      if (v === "map") next.delete("view");
      else next.set("view", v);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return { view, setView };
}

export function ViewSwitcher() {
  const t = useTranslations("views");
  const { view, setView } = useView();
  return (
    <div className="ml-auto flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1 text-sm" role="tablist" aria-label={t("switcher")}>
      {VIEW_KINDS.map((v) => (
        <button key={v} data-advanced={v === "timeline" ? "" : undefined} role="tab" aria-selected={view === v} data-testid={`view-${v}`} onClick={() => setView(v)} className={cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-1", view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
          {t(`kind.${v}`)}
        </button>
      ))}
    </div>
  );
}
