/**
 * Why a mail was not sent, in a few kinds the platform owner can act on. The mail server's own words are kept as the detail, so nobody has to guess.
 *
 * - `credentials`: the login or password (or the API key) was refused. Nothing will be sent until somebody replaces it.
 * - `quota`: the server asked to wait or said the daily limit is used up. Worth trying again; a limit lasts until tomorrow.
 * - `network`: the server could not be reached or went silent. Worth trying again.
 * - `rejected`: the server did not accept this message or this address.
 * - `config`: nothing is set up to send mail (the defaults point at a local test server).
 */
export type MailFailureKind = "credentials" | "quota" | "network" | "rejected" | "config" | "unknown";

export interface MailFailureInfo {
  kind: MailFailureKind;
  /** The server's code (535, 421 ...) or the library's (EAUTH, ETIMEDOUT ...). */
  code: string | null;
  /** The server's own words, shortened. */
  detail: string;
}

export class MailError extends Error {
  constructor(readonly info: MailFailureInfo) {
    super(`Mail not sent (${info.kind}${info.code ? ` ${info.code}` : ""}): ${info.detail}`);
    this.name = "MailError";
  }
}

/** Failures that may pass by themselves, so the send is tried again. A refused password never does. */
export const isRetryable = (k: MailFailureKind): boolean => k === "network" || k === "quota";

const cut = (s: string, n = 300) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Reads what nodemailer or Resend threw. Never includes a password: only what the other side answered. */
export function classifyMailError(e: unknown): MailFailureInfo {
  const o = (e ?? {}) as { code?: unknown; responseCode?: unknown; response?: unknown; message?: unknown; command?: unknown; name?: unknown };
  const lib = typeof o.code === "string" ? o.code : null;
  const num = typeof o.responseCode === "number" ? o.responseCode : null;
  const text = cut(typeof o.response === "string" && o.response ? o.response : typeof o.message === "string" ? o.message : String(e ?? "unknown"));
  const code = num !== null ? String(num) : lib;
  const has = (re: RegExp) => re.test(text);

  if (lib === "EAUTH" || num === 535 || num === 534 || num === 530 || has(/BadCredentials|Username and Password not accepted|authentication failed|invalid login/i)) return { kind: "credentials", code, detail: text };
  if (has(/API key is invalid|invalid api key|api_key|Unauthorized|domain is not verified|testing domains|can only send testing emails/i)) return { kind: "credentials", code, detail: text };
  if (has(/daily user sending quota|sending limit|too many (login|messages|recipients)|rate limit|quota|exceeded/i) || num === 421 || num === 450 || num === 451 || num === 452) return { kind: "quota", code, detail: text };
  if (lib === "ECONNECTION" || lib === "ETIMEDOUT" || lib === "ESOCKET" || lib === "ECONNRESET" || lib === "ECONNREFUSED" || lib === "EDNS" || lib === "ENOTFOUND" || has(/timed? ?out|ECONN|ENOTFOUND|socket hang up/i)) return { kind: "network", code, detail: text };
  if (lib === "EENVELOPE" || num === 550 || num === 551 || num === 553 || num === 554 || has(/recipient|mailbox|address.*(rejected|invalid)/i)) return { kind: "rejected", code, detail: text };
  return { kind: "unknown", code, detail: text };
}
