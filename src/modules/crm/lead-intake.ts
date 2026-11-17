import { z } from "zod";
import { splitFullName } from "./csv";
import { normalizeTelegram } from "@/modules/account/profile";
import { normalizeEmail, normalizePhone } from "./normalize";

export interface LeadInput {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** A Telegram name without the @, lower-cased. */
  telegram: string | null;
  /** The label of the person whose link the lead came through (their referral code). */
  ref: string | null;
  company: string | null;
  website: string | null;
  message: string | null;
  amount: number | null;
  consent: boolean;
  /** Anything else the sender included, kept for the activity note. */
  extra: Record<string, string>;
}

export class LeadRejected extends Error {
  constructor(
    public readonly code: "honeypot" | "no_contact_method" | "invalid_email" | "too_large",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Field names senders actually use (Tilda, Zapier, Make, plain HTML forms), lower-cased and stripped. */
const ALIASES: Record<string, string[]> = {
  name: ["name", "fullname", "yourname", "имя", "фио", "imie", "contactname"],
  firstName: ["firstname", "fname", "givenname"],
  lastName: ["lastname", "lname", "surname", "фамилия", "nazwisko"],
  email: ["email", "mail", "emailaddress", "почта", "youremail"],
  phone: ["phone", "tel", "telephone", "mobile", "телефон", "telefon", "phonenumber"],
  telegram: ["telegram", "tg", "telegramusername", "telegramnick", "телеграм", "тг"],
  /** One box for "how to reach you": an e-mail, a phone or a Telegram name, told apart by its shape. */
  contact: ["contact", "contacts", "contactinfo", "howtocontact", "контакт", "контакты", "связь", "kontakt"],
  ref: ["ref", "referral", "refcode", "referralcode", "utmref", "метка", "реф"],
  company: ["company", "companyname", "organization", "organisation", "компания", "firma"],
  website: ["website", "site", "url", "сайт"],
  message: ["message", "comment", "comments", "text", "details", "description", "сообщение", "комментарий", "wiadomosc", "textarea"],
  amount: ["amount", "budget", "price", "sum", "бюджет", "сумма"],
  consent: ["consent", "agree", "agreement", "gdpr", "terms", "privacy", "согласие", "zgoda", "checkbox"],
};

const HONEYPOTS = ["hp", "honeypot", "website_url", "botfield", "_gotcha"];
const key = (k: string) => k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const truthy = (v: unknown) => v === true || (typeof v === "string" && ["1", "true", "on", "yes", "y", "да", "tak"].includes(v.trim().toLowerCase()));

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const rawSchema = z.record(z.unknown());

/**
 * Turns an arbitrary form/webhook payload into a lead. Throws LeadRejected for spam (filled honeypot)
 * and for payloads that cannot be followed up (no e-mail and no phone).
 */
export function parseLead(raw: unknown): LeadInput {
  const obj = rawSchema.parse(raw);
  if (JSON.stringify(obj).length > 20_000) throw new LeadRejected("too_large", "Payload is too large");

  const byKey = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) byKey.set(key(k), v);
  for (const h of HONEYPOTS) if (str(byKey.get(key(h)))) throw new LeadRejected("honeypot");

  const used = new Set<string>();
  const pick = (field: keyof typeof ALIASES): unknown => {
    for (const alias of ALIASES[field] ?? []) {
      if (byKey.has(alias)) {
        used.add(alias);
        return byKey.get(alias);
      }
    }
    return undefined;
  };

  const rawEmail = str(pick("email"));
  let email = normalizeEmail(rawEmail);
  if (rawEmail && !email) throw new LeadRejected("invalid_email");
  const phoneRaw = str(pick("phone"));
  let phone = normalizePhone(phoneRaw) ? phoneRaw : null;
  const tgRaw = str(pick("telegram"));
  let telegram = tgRaw ? (normalizeTelegram(tgRaw)?.toLowerCase() ?? null) : null;
  const contactRaw = str(pick("contact"));
  let contactLeft: string | null = null;
  if (contactRaw) {
    const c = classifyContact(contactRaw);
    if (c.kind === "email" && !email) email = c.value;
    else if (c.kind === "phone" && !phone) phone = c.value;
    else if (c.kind === "telegram" && !telegram) telegram = c.value;
    else contactLeft = contactRaw; // unrecognised, or a second way to reach them: keep it in the note
  }
  const ref = str(pick("ref"));
  // A contact box we could not read (say "Instagram anna") still reaches a person: keep the lead, the note shows it.
  if (!email && !phone && !telegram && !contactLeft) throw new LeadRejected("no_contact_method");

  let firstName = str(pick("firstName"));
  let lastName = str(pick("lastName"));
  const full = str(pick("name"));
  if (!firstName && full) {
    const s = splitFullName(full);
    firstName = s.firstName;
    lastName = lastName ?? s.lastName;
  }
  const company = str(pick("company"));
  const website = str(pick("website"));
  const message = str(pick("message"));
  const consent = truthy(pick("consent"));
  const amountRaw = str(pick("amount"));
  const amount = amountRaw ? Number(amountRaw.replace(/[^\d.,-]/g, "").replace(",", ".")) : NaN;

  const extra: Record<string, string> = {};
  if (contactLeft) extra.contact = contactLeft.slice(0, 500);
  for (const [k, v] of Object.entries(obj)) {
    const kk = key(k);
    if (used.has(kk) || HONEYPOTS.includes(kk) || kk === "idempotencykey") continue;
    const s = str(typeof v === "object" ? JSON.stringify(v) : v);
    if (s) extra[k.slice(0, 60)] = s.slice(0, 500);
  }

  return {
    firstName: firstName ?? email?.split("@")[0] ?? phone ?? (telegram ? `@${telegram}` : "Lead"),
    lastName: lastName ?? null,
    email,
    phone,
    telegram,
    ref: ref ? ref.slice(0, 40) : null,
    company,
    website,
    message,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    consent,
    extra,
  };
}

/**
 * Tells what a single "contact" box holds: an e-mail (has an @ between text), a Telegram name (starts with @ or is a t.me link,
 * or is a bare name with a digit or an underscore), or a phone (digits). Anything else is "unknown".
 */
export function classifyContact(input: string): { kind: "email" | "phone" | "telegram"; value: string } | { kind: "unknown" } {
  const v = input.trim();
  if (/^[^@\s]+@[^@\s]+$/.test(v)) {
    const email = normalizeEmail(v);
    return email ? { kind: "email", value: email } : { kind: "unknown" };
  }
  if (/^@|(^|\/\/|\.)(t|telegram)\.me\//i.test(v)) {
    const tg = normalizeTelegram(v);
    return tg ? { kind: "telegram", value: tg.toLowerCase() } : { kind: "unknown" };
  }
  if (normalizePhone(v)) return { kind: "phone", value: v };
  // A bare word counts only with a digit or an underscore in it: "Anna" or "Viber" is a name, not a Telegram account.
  if (/[a-z]/i.test(v) && /[0-9_]/.test(v)) {
    const tg = normalizeTelegram(v);
    if (tg) return { kind: "telegram", value: tg.toLowerCase() };
  }
  return { kind: "unknown" };
}

/** Plain-text activity note summarising what the sender wrote. */
export function leadNote(lead: LeadInput): string {
  const lines = [lead.message ?? ""];
  for (const [k, v] of Object.entries(lead.extra)) lines.push(`${k}: ${v}`);
  return lines.filter(Boolean).join("\n");
}
