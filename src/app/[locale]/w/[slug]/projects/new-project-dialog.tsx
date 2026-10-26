"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";

const TEMPLATES = ["empty", "agile-sprint-map", "product-roadmap", "agency-client-project"] as const;

export function NewProjectDialog({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", startDate: "", dueDate: "", template: "agile-sprint-map" as (typeof TEMPLATES)[number] });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ project: { id: string } }>(`/api/v1/workspaces/${workspaceId}/projects`, {
        name: form.name,
        description: form.description || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        template: form.template,
      });
      router.push(`/w/${slug}/projects/p/${res.project.id}`);
    } catch (err) {
      setError(err instanceof ApiFailure && err.code === "plan_limit" ? t("limit") : err instanceof ApiFailure ? err.message : tc("error"));
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("new")}
      </Button>
      <dialog ref={ref} onClose={() => setOpen(false)} className="m-auto w-[min(480px,92vw)] rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/40">
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t("new")}</h2>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("name")}
            <Input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("description")}
            <textarea
              className="min-h-16 rounded-md border border-border bg-card p-2 text-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("start")}
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("due")}
              <Input type="date" value={form.dueDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("template")}
            <select
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value as (typeof TEMPLATES)[number] })}
            >
              {TEMPLATES.map((k) => (
                <option key={k} value={k}>
                  {t(`tpl.${k}`)}
                </option>
              ))}
            </select>
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
            <Button type="submit" disabled={busy}>
              {t("create")}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
