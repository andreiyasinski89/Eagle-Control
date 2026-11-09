import { createTranslator } from "use-intl";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import pl from "../../../messages/pl.json";
import uk from "../../../messages/uk.json";

const MESSAGES = { en, ru, pl, uk } as const;
type Lang = keyof typeof MESSAGES;

/** What a notice says, as a key of the "notices" texts and its values; the words are put in the recipient's own language. */
export interface NoticeText {
  key: string;
  params?: Record<string, string | number>;
}

const lang = (locale: string | null | undefined): Lang => (locale && locale in MESSAGES ? (locale as Lang) : "en");

/**
 * The title and body of a notice in `locale` (en when unknown). A missing body text gives no body; a missing title (or a broken text)
 * gives null, and the caller keeps its English fallback.
 */
export function noticeText(locale: string | null | undefined, text: NoticeText): { title: string; body: string | null } | null {
  const l = lang(locale);
  const all = (MESSAGES[l] as unknown as { notices?: Record<string, { title?: string; body?: string }> }).notices ?? {};
  const entry = all[text.key];
  if (!entry?.title) return null;
  try {
    // The texts are looked up by a key known only at run time, so the translator is used untyped here.
    const t = createTranslator({ locale: l, messages: { n: { [text.key]: entry } } }) as unknown as (key: string, values?: Record<string, string | number>) => string;
    const params = text.params ?? {};
    return { title: t(`n.${text.key}.title`, params), body: entry.body ? t(`n.${text.key}.body`, params) : null };
  } catch {
    return null;
  }
}
