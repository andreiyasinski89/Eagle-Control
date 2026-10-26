"use client";

import { useEffect, useRef, useState } from "react";

type Field = { key: "name" | "email" | "phone" | "company" | "message" | "amount"; label: string; required: boolean };
interface Config {
  title: string;
  submitLabel: string;
  successMessage: string;
  consentText: string | null;
  redirectUrl: string | null;
  fields: Field[];
}

const TEXT = {
  en: { error: "Something went wrong. Please try again.", limit: "Too many attempts. Please wait a minute.", invalid: "Please check your details and try again.", sending: "Sending…" },
  ru: { error: "Что-то пошло не так. Попробуйте ещё раз.", limit: "Слишком много попыток. Подождите минуту.", invalid: "Проверьте введённые данные и повторите.", sending: "Отправка…" },
  pl: { error: "Coś poszło nie tak. Spróbuj ponownie.", limit: "Zbyt wiele prób. Odczekaj minutę.", invalid: "Sprawdź dane i spróbuj ponownie.", sending: "Wysyłanie…" },
} as const;

const INPUT = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";

/** The hosted lead form (also embeddable as an iframe). It tells the parent page its height so no scrollbar appears. */
export function PublicLeadForm({ formKey, config, sent, lang }: { formKey: string; config: Config; sent: boolean; lang: keyof typeof TEXT }) {
  const tx = TEXT[lang];
  const root = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">(sent ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.parent === window) return;
    const post = () => window.parent.postMessage({ meowlHeight: Math.ceil(el.getBoundingClientRect().height) + 24 }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const hp = (new FormData(e.currentTarget).get("hp") as string) ?? "";
    try {
      const res = await fetch(`/api/public/leads/${formKey}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ...values, consent, hp }) });
      if (!res.ok) {
        setError(res.status === 429 ? tx.limit : res.status === 422 || res.status === 400 ? tx.invalid : tx.error);
        setState("idle");
        return;
      }
      if (config.redirectUrl) window.location.href = config.redirectUrl;
      else setState("done");
    } catch {
      setError(tx.error);
      setState("idle");
    }
  }

  return (
    <div ref={root} className="mx-auto max-w-md p-3" data-testid="public-form">
      {state === "done" ? (
        <p role="status" className="rounded-md border border-border bg-card p-4 text-sm">
          {config.successMessage}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold">{config.title}</h1>
          {config.fields.map((f) => {
            const common = { id: `f-${f.key}`, name: f.key, required: f.required, value: values[f.key] ?? "", className: INPUT };
            return (
              <label key={f.key} htmlFor={common.id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {f.label}
                  {f.required && <span aria-hidden> *</span>}
                </span>
                {f.key === "message" ? (
                  <textarea {...common} rows={4} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : (
                  <input {...common} type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : f.key === "amount" ? "number" : "text"} autoComplete={f.key === "email" ? "email" : f.key === "name" ? "name" : f.key === "phone" ? "tel" : "off"} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
              </label>
            );
          })}
          {/* honeypot: invisible to people, irresistible to form-filling bots */}
          <input name="hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          {config.consentText && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              {config.consentText}
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={state === "sending"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {state === "sending" ? tx.sending : config.submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}
