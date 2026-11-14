"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { recognitionProblem } from "@/modules/crm/voice";

// The browser's own speech recognition (Chrome, Edge, Safari): it listens while the person talks and gives the text.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const LANG: Record<string, string> = { ru: "ru-RU", en: "en-US", pl: "pl-PL", uk: "uk-UA" };

/**
 * A voice note to a person: press, talk, stop. The browser writes the words down; they are put in a note that can be corrected before saving.
 * Only speech recognition listens: on Android the microphone serves one listener at a time, and a sound recorder running alongside (as before,
 * when the audio was also kept) left recognition with no words at all. Android also ends recognition after a pause, so it is started again
 * until the person presses Stop. Where the browser cannot recognise speech, the note is typed (the keyboard's own microphone works there).
 */
/** With `open` and `onOpenChange` the window is opened from elsewhere (the "Record" menu of the card) and the own button is not drawn. */
export function VoiceNote({ workspaceId, contactId, companyId, onSaved, open: openProp, onOpenChange }: { workspaceId: string; contactId: string; companyId: string | null; onSaved: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const t = useTranslations("mobile");
  const locale = useLocale();
  const qc = useQueryClient();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : ownOpen;
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOwnOpen(v));
  const [state, setState] = useState<"idle" | "recording" | "ready" | "saving">("idle");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);
  const recog = useRef<Recognition | null>(null);
  const listening = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalText = useRef("");

  useEffect(() => setCanListen(!!recognitionCtor()), []);
  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      listening.current = false;
      stopTimer();
      recog.current?.abort();
    },
    [],
  );

  const reset = () => {
    listening.current = false;
    recog.current?.abort();
    recog.current = null;
    stopTimer();
    finalText.current = "";
    setText("");
    setSeconds(0);
    setError(null);
    setState("idle");
  };
  const close = () => {
    reset();
    setOpen(false);
  };

  function finish(problem: string | null) {
    listening.current = false;
    stopTimer();
    try {
      recog.current?.stop();
    } catch {
      /* already stopped */
    }
    setState("ready");
    if (problem) setError(problem);
  }

  function listen() {
    const R = recognitionCtor();
    if (!R) return;
    const r = new R();
    r.lang = LANG[locale] ?? "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i] as ArrayLike<{ transcript: string }> & { isFinal: boolean };
        if (res.isFinal) finalText.current += `${res[0]?.transcript ?? ""} `;
        else interim += res[0]?.transcript ?? "";
      }
      setText((finalText.current + interim).trim());
    };
    r.onerror = (e) => {
      const kind = recognitionProblem(e.error);
      if (kind === "mic") finish(t("voiceNoMic"));
      else if (kind === "network") finish(t("voiceNoNetwork"));
      // "no-speech" and "aborted" are not problems: the end handler starts listening again while recording goes on.
    };
    r.onend = () => {
      if (!listening.current) return;
      try {
        r.start(); // Android stops after a pause in speech: go on listening until Stop is pressed
      } catch {
        finish(null);
      }
    };
    recog.current = r;
    r.start();
  }

  function start() {
    setError(null);
    finalText.current = "";
    setText("");
    try {
      listening.current = true;
      listen();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((n) => n + 1), 1000);
      setState("recording");
    } catch {
      listening.current = false;
      setError(t("voiceNoMic"));
    }
  }

  function stop() {
    finish(null);
  }

  async function save() {
    // Only the words are kept (as a note on the card).
    if (!text.trim()) {
      setError(t("voiceHeardNothing"));
      return;
    }
    setState("saving");
    setError(null);
    try {
      await api.post(`/api/v1/workspaces/${workspaceId}/activities`, { type: "NOTE", subject: t("voiceNote"), body: text.trim(), contactId, companyId, completed: true });
      for (const k of ["activities", "contact", "my-day"]) void qc.invalidateQueries({ queryKey: [k] });
      onSaved();
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
      setState("ready");
    }
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  // Without speech recognition the note is typed straight away (the phone keyboard's microphone fills it in too).
  const typing = !canListen || state === "ready" || state === "saving";
  return (
    <>
      {!controlled && (
        <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setOpen(true)} data-testid="voice-note">
          <Mic className="size-4" />
          {t("voiceNote")}
        </Button>
      )}
      <Modal open={open} onClose={close} title={t("voiceNote")}>
        <div className="flex flex-col gap-3" data-testid="voice-dialog">
          {!canListen && <p className="text-sm text-muted-foreground">{t("voiceNoSpeech")}</p>}
          {canListen && state === "idle" && (
            <>
              <p className="text-sm text-muted-foreground">{t("voiceHint")}</p>
              <Button type="button" className="min-h-14 gap-2 text-base" onClick={start} data-testid="voice-start">
                <Mic className="size-5" />
                {t("voiceStart")}
              </Button>
            </>
          )}
          {state === "recording" && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium" role="status">
                <span className="size-3 animate-pulse rounded-full bg-[var(--health-red)]" aria-hidden />
                {t("voiceRecording")} <span className="tabular-nums">{mm}</span>
              </p>
              <p className="max-h-32 min-h-10 overflow-y-auto rounded-lg bg-muted p-2 text-sm" data-testid="voice-live">
                {text || <span className="text-muted-foreground">{t("voiceListening")}</span>}
              </p>
              <Button type="button" variant="outline" className="min-h-14 gap-2 text-base" onClick={stop} data-testid="voice-stop">
                <Square className="size-5" />
                {t("voiceStop")}
              </Button>
            </>
          )}
          {typing && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                {t("voiceText")}
                <textarea className={textareaClass} rows={5} value={text} placeholder={t("voiceTextEmpty")} onChange={(e) => setText(e.target.value)} data-testid="voice-text" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="min-h-11 flex-1" disabled={state === "saving" || !text.trim()} onClick={() => void save()} data-testid="voice-save">
                  {t("save")}
                </Button>
                {canListen && (
                  <Button type="button" variant="ghost" className="min-h-11" disabled={state === "saving"} onClick={reset}>
                    {t("voiceAgain")}
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger" data-testid="voice-error">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
