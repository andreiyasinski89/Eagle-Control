import { cn } from "@/lib/utils";

/** A grey placeholder shaped like the thing that is loading, instead of a bare "…". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** A few lines of different lengths: the loading state of a list or a text block. Announced once to screen readers. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  const widths = ["w-full", "w-4/5", "w-11/12", "w-2/3", "w-3/4"];
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={cn("flex flex-col gap-3", className)} data-testid="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-5", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Columns of cards, for the deal board while it loads. */
export function SkeletonBoard({ columns = 4 }: { columns?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex gap-3" data-testid="skeleton">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 - (c % 2) }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
