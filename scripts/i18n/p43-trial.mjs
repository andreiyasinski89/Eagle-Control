const fragment = {
  en: {
    billing: {
      trialBanner: "Pro trial: {n, plural, one {# day} other {# days}} left.",
      trialChoose: "Choose a plan",
      trialEnded: "The Pro trial has ended. Nothing was deleted; the Free limits apply to new items. Choose a plan to get Pro back.",
      source: {
        trial: "Pro trial until {date} ({n, plural, one {# day} other {# days}} left).",
        bonus: "Pro from bonus points until {date}.",
        gift: "Pro as a gift until {date}.",
      },
    },
  },
  ru: {
    billing: {
      trialBanner: "Пробный период Pro: осталось {n, plural, one {# день} few {# дня} many {# дней} other {# дня}}.",
      trialChoose: "Выбрать тариф",
      trialEnded: "Пробный период Pro закончился. Ничего не удалено, на новые записи действуют лимиты Free. Выберите тариф, чтобы вернуть Pro.",
      source: {
        trial: "Пробный Pro до {date} (осталось {n, plural, one {# день} few {# дня} many {# дней} other {# дня}}).",
        bonus: "Pro за бонусные баллы до {date}.",
        gift: "Pro в подарок до {date}.",
      },
    },
  },
  pl: {
    billing: {
      trialBanner: "Okres próbny Pro: zostało {n, plural, one {# dzień} few {# dni} many {# dni} other {# dnia}}.",
      trialChoose: "Wybierz plan",
      trialEnded: "Okres próbny Pro się skończył. Nic nie usunięto; dla nowych elementów obowiązują limity Free. Wybierz plan, aby odzyskać Pro.",
      source: {
        trial: "Okres próbny Pro do {date} (zostało {n, plural, one {# dzień} few {# dni} many {# dni} other {# dnia}}).",
        bonus: "Pro za punkty bonusowe do {date}.",
        gift: "Pro w prezencie do {date}.",
      },
    },
  },
};
export default fragment;
