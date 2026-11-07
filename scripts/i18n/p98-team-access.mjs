const fragment = {
  en: {
    admin: {
      teamBadge: "Team",
      teamBadgeHint: "Free team access: brought by you or by your people",
      teamTitle: "Team access (free)",
      teamState: { owner: "The platform owner.", on: "Free: switched on by hand.", off: "Paid rules: switched off by hand (also for the people they brought, unless switched on by hand).", chain: "Free: brought by you or by someone in your team.", none: "Not in the team: free plan, 14 days of Pro, then a subscription." },
      teamSet: { AUTO: "By invitation chain", ON: "Free", OFF: "Switch off" },
      teamOffConfirm: "Switch off free access for {name} and the people they brought? They get 14 days of Pro to decide; nothing is deleted.",
      teamHint: "Switching off applies to the whole branch below this person, except people switched on by hand.",
      teamChanged: "Done: {branch} people in the branch, {lost} lost free access, {gained} got it.",
    },
    billing: { teamPlan: "Pro · team", teamFree: "Free for you: you are in the MLM CRM team. No payment needed." },
  },
  ru: {
    admin: {
      teamBadge: "Команда",
      teamBadgeHint: "Бесплатный командный доступ: пришёл от вас или от ваших людей",
      teamTitle: "Командный доступ (бесплатно)",
      teamState: { owner: "Владелец платформы.", on: "Бесплатно: включено вручную.", off: "Платные правила: выключено вручную (и для тех, кого он привёл, если их не включить отдельно).", chain: "Бесплатно: пришёл от вас или от кого-то из вашей команды.", none: "Не в команде: бесплатный тариф, 14 дней Pro, дальше подписка." },
      teamSet: { AUTO: "По цепочке приглашений", ON: "Бесплатно", OFF: "Выключить" },
      teamOffConfirm: "Выключить бесплатный доступ для {name} и тех, кого он привёл? Им дадут 14 дней Pro, чтобы решить; ничего не удаляется.",
      teamHint: "Выключение действует на всю ветку ниже этого человека, кроме тех, кого вы включили вручную.",
      teamChanged: "Готово: в ветке {branch} чел., потеряли бесплатный доступ {lost}, получили {gained}.",
    },
    billing: { teamPlan: "Pro · команда", teamFree: "Для вас бесплатно: вы в команде MLM CRM. Оплата не нужна." },
  },
  pl: {
    admin: {
      teamBadge: "Zespół",
      teamBadgeHint: "Bezpłatny dostęp zespołowy: przyszedł od Ciebie lub od Twoich ludzi",
      teamTitle: "Dostęp zespołowy (bezpłatny)",
      teamState: { owner: "Właściciel platformy.", on: "Bezpłatnie: włączone ręcznie.", off: "Zasady płatne: wyłączone ręcznie (także dla osób, które przyprowadził, chyba że włączysz je osobno).", chain: "Bezpłatnie: przyszedł od Ciebie lub od kogoś z Twojego zespołu.", none: "Poza zespołem: plan darmowy, 14 dni Pro, potem subskrypcja." },
      teamSet: { AUTO: "Według łańcucha zaproszeń", ON: "Bezpłatnie", OFF: "Wyłącz" },
      teamOffConfirm: "Wyłączyć bezpłatny dostęp dla {name} i osób, które przyprowadził? Dostaną 14 dni Pro na decyzję; nic nie zostanie usunięte.",
      teamHint: "Wyłączenie obejmuje całą gałąź poniżej tej osoby, oprócz osób włączonych ręcznie.",
      teamChanged: "Gotowe: w gałęzi {branch} os., straciło bezpłatny dostęp {lost}, otrzymało {gained}.",
    },
    billing: { teamPlan: "Pro · zespół", teamFree: "Dla Ciebie bezpłatnie: jesteś w zespole MLM CRM. Płatność nie jest potrzebna." },
  },
  uk: {
    admin: {
      teamBadge: "Команда",
      teamBadgeHint: "Безкоштовний командний доступ: прийшов від вас або від ваших людей",
      teamTitle: "Командний доступ (безкоштовно)",
      teamState: { owner: "Власник платформи.", on: "Безкоштовно: увімкнено вручну.", off: "Платні правила: вимкнено вручну (і для тих, кого він привів, якщо їх не ввімкнути окремо).", chain: "Безкоштовно: прийшов від вас або від когось із вашої команди.", none: "Не в команді: безкоштовний тариф, 14 днів Pro, далі підписка." },
      teamSet: { AUTO: "За ланцюжком запрошень", ON: "Безкоштовно", OFF: "Вимкнути" },
      teamOffConfirm: "Вимкнути безкоштовний доступ для {name} і тих, кого він привів? Їм дадуть 14 днів Pro, щоб вирішити; нічого не видаляється.",
      teamHint: "Вимкнення діє на всю гілку нижче цієї людини, крім тих, кого ви ввімкнули вручну.",
      teamChanged: "Готово: у гілці {branch} осіб, втратили безкоштовний доступ {lost}, отримали {gained}.",
    },
    billing: { teamPlan: "Pro · команда", teamFree: "Для вас безкоштовно: ви в команді MLM CRM. Оплата не потрібна." },
  },
};
export default fragment;
