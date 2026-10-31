export type Channel = "telegram" | "whatsapp" | "instagram";
export const CHANNELS: readonly Channel[] = ["telegram", "whatsapp", "instagram"];

/** What a link needs to know about a person: the phones as typed and the messenger names as typed. */
export interface MessengerContact {
  phones: readonly string[];
  messengers: Partial<Record<Channel, string | null | undefined>>;
}

/**
 * The digits of a phone number that carries its country code: written with a plus (`+48 512 345 678`) or with `00` (`0048512345678`).
 * A number without a code (`512-345-678`) gives `null`: nobody can guess whose country it is, and a chat with a wrong person is worse than no chat.
 */
export function phoneWithCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const plus = v.startsWith("+");
  let d = v.replace(/\D/g, "");
  if (!plus) {
    if (!d.startsWith("00")) return null;
    d = d.slice(2);
  }
  return d.length >= 8 && d.length <= 15 && !d.startsWith("0") ? d : null;
}

/** True when the person typed digits that are a phone but lack the code: the screen asks them to add it. */
export function lacksCountryCode(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim();
  return v !== "" && phoneWithCode(v) === null && v.replace(/\D/g, "").length >= 5;
}

const TELEGRAM_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const INSTAGRAM_NAME = /^[A-Za-z0-9._]{1,30}$/;

/** The name out of whatever was pasted: `@name`, `name`, `https://t.me/name`, `instagram.com/name/`, `https://www.instagram.com/name?igsh=…`. `null` for what is not a name. */
export function normalizeUsername(channel: "telegram" | "instagram", raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v) return null;
  v = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  v = channel === "telegram" ? v.replace(/^(?:t|telegram)\.me\//i, "") : v.replace(/^(?:instagram\.com|instagr\.am|ig\.me\/m)\//i, "").replace(/^_u\//i, "");
  v = (v.split(/[/?#\s]/)[0] ?? "").replace(/^@/, "");
  return (channel === "telegram" ? TELEGRAM_NAME : INSTAGRAM_NAME).test(v) ? v : null;
}

export interface MessengerLink {
  url: string;
  /** The link leads to this very person (their chat or profile), not to a list to choose from. */
  direct: boolean;
  /** The text is inside the link; otherwise it is only in the clipboard, to paste. */
  textInLink: boolean;
}

/** The number WhatsApp should use: the one given for WhatsApp (a number or a `wa.me` link), else the first phone of the person. */
function whatsappDigits(c: MessengerContact): string | null {
  const own = (c.messengers.whatsapp ?? "").trim();
  const fromLink = /wa\.me\/(\+?\d+)/i.exec(own)?.[1];
  return phoneWithCode(fromLink ? `+${fromLink.replace(/\D/g, "")}` : own) ?? c.phones.map(phoneWithCode).find((d): d is string => !!d) ?? null;
}

/**
 * Where a button of a messenger leads. With what we know about the person it is their chat; without it, the place to choose one:
 * Telegram and Instagram cannot take a text in a link to a person, so there the text goes by the clipboard (the caller copies it).
 */
export function buildMessengerLink(channel: Channel, contact: MessengerContact, text: string): MessengerLink {
  const body = encodeURIComponent(text);
  if (channel === "telegram") {
    const user = normalizeUsername("telegram", contact.messengers.telegram);
    if (user) return { url: `https://t.me/${user}`, direct: true, textInLink: false };
    const phone = contact.phones.map(phoneWithCode).find((d): d is string => !!d);
    if (phone) return { url: `https://t.me/+${phone}`, direct: true, textInLink: false };
    return { url: `https://t.me/share/url?url=&text=${body}`, direct: false, textInLink: true };
  }
  if (channel === "whatsapp") {
    const phone = whatsappDigits(contact);
    return phone ? { url: `https://wa.me/${phone}?text=${body}`, direct: true, textInLink: true } : { url: `https://wa.me/?text=${body}`, direct: false, textInLink: true };
  }
  const user = normalizeUsername("instagram", contact.messengers.instagram);
  return user ? { url: `https://ig.me/m/${user}`, direct: true, textInLink: false } : { url: "https://www.instagram.com/direct/inbox/", direct: false, textInLink: false };
}
