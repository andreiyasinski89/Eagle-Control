const TEXT: Record<string, string> = {
  ru: "Новый: ответить в течение часа",
  en: "New: reply within the hour",
  pl: "Nowy: odpowiedz w ciągu godziny",
  uk: "Новий: відповісти протягом години",
};

/** The next step written on a new lead, in the language of the person who has to answer. */
export function answerSoon(locale: string | null | undefined): string {
  return TEXT[locale ?? ""] ?? (TEXT.en as string);
}
