"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { selectClass, textareaClass } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { MessengerButtons, type MessengerPerson } from "./MessengerButtons";
import { SendMaterial } from "./SendMaterial";
import { useScriptFiller, useScripts } from "./useScripts";

/**
 * "Script of the message" in a person's card: read the text (the name is put in), change it, and press the messenger that follows:
 * read, press, send, with nothing to scroll to in between.
 */
export function ScriptBlock({ workspaceId, meId, person, stage, canWrite }: { workspaceId: string; meId: string; person: MessengerPerson; stage: string; canWrite: boolean }) {
  const t = useTranslations("messenger");
  const tc = useTranslations("crm");
  const scripts = useScripts(workspaceId);
  const fill = useScriptFiller(workspaceId, meId);
  const candidates = useMemo(() => (scripts.data ?? []).filter((s) => s.stage === stage || s.stage === null), [scripts.data, stage]);
  const [scriptId, setScriptId] = useState<string>("");
  const [text, setText] = useState("");
  const touched = useRef(false);

  // The first fitting script is put in once it is known, unless the person has already started writing their own words.
  useEffect(() => {
    if (touched.current || !candidates[0]) return;
    setScriptId(candidates[0].id);
    setText(fill(candidates[0].body, person.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fill` changes with the member list; the text is set once
  }, [candidates]);

  const pick = (id: string) => {
    const s = candidates.find((x) => x.id === id);
    setScriptId(id);
    touched.current = true;
    if (s) setText(fill(s.body, person.name));
  };

  return (
    <div className="flex flex-col gap-2" data-testid="script-block">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-medium">{t("scriptTitle")}</h3>
        {candidates.length > 0 && (
          <select className={cn(selectClass, "h-11 w-auto max-w-[60%] sm:h-9")} aria-label={t("template")} value={scriptId} onChange={(e) => pick(e.target.value)} data-testid="script-template">
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {scripts.data && candidates.length === 0 && <p className="text-xs text-muted-foreground">{tc("scriptsNoneForStage")}</p>}
      <textarea
        className={cn(textareaClass, "min-h-32")}
        value={text}
        maxLength={4000}
        placeholder={t("scriptPlaceholder")}
        aria-label={t("scriptTitle")}
        onChange={(e) => {
          touched.current = true;
          setText(e.target.value);
        }}
        data-testid="script-text"
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t("autoCopy")}</p>
        {canWrite && <SendMaterial workspaceId={workspaceId} onPick={(line) => (touched.current = true, setText((cur) => `${cur.trimEnd()}${cur.trim() ? "\n\n" : ""}${line}`.slice(0, 4000)))} />}
      </div>
      <MessengerButtons workspaceId={workspaceId} person={person} text={text} canWrite={canWrite} logActivity />
    </div>
  );
}
