"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { BOARD_STAGES, INTERESTS, parsePeopleLines, PRIORITIES, SOURCES, TEMPERATURES, type Stage, type Temp } from "@/modules/crm/people";
import { cn } from "@/lib/utils";
import { PRIORITY_ICON } from "./FunnelFields";
import { useMembers } from "./hooks";
import { useGroups } from "./useGroups";

const TEMP_ICON: Record<Temp, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };

/**
 * "List a hundred": paste or type names, one on a line, and they all go into the funnel at once with what they have in common
 * (how warm, where from, what they are interested in, who looks after them). A name already in the funnel is skipped, not doubled.
 */
export function AddPeopleDialog({ open, onClose, workspaceId, meId, defaultGroup, onAdded }: { open: boolean; onClose: () => void; workspaceId: string; meId: string; defaultGroup: string; onAdded: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const members = useMembers(workspaceId);
  const groups = useGroups(workspaceId);
  const [group, setGroup] = useState(defaultGroup);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("NEW");
  const [temp, setTemp] = useState<Temp | "">("");
  const [source, setSource] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [priority, setPriority] = useState("");
  const [owner, setOwner] = useState("me");
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setResult(null);
    setError(null);
    setGroup(defaultGroup);
  }, [open, defaultGroup]);

  const parsed = useMemo(() => parsePeopleLines(text), [text]);

  const add = useMutation({
    mutationFn: () =>
      api.post<{ created: number; skipped: string[] }>(`/api/v1/workspaces/${workspaceId}/people/bulk`, {
        people: parsed.people,
        stage,
        temperature: temp || null,
        source: source || null,
        interests: interests.length ? interests : undefined,
        country: country.trim() || null,
        groupId: group || null,
        typeTag: priority || null,
        ownerId: owner === "me" ? meId : owner,
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setText("");
      onAdded();
    },
    onError: (e) => setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error")),
  });

  return (
    <Modal open={open} onClose={onClose} title={t("addListTitle")} wide>
      {result ? (
        <div className="flex flex-col gap-3" data-testid="add-people-result">
          <p className="text-sm font-medium">{t("addedCount", { n: result.created })}</p>
          {result.skipped.length > 0 && (
            <div className="text-sm">
              <p className="text-muted-foreground">{t("skippedCount", { n: result.skipped.length })}</p>
              <p className="mt-1 max-h-24 overflow-auto text-xs text-muted-foreground">{result.skipped.join(", ")}</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>
              {t("addAnother")}
            </Button>
            <Button onClick={onClose}>{t("close")}</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (parsed.people.length === 0) return setError(t("addEmpty"));
            add.mutate();
          }}
        >
          <FormField label={t("namesLabel")} hint={t("namesHint")}>
            <textarea className={cn(textareaClass, "min-h-44")} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("namesPlaceholder")} autoFocus data-testid="people-lines" />
          </FormField>
          <p className="text-xs text-muted-foreground" data-testid="people-count">
            {parsed.people.length === 0 ? t("namesNone") : t("namesCount", { n: parsed.people.length })}
            {parsed.truncated && <span className="ml-1 text-[var(--health-yellow)]">{t("namesTruncated")}</span>}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t("field.stage")}>
              <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                {BOARD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`funnelStage.${s}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("field.temperature")}>
              <select className={selectClass} value={temp} onChange={(e) => setTemp(e.target.value as Temp | "")}>
                <option value="">—</option>
                {TEMPERATURES.map((x) => (
                  <option key={x} value={x}>
                    {TEMP_ICON[x]} {t(`temp.${x}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("field.source")}>
              <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                {SOURCES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("field.typeTag")}>
              <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="add-people-priority">
                <option value="">—</option>
                {PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {PRIORITY_ICON[x]} {t(`priority.${x}`)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("field.country")}>
              <Input value={country} maxLength={80} onChange={(e) => setCountry(e.target.value)} />
            </FormField>
            <FormField label={t("groupField")}>
              <select className={selectClass} value={group} onChange={(e) => setGroup(e.target.value)} data-testid="add-people-group">
                <option value="">{t("noGroup")}</option>
                {groups.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t("owner")}>
              <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="me">{t("mine")}</option>
                {members.data?.filter((m) => m.id !== meId).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("field.interests")}</span>
              <div className="flex flex-wrap gap-1.5">
                {INTERESTS.map((x) => (
                  <button key={x} type="button" aria-pressed={interests.includes(x)} onClick={() => setInterests((cur) => (cur.includes(x) ? cur.filter((i) => i !== x) : [...cur, x]))} className={cn("rounded-full border px-2.5 py-1 text-xs", interests.includes(x) ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={add.isPending || parsed.people.length === 0} data-testid="add-people-submit">
              {add.isPending ? t("adding") : t("addN", { n: parsed.people.length })}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
