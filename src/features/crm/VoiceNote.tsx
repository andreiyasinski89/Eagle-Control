"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";

// The browser's own speech recognition (Chrome, Edge, Safari): it listens while the person talks and gives the text, with nothing sent to our server.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const LANG: Record<string, string> = { ru: "ru-RU", en: "en-US", pl: "pl-PL", uk: "uk-UA" };

/**
 * A voice note to a person: press, talk, stop. The recording is kept as an attachment of the card, and when the browser can write down speech the words
 * are put in a note (which can be corrected before saving). Without it the note is the recording alone.
 */
export function VoiceNote({ workspaceId, contactId, companyId, onSaved }: { workspaceId: string; contactId: string; companyId: string | null; onSaved: () => void }) {
  const t = useTranslations("mobile");
  const locale = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "ready" | "saving">("idle");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const recog = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalText = useRef("");

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);
  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  const reset = () => {
    cleanup();
    blob.current = null;
    chunks.current = [];
    finalText.current = "";
    setText("");
    setSeconds(0);
    setError(null);
    setState("idle");
  };
  const close = () => {
    if (state === "recording") stop();
    setOpen(false);
    reset();
  };

  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const rec = new MediaRecorder(s);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        blob.current = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        cleanup();
        setState("ready");
      };
      recorder.current = rec;
      rec.start();
      const R = recognitionCtor();
      if (R) {
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
        r.onerror = () => undefined;
        recog.current = r;
        try {
          r.start();
        } catch {
          recog.current = null;
        }
      }
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((n) => n + 1), 1000);
      setState("recording");
    } catch {
      setError(t("voiceNoMic"));
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    recog.current?.stop();
    recog.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  async function save() {
    setState("saving");
    setError(null);
    let audioFailed = false;
    const b = blob.current;
    if (b && b.size > 0) {
      try {
        const mime = (b.type || "audio/webm").split(";")[0] as string;
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const meta = { fileName: `${t("voiceFile")}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`, mime, size: b.size };
        const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>(`/api/v1/nodes/${contactId}/attachments/presign`, meta);
        const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": mime }, body: b });
        if (!put.ok) throw new Error("upload failed");
        await api.post(`/api/v1/nodes/${contactId}/attachments`, { ...meta, key });
      } catch {
        audioFailed = true;
      }
    }
    try {
      if (text.trim() || audioFailed) {
        await api.post(`/api/v1/workspaces/${workspaceId}/activities`, { type: "NOTE", subject: t("voiceNote"), body: text.trim() || null, contactId, companyId, completed: true });
      }
      for (const k of ["activities", "contact", "my-day"]) void qc.invalidateQueries({ queryKey: [k] });
      onSaved();
      if (audioFailed) {
        setError(t("voiceAudioFailed"));
        setState("ready");
        return;
      }
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
      setState("ready");
    }
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => setOpen(true)} data-testid="voice-note">
        <Mic className="size-4" />
        {t("voiceNote")}
      </Button>
      <Modal open={open} onClose={close} title={t("voiceNote")}>
        <div className="flex flex-col gap-3" data-testid="voice-dialog">
          {!supported && <p className="text-sm text-muted-foreground">{t("voiceUnsupported")}</p>}
          {supported && state === "idle" && (
            <>
              <p className="text-sm text-muted-foreground">{t("voiceHint")}</p>
              <Button type="button" className="min-h-14 gap-2 text-base" onClick={() => void start()} data-testid="voice-start">
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
              {text && <p className="max-h-32 overflow-y-auto rounded-lg bg-muted p-2 text-sm">{text}</p>}
              <Button type="button" variant="outline" className="min-h-14 gap-2 text-base" onClick={stop} data-testid="voice-stop">
                <Square className="size-5" />
                {t("voiceStop")}
              </Button>
            </>
          )}
          {(state === "ready" || state === "saving") && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                {t("voiceText")}
                <textarea className={textareaClass} rows={5} value={text} placeholder={t("voiceTextEmpty")} onChange={(e) => setText(e.target.value)} data-testid="voice-text" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="min-h-11 flex-1" disabled={state === "saving"} onClick={() => void save()} data-testid="voice-save">
                  {t("save")}
                </Button>
                <Button type="button" variant="ghost" className="min-h-11" disabled={state === "saving"} onClick={reset}>
                  {t("voiceAgain")}
                </Button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
