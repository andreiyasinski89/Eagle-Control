"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";

/** The pencil on a project card: change the name and the description without opening the project. */
export function EditProjectButton({ id, title, description }: { id: string; title: string; description: string | null }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(title);
  const [text, setText] = useState(description ?? "");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const show = () => {
    // Start from what the card shows now, not from an earlier unsaved edit.
    setName(title);
    setText(description ?? "");
    setError(null);
    setOpen(true);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/nodes/${id}`, { title: name.trim(), description: text.trim() || null });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiFailure && err.message ? err.message : t("editFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`${t("edit")}: ${title}`}
        title={t("edit")}
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        data-testid="project-edit"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      <dialog ref={ref} onClose={() => setOpen(false)} className="m-auto w-[min(480px,92vw)] rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/40" data-testid="project-edit-dialog">
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t("editTitle")}</h2>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("name")}
            <Input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} data-testid="project-edit-name" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("description")}
            <textarea className="min-h-28 rounded-md border border-border bg-card p-2 text-sm font-normal" maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} data-testid="project-edit-description" />
            <span className="text-xs font-normal text-muted-foreground">{t("descriptionHint")}</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
