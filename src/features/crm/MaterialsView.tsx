"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FileText, Film, Image as ImageIcon, Link2, Pencil, Plus, Presentation, QrCode, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { guessKind, isLink, LANG_LABEL, MATERIAL_KINDS, MATERIAL_LANGS, QR_CORNERS, QR_SIZE_MAX, QR_SIZE_MIN, type MaterialKind, type MaterialLang, type QrPlace } from "@/modules/crm/materials";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "./useScripts";
import { storyWithQr, useMaterials, type MaterialDto } from "./useMaterials";

const ICON: Record<MaterialKind, typeof FileText> = { PRESENTATION: Presentation, VIDEO: Film, IMAGE: ImageIcon, PDF: FileText, OTHER: Link2 };
const MAX_BYTES = 25 * 1024 * 1024;

/** The library: what the team gives to the people it talks to, by kind, language and category; the leaders' shared ones and the member's own. */
export function MaterialsView({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("materials");
  const { data, isLoading, isError } = useMaterials(workspaceId);
  const [kind, setKind] = useState<MaterialKind | "">("");
  const [lang, setLang] = useState<MaterialLang | "">("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<MaterialDto | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["materials", workspaceId] });
  const me = useQuery({ queryKey: ["referral", workspaceId], queryFn: () => api.get<{ url: string; leadUrl: string | null }>(`/api/v1/workspaces/${workspaceId}/referral`), retry: false });

  const items = useMemo(() => data?.items ?? [], [data]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)), [items]);
  const shown = items.filter((i) => (!kind || i.kind === kind) && (!lang || i.lang === lang) && (!category || i.category === category));
  const del = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/materials/${id}`), onSuccess: refresh });
  const say = (m: string) => (setNote(m), setTimeout(() => setNote(null), 3000));

  const copy = async (m: MaterialDto) => say((await copyToClipboard(m.link)) ? t("copied") : t("copyFailed"));
  const story = async (m: MaterialDto) => {
    try {
      if (!m.qr) return;
      await storyWithQr(m.id, m.qr, me.data?.leadUrl ?? me.data?.url ?? m.link, m.fileName ?? m.title);
    } catch {
      say(t("storyFailed"));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4" data-testid="materials-view">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button className="ml-auto min-h-11" onClick={() => setEditing("new")} data-testid="material-add">
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="material-filters">
        <select className={cn(selectClass, "h-11 sm:w-44")} aria-label={t("kind")} value={kind} onChange={(e) => setKind(e.target.value as MaterialKind | "")} data-testid="filter-kind">
          <option value="">{t("allKinds")}</option>
          {MATERIAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "h-11 sm:w-32")} aria-label={t("lang")} value={lang} onChange={(e) => setLang(e.target.value as MaterialLang | "")} data-testid="filter-lang">
          <option value="">{t("allLangs")}</option>
          {MATERIAL_LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_LABEL[l]}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "col-span-2 h-11 sm:w-48")} aria-label={t("category")} value={category} onChange={(e) => setCategory(e.target.value)} data-testid="filter-category">
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {note && (
        <p role="status" className="rounded-lg border border-border bg-card p-2 text-sm">
          {note}
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {data && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="materials-empty">
          <span className="text-4xl" aria-hidden>
            🦉
          </span>
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("empty")}</p>
          <Button className="min-h-11" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      )}
      {data && items.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">{t("nothingFound")}</p>}
      <ul className="grid gap-2 md:grid-cols-2">
        {shown.map((m) => {
          const Icon = ICON[m.kind];
          return (
            <li key={m.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm" data-testid="material-card">
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">{LANG_LABEL[m.lang]}</span>
                    <span>{t(`kinds.${m.kind}`)}</span>
                    {m.category && <span>· {m.category}</span>}
                    <span>· {m.shared ? t("shared") : t("mine")}</span>
                  </p>
                </div>
                {m.canEdit && (
                  <>
                    <button type="button" aria-label={t("edit")} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setEditing(m)} data-testid="material-edit">
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("delete")}
                      className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                      onClick={() => window.confirm(t("deleteAsk", { title: m.title })) && del.mutate(m.id)}
                      data-testid="material-delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void copy(m)} data-testid="material-copy">
                  <Copy className="size-4" />
                  {t("copyLink")}
                </Button>
                <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
                  <ExternalLink className="size-4" />
                  {t("open")}
                </a>
                {m.kind === "IMAGE" && m.qr && (
                  <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void story(m)} data-testid="material-story">
                    <QrCode className="size-4" />
                    {t("withMyQr")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <MaterialDialog workspaceId={workspaceId} material={editing === "new" ? null : editing} canShare={!!data?.canShare} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function MaterialDialog({ workspaceId, material, canShare, onClose, onSaved }: { workspaceId: string; material: MaterialDto | null; canShare: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("materials");
  const [title, setTitle] = useState(material?.title ?? "");
  const [kind, setKindState] = useState<MaterialKind>(material?.kind ?? "PRESENTATION");
  // Until the person picks the kind themselves, it follows the link or the file.
  const [kindTouched, setKindTouched] = useState(!!material);
  const setKind = (k: MaterialKind) => setKindState(k);
  const [lang, setLang] = useState<MaterialLang>(material?.lang ?? "ru");
  const [category, setCategory] = useState(material?.category ?? "");
  const [source, setSource] = useState<"link" | "file">("link");
  const [url, setUrl] = useState(material?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [shared, setShared] = useState(material ? material.shared : canShare);
  const [qr, setQr] = useState<QrPlace | null>(material?.qr ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !material;
  const fileBased = material ? material.hasFile : source === "file";

  async function save() {
    setError(null);
    if (!title.trim()) return setError(t("needTitle"));
    if (isNew && source === "link" && !isLink(url)) return setError(t("badLink"));
    if (isNew && source === "file" && !file) return setError(t("needFile"));
    if (file && file.size > MAX_BYTES) return setError(t("tooLarge"));
    setBusy(true);
    try {
      const common = { title: title.trim(), kind, lang, category: category.trim() || null, qr: kind === "IMAGE" ? qr : null };
      if (material) {
        await api.patch(`/api/v1/materials/${material.id}`, { ...common, ...(material.hasFile ? {} : { url: url.trim() }) });
      } else if (source === "link") {
        await api.post(`/api/v1/workspaces/${workspaceId}/materials`, { ...common, url: url.trim(), shared: canShare && shared });
      } else if (file) {
        const meta = { fileName: file.name, mime: file.type || "application/octet-stream", size: file.size };
        const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>(`/api/v1/workspaces/${workspaceId}/materials/upload`, meta);
        const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": meta.mime }, body: file });
        if (!put.ok) throw new Error("upload");
        await api.post(`/api/v1/workspaces/${workspaceId}/materials`, { ...common, file: { key, ...meta }, shared: canShare && shared });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={material ? t("editTitle") : t("add")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField label={t("name")}>
          <Input className="h-11" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="material-title" />
        </FormField>
        {isNew && (
          <div role="radiogroup" aria-label={t("source")} className="flex gap-2">
            {(["link", "file"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={source === s} className={cn("min-h-11 flex-1 rounded-lg border px-3 text-sm", source === s ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground")} onClick={() => setSource(s)} data-testid={`source-${s}`}>
                {t(s === "link" ? "sourceLink" : "sourceFile")}
              </button>
            ))}
          </div>
        )}
        {!fileBased ? (
          <FormField label={t("link")}>
            <Input
              className="h-11"
              inputMode="url"
              value={url}
              placeholder="https://"
              onChange={(e) => {
                setUrl(e.target.value);
                if (!kindTouched) setKind(guessKind(e.target.value));
              }}
              data-testid="material-url"
            />
          </FormField>
        ) : isNew ? (
          <FormField label={t("file")} hint={t("fileHint")}>
            <input
              type="file"
              accept="application/pdf,image/*,video/*,.ppt,.pptx,.key"
              className="min-h-11 w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !kindTouched) setKind(guessKind(f.type || f.name));
              }}
              data-testid="material-file"
            />
          </FormField>
        ) : (
          <p className="text-xs text-muted-foreground">{t("fileKept", { name: material?.fileName ?? "" })}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <FormField label={t("kind")}>
            <select className={cn(selectClass, "h-11")} value={kind} onChange={(e) => (setKindTouched(true), setKind(e.target.value as MaterialKind))} data-testid="material-kind">
              {MATERIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("lang")}>
            <select className={cn(selectClass, "h-11")} value={lang} onChange={(e) => setLang(e.target.value as MaterialLang)} data-testid="material-lang">
              {MATERIAL_LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label={t("category")} hint={t("categoryHint")}>
          <Input className="h-11" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} data-testid="material-category" />
        </FormField>
        {kind === "IMAGE" && (
          <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t("qrTitle")}</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={!!qr} onChange={(e) => setQr(e.target.checked ? { corner: "bottom-right", size: 24 } : null)} data-testid="material-qr" />
              {t("qrOn")}
            </label>
            {qr && (
              <div className="grid grid-cols-2 gap-2">
                <FormField label={t("qrCorner")}>
                  <select className={cn(selectClass, "h-11")} value={qr.corner} onChange={(e) => setQr({ ...qr, corner: e.target.value as QrPlace["corner"] })} data-testid="material-qr-corner">
                    {QR_CORNERS.map((c) => (
                      <option key={c} value={c}>
                        {t(`corners.${c}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={t("qrSize")}>
                  <Input type="number" inputMode="numeric" className="h-11" min={QR_SIZE_MIN} max={QR_SIZE_MAX} value={qr.size} onChange={(e) => setQr({ ...qr, size: Number(e.target.value) })} />
                </FormField>
              </div>
            )}
          </fieldset>
        )}
        {isNew && canShare && (
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-5" checked={shared} onChange={(e) => setShared(e.target.checked)} data-testid="material-shared" />
            <span>
              {t("shareWithTeam")}
              <span className="block text-xs text-muted-foreground">{t("shareHint")}</span>
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="min-h-11" disabled={busy} data-testid="material-save">
          {t("save")}
        </Button>
      </form>
    </Modal>
  );
}
