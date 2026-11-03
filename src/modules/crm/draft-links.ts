export type DraftChannel = "TELEGRAM" | "WHATSAPP" | "INSTAGRAM";

export const CHANNEL_LABEL: Record<DraftChannel, string> = { TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram" };

const MESSENGER_KEY = { TELEGRAM: "telegram", WHATSAPP: "whatsapp", INSTAGRAM: "instagram" } as const;

/** Where "open the chat" goes for a contact, or null when the card has no handle for that channel. */
export function openChatUrl(channel: DraftChannel, messengers: unknown): string | null {
  const raw = (messengers as Record<string, unknown> | null | undefined)?.[MESSENGER_KEY[channel]];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  const isPhone = /^\+?[\d\s()-]{7,}$/.test(v);
  const handle = v.replace(/^https?:\/\/(www\.)?(t\.me|instagram\.com|ig\.me\/m)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  if (channel === "WHATSAPP") return digits.length >= 7 ? `https://wa.me/${digits}` : null;
  if (channel === "TELEGRAM") return isPhone ? (digits.length >= 7 ? `https://t.me/+${digits}` : null) : /^[A-Za-z0-9_]{3,}$/.test(handle) ? `https://t.me/${handle}` : null;
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://ig.me/m/${handle}` : null;
}
