const f = (o) => ({ views: o });
const fragment = {
  en: f({
    repeat: "Repeat", repeatNone: "Does not repeat", repeatDaily: "Every day", repeatWeekly: "Every week", repeatBiweekly: "Every 2 weeks", repeatMonthly: "Every month", repeatCustom: "Custom rule (kept as it is)",
    repeatUntil: "Repeat until", repeatUntilHint: "Leave empty to repeat with no end.", repeatBadge: "Repeats",
    repeatEvery: "{freq, select, DAILY {Every {n} days} WEEKLY {Every {n} weeks} MONTHLY {Every {n} months} other {Repeats}}",
    repeatNext: "Next: {date}", repeatMore: "{n, plural, one {# more} other {# more}}", repeatNoEnd: "no end", repeatUntilShort: "until {date}",
    repeatSkip: "Skip this date", repeatSkipped: "Skipped dates: {n}", repeatRestore: "Restore",
    eventProblem: { until: "The end of the repetition must not be before the first date." },
  }),
  ru: f({
    repeat: "Повтор", repeatNone: "Не повторяется", repeatDaily: "Каждый день", repeatWeekly: "Каждую неделю", repeatBiweekly: "Каждые 2 недели", repeatMonthly: "Каждый месяц", repeatCustom: "Особое правило (сохраняется как есть)",
    repeatUntil: "Повторять до", repeatUntilHint: "Оставьте пустым, чтобы повторять без конца.", repeatBadge: "Повторяется",
    repeatEvery: "{freq, select, DAILY {Каждые {n} дн.} WEEKLY {Каждые {n} нед.} MONTHLY {Каждые {n} мес.} other {Повторяется}}",
    repeatNext: "Следующая: {date}", repeatMore: "ещё {n}", repeatNoEnd: "без конца", repeatUntilShort: "до {date}",
    repeatSkip: "Пропустить эту дату", repeatSkipped: "Пропущено дат: {n}", repeatRestore: "Вернуть",
    eventProblem: { until: "Конец повтора не может быть раньше первой даты." },
  }),
  pl: f({
    repeat: "Powtarzanie", repeatNone: "Nie powtarza się", repeatDaily: "Codziennie", repeatWeekly: "Co tydzień", repeatBiweekly: "Co 2 tygodnie", repeatMonthly: "Co miesiąc", repeatCustom: "Własna reguła (zostaje bez zmian)",
    repeatUntil: "Powtarzaj do", repeatUntilHint: "Zostaw puste, aby powtarzać bez końca.", repeatBadge: "Powtarza się",
    repeatEvery: "{freq, select, DAILY {Co {n} dni} WEEKLY {Co {n} tyg.} MONTHLY {Co {n} mies.} other {Powtarza się}}",
    repeatNext: "Następne: {date}", repeatMore: "jeszcze {n}", repeatNoEnd: "bez końca", repeatUntilShort: "do {date}",
    repeatSkip: "Pomiń tę datę", repeatSkipped: "Pominięte daty: {n}", repeatRestore: "Przywróć",
    eventProblem: { until: "Koniec powtarzania nie może być przed pierwszą datą." },
  }),
  uk: f({
    repeat: "Повтор", repeatNone: "Не повторюється", repeatDaily: "Щодня", repeatWeekly: "Щотижня", repeatBiweekly: "Кожні 2 тижні", repeatMonthly: "Щомісяця", repeatCustom: "Особливе правило (зберігається як є)",
    repeatUntil: "Повторювати до", repeatUntilHint: "Залиште порожнім, щоб повторювати без кінця.", repeatBadge: "Повторюється",
    repeatEvery: "{freq, select, DAILY {Кожні {n} дн.} WEEKLY {Кожні {n} тиж.} MONTHLY {Кожні {n} міс.} other {Повторюється}}",
    repeatNext: "Наступна: {date}", repeatMore: "ще {n}", repeatNoEnd: "без кінця", repeatUntilShort: "до {date}",
    repeatSkip: "Пропустити цю дату", repeatSkipped: "Пропущено дат: {n}", repeatRestore: "Повернути",
    eventProblem: { until: "Кінець повтору не може бути раніше за першу дату." },
  }),
};
export default fragment;
