import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The mark of the platform: a violet rounded square with an M. The same drawing is the icon of the site and of the phone's home screen. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("inline-block size-[1.15em] shrink-0 align-[-0.2em]", className)}>
      <rect width="24" height="24" rx="6" fill="#7c3aed" />
      <path d="M7 17V7.5L12 13l5-5.5V17" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark and the name, as in the headers and on the sign-in page. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      {BRAND_NAME}
    </span>
  );
}
