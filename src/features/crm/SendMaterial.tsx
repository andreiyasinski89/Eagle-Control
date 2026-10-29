"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal, selectClass } from "@/components/ui/modal";
import { LANG_LABEL, MATERIAL_LANGS, materialLine, type MaterialLang } from "@/modules/crm/materials";
import { cn } from "@/lib/utils";
import { useMaterials } from "./useMaterials";

/** The language of the screen as a language of materials (`uk` stays `uk`). */
const own = (locale: string): MaterialLang => ((MATERIAL_LANGS as readonly string[]).includes(locale) ? (locale as MaterialLang) : "en");

/**
 * "Send material": the library at hand, the person's language first. The pick comes back as a line ("Title: link") for the caller to put
 * into the message, so the link is in the text and not on a separate screen.
 */
export function SendMaterial({ workspaceId, onPick, className }: { workspaceId: string; onPick: (line: string, title: string) => void; className?: string }) {
  const t = useTranslations("materials");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<MaterialLang | "">(own(locale));
  const { data, isLoading } = useMaterials(workspaceId);
  const items = (data?.items ?? []).filter((m) => !lang || m.lang === lang);

  return (
    <>
      <Button type="button" size="sm" variant="outline" className={cn("min-h-11 md:min-h-8", className)} onClick={() => setOpen(true)} data-testid="send-material">
        <Paperclip className="size-4" />
        {t("send")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("send")}>
        <div className="flex flex-col gap-3" data-testid="send-material-dialog">
          <select className={cn(selectClass, "h-11")} aria-label={t("lang")} value={lang} onChange={(e) => setLang(e.target.value as MaterialLang | "")}>
            <option value="">{t("allLangs")}</option>
            {MATERIAL_LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
          {isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {data && items.length === 0 && <p className="text-sm text-muted-foreground">{t("noneInLang")}</p>}
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onPick(materialLine(m.title, m.link), m.title);
                    setOpen(false);
                  }}
                  data-testid="send-material-item"
                >
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`kinds.${m.kind}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
