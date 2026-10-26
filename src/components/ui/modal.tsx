"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn("m-auto max-h-[90vh] w-[min(520px,94vw)] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/40", wide && "w-[min(860px,96vw)]")}
    >
      {open && (
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const selectClass = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm disabled:opacity-60";
export const textareaClass = "min-h-20 w-full rounded-md border border-border bg-card p-2 text-sm";
