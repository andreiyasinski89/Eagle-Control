"use client";

import { createContext, useContext } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Whether the workspace on screen has Pro, and where its plan page is. Set once by the workspace layout; elsewhere (portal, account pages)
 * nothing is locked. While paid plans are off every workspace has Pro, so no lock is ever drawn.
 */
const PlanContext = createContext<{ pro: boolean; slug: string | null }>({ pro: true, slug: null });

export function PlanProvider({ pro, slug, children }: { pro: boolean; slug: string; children: React.ReactNode }) {
  return <PlanContext.Provider value={{ pro, slug }}>{children}</PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);
const billingHref = (slug: string | null) => (slug ? `/w/${slug}/settings/billing` : "/");

/** In place of a Pro part: what it is, "Available in Pro" and the way to the plan page (which itself says what can be done in the Android app). */
export function ProLock({ title, text, compact, className }: { title: string; text?: string; compact?: boolean; className?: string }) {
  const t = useTranslations("pro");
  const { slug } = usePlan();
  return (
    <div data-testid="paywall" className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed border-border text-center", compact ? "p-4" : "p-10", className)}>
      <Lock className={compact ? "size-5 text-muted-foreground" : "size-8 text-muted-foreground"} aria-hidden />
      <h2 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>{title}</h2>
      {text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}
      <p className="text-xs font-medium text-primary">{t("available")}</p>
      <Button asChild size="sm" data-testid="pro-upgrade">
        <Link href={billingHref(slug)}>{t("upgrade")}</Link>
      </Button>
    </div>
  );
}

/** A Pro part of a page drawn as itself on Pro, and as its lock on Free. */
export function ProGate({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  const { pro } = usePlan();
  return pro ? <>{children}</> : <ProLock title={title} text={text} className="m-4 md:m-6" />;
}

/** A Pro button on Free: the same label with a lock, leading to the plan page. */
export function ProLockButton({ label, className }: { label: string; className?: string }) {
  const t = useTranslations("pro");
  const { slug } = usePlan();
  return (
    <Button variant="outline" size="sm" asChild className={className}>
      <Link href={billingHref(slug)} title={t("available")} data-testid="pro-lock-button">
        <Lock className="size-4" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
