import { initialsOf } from "@/modules/account/profile";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-xl" } as const;

/** A round picture of the person, or their initials when there is none. */
export function Avatar({ name, email, src, size = "md", className }: { name: string | null | undefined; email: string; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary", SIZES[size], className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(name, email)
      )}
    </span>
  );
}
