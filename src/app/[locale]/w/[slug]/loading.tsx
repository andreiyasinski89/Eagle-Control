import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown at once when a section is opened, while the server prepares the real page. Without it the screen stays as it was until everything is ready,
 * and a press of a button looks like nothing happened. The side menu and the top bar stay in place around it.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8" data-testid="page-loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-[74px] rounded-2xl" />
        <Skeleton className="h-[74px] rounded-2xl" />
        <Skeleton className="h-[74px] rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}
