import { cn } from "@/lib/utils";

/** A grey placeholder shaped like the thing that is loading, instead of a bare "…". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
